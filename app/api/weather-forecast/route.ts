import { NextResponse } from 'next/server';
import type { Filter } from 'mongodb';
import { dbConnect } from '@/lib/mongoose';
import { corsHeaders } from '@/lib/cors';
import {
  mapAirQualityForecastDocsToView,
  type AirQualityForecastRawDoc,
  type AirQualityForecastView,
} from '@/lib/airQualityForecast';
import {
  mapLifestyleIndexDocsToView,
  type LifestyleIndexRawDoc,
  type LifestyleIndicesView,
} from '@/lib/lifestyleIndices';
import { buildStationCandidates, inferExpectedSido } from '@/lib/stationResolution';
import { withApiObservability } from '@/lib/api-observability';
import { resolveForecastStationName } from '@/lib/weatherForecastResolution';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KST_OFFSET_HOURS = 9;
const KST_OFFSET_MS = KST_OFFSET_HOURS * 60 * 60 * 1000;
const FORECAST_WINDOW_HOURS = 48;

interface WeatherForecastRawDoc {
  sidoName?: string;
  stationName?: string;
  forecastDate?: string;
  forecastHour?: number | string;
  forecastTimeLabel?: string;
  fcstDate?: string;
  fcstTime?: string;
  dataTime?: string;
  temperature?: number | string;
  humidity?: number | string;
  precipitation?: number | string | null;
  precipitationProbability?: number | string | null;
  precipitationType?: number | string | null;
  categories?: Record<string, unknown>;
  updatedAt?: Date | string;
}

interface WeatherForecastViewItem {
  forecastAt: string;
  dateKst: string;
  hourKst: number;
  timeLabel: string;
  temperature: number | null;
  humidity: number | null;
  precipitation: number | string | null;
  precipitationProbability: number | null;
  precipitationType: number | null;
  sky: number | null;
}

interface WeatherForecastViewItemWithUpdatedAt extends WeatherForecastViewItem {
  updatedAtMs: number;
}

interface WeatherForecastResponse {
  requestedStation: string;
  resolvedStation: string | null;
  triedStations: string[];
  windowHours: number;
  items: WeatherForecastViewItem[];
  airQualityForecast: AirQualityForecastView | null;
  lifestyleIndices: LifestyleIndicesView | null;
  timestamp: string;
}

function toLifestyleRegionQuery(region: string | null) {
  if (region === '경기남부' || region === '경기북부') return '경기';
  if (region === '영서' || region === '영동') return '강원';
  return region;
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDataTimeToUtc(raw?: string | null): Date | null {
  if (!raw) return null;
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!matched) return null;

  const [, year, month, day, hour, minute] = matched;
  const utcMillis = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - KST_OFFSET_HOURS,
    Number(minute),
  );
  return Number.isNaN(utcMillis) ? null : new Date(utcMillis);
}

function parseFcstDateTimeToUtc(fcstDate?: string, fcstTime?: string): Date | null {
  if (!fcstDate || !fcstTime) return null;
  if (!/^\d{8}$/.test(fcstDate)) return null;
  if (!/^\d{3,4}$/.test(fcstTime)) return null;

  const paddedTime = fcstTime.padStart(4, '0');
  const year = Number(fcstDate.slice(0, 4));
  const month = Number(fcstDate.slice(4, 6));
  const day = Number(fcstDate.slice(6, 8));
  const hour = Number(paddedTime.slice(0, 2));
  const minute = Number(paddedTime.slice(2, 4));

  const utcMillis = Date.UTC(year, month - 1, day, hour - KST_OFFSET_HOURS, minute);
  return Number.isNaN(utcMillis) ? null : new Date(utcMillis);
}

function parseForecastDateHourToUtc(
  forecastDate?: string,
  forecastHour?: number | string,
): Date | null {
  if (!forecastDate || !/^\d{8}$/.test(forecastDate)) return null;

  const parsedHour = parseNumeric(forecastHour);
  if (parsedHour === null) return null;

  const year = Number(forecastDate.slice(0, 4));
  const month = Number(forecastDate.slice(4, 6));
  const day = Number(forecastDate.slice(6, 8));
  const hour = Math.round(parsedHour);

  const utcMillis = Date.UTC(year, month - 1, day, hour - KST_OFFSET_HOURS, 0);
  return Number.isNaN(utcMillis) ? null : new Date(utcMillis);
}

function parseWeatherAtUtc(doc: WeatherForecastRawDoc): Date | null {
  return (
    parseDataTimeToUtc(doc.dataTime) ||
    parseFcstDateTimeToUtc(doc.fcstDate, doc.fcstTime) ||
    parseForecastDateHourToUtc(doc.forecastDate, doc.forecastHour)
  );
}

function formatKstDate(dateUtc: Date): string {
  const kstDate = new Date(dateUtc.getTime() + KST_OFFSET_MS);
  const year = kstDate.getUTCFullYear();
  const month = `${kstDate.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${kstDate.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function kstHour(dateUtc: Date): number {
  const kstDate = new Date(dateUtc.getTime() + KST_OFFSET_MS);
  return kstDate.getUTCHours();
}

function formatTimeLabel(hour: number, raw?: string): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return `${`${hour}`.padStart(2, '0')}:00`;
}

function parseUpdatedAtMs(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function normalizePrecipitationType(value: unknown): number | null {
  const numeric = parseNumeric(value);
  if (numeric !== null) return Math.round(numeric);

  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.includes('없음')) return 0;
  if (normalized.includes('소나기')) return 4;
  if (normalized.includes('비/눈') || normalized.includes('비눈')) return 2;
  if (normalized.includes('눈')) return 3;
  if (normalized.includes('비')) return 1;
  return null;
}

function readCategoryValue(categories: unknown, keys: string[]): unknown {
  if (!categories || typeof categories !== 'object') return null;
  const source = categories as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key] ?? source[key.toLowerCase()] ?? source[key.toUpperCase()];
    if (value !== undefined) {
      if (value && typeof value === 'object') {
        const nested = value as Record<string, unknown>;
        return nested.fcstValue ?? nested.value ?? nested.code ?? nested.raw ?? value;
      }
      return value;
    }
  }

  return null;
}

function mapRawToView(raw: WeatherForecastRawDoc): WeatherForecastViewItemWithUpdatedAt | null {
  const forecastAt = parseWeatherAtUtc(raw);
  if (!forecastAt) return null;

  const hourKst = kstHour(forecastAt);
  const precipitationFromCategory = readCategoryValue(raw.categories, ['PCP']);
  const precipitationProbabilityFromCategory = readCategoryValue(raw.categories, ['POP']);
  const precipitationTypeFromCategory = readCategoryValue(raw.categories, ['PTY']);
  const skyFromCategory = readCategoryValue(raw.categories, ['SKY']);

  const precipitationValue =
    raw.precipitation !== undefined && raw.precipitation !== null
      ? raw.precipitation
      : precipitationFromCategory;

  const precipitation =
    typeof precipitationValue === 'number'
      ? precipitationValue
      : typeof precipitationValue === 'string'
        ? precipitationValue.trim() || null
        : null;

  return {
    forecastAt: forecastAt.toISOString(),
    dateKst: formatKstDate(forecastAt),
    hourKst,
    timeLabel: formatTimeLabel(hourKst, raw.forecastTimeLabel),
    temperature: parseNumeric(raw.temperature),
    humidity: parseNumeric(raw.humidity),
    precipitation,
    precipitationProbability:
      parseNumeric(raw.precipitationProbability) ?? parseNumeric(precipitationProbabilityFromCategory),
    precipitationType:
      normalizePrecipitationType(raw.precipitationType) ??
      normalizePrecipitationType(precipitationTypeFromCategory),
    sky: parseNumeric(skyFromCategory),
    updatedAtMs: parseUpdatedAtMs(raw.updatedAt),
  };
}

function dedupeForecastItems(
  items: WeatherForecastViewItemWithUpdatedAt[],
): WeatherForecastViewItemWithUpdatedAt[] {
  const byTime = new Map<string, WeatherForecastViewItemWithUpdatedAt>();

  for (const item of items) {
    const existing = byTime.get(item.forecastAt);
    if (!existing || item.updatedAtMs > existing.updatedAtMs) {
      byTime.set(item.forecastAt, item);
    }
  }

  return Array.from(byTime.values()).sort(
    (left, right) => Date.parse(left.forecastAt) - Date.parse(right.forecastAt),
  );
}

function toKstDateQueryKey(dateUtc: Date): string {
  const kstDate = new Date(dateUtc.getTime() + KST_OFFSET_MS);
  const year = kstDate.getUTCFullYear();
  const month = `${kstDate.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${kstDate.getUTCDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

async function loadStationForecastDocs(stationName: string): Promise<{
  station: string | null;
  docs: WeatherForecastRawDoc[];
  triedStations: string[];
}> {
  const triedStations = buildStationCandidates(stationName);
  const expectedSido = inferExpectedSido(stationName);
  const conn = await dbConnect();
  const forecastDbName = process.env.WEATHER_FORECAST_DB_NAME || 'weather_forecast';
  const forecastCollectionName =
    process.env.WEATHER_FORECAST_READER_COLLECTION || 'weather_forecast_data_shadow';
  const forecastCollection = conn.connection
    .useDb(forecastDbName)
    .collection<WeatherForecastRawDoc>(forecastCollectionName);

  const now = new Date();
  const dateWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateWindowEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const startKey = toKstDateQueryKey(dateWindowStart);
  const endKey = toKstDateQueryKey(dateWindowEnd);

  const stationQuery = (expectedSido
    ? {
        stationName: { $in: triedStations },
        $or: [
          { sidoName: expectedSido },
          { sidoName: { $exists: false } },
          { sidoName: null },
        ],
      }
    : {
        stationName: { $in: triedStations },
      }) as unknown as Filter<WeatherForecastRawDoc>;

  let docs = await forecastCollection
    .find(
      {
        ...stationQuery,
        forecastDate: { $gte: startKey, $lte: endKey },
      } as Filter<WeatherForecastRawDoc>,
      {
        projection: {
          _id: 0,
          sidoName: 1,
          stationName: 1,
          forecastDate: 1,
          forecastHour: 1,
          forecastTimeLabel: 1,
          fcstDate: 1,
          fcstTime: 1,
          dataTime: 1,
          temperature: 1,
          humidity: 1,
          precipitation: 1,
          precipitationProbability: 1,
          precipitationType: 1,
          categories: 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ forecastDate: 1, forecastHour: 1, updatedAt: -1 })
    .limit(1200)
    .toArray();

  if (docs.length === 0) {
    docs = await forecastCollection
      .find(
        stationQuery,
        {
          projection: {
            _id: 0,
            sidoName: 1,
            stationName: 1,
            forecastDate: 1,
            forecastHour: 1,
            forecastTimeLabel: 1,
            fcstDate: 1,
            fcstTime: 1,
            dataTime: 1,
            temperature: 1,
            humidity: 1,
            precipitation: 1,
            precipitationProbability: 1,
            precipitationType: 1,
            categories: 1,
            updatedAt: 1,
          },
        },
      )
      .sort({ forecastDate: 1, forecastHour: 1, updatedAt: -1 })
      .limit(1200)
      .toArray();
  }

  if (docs.length === 0) {
    return { station: null, docs: [], triedStations };
  }

  const grouped = new Map<string, WeatherForecastRawDoc[]>();
  for (const doc of docs) {
    const key = doc.stationName?.trim();
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(doc);
  }

  const availableStations = Array.from(grouped.entries())
    .sort((left, right) => right[1].length - left[1].length)
    .map(([station]) => station);
  const resolvedStation = resolveForecastStationName(
    stationName,
    triedStations,
    availableStations,
  );

  return {
    station: resolvedStation,
    docs: resolvedStation ? grouped.get(resolvedStation) || [] : [],
    triedStations,
  };
}

async function loadAirQualityForecastDocs(
  requestedStation: string,
  regionHint: string | null,
): Promise<AirQualityForecastView | null> {
  const conn = await dbConnect();
  const airQualityDbName = process.env.AIRKOREA_DB_NAME || 'air_quality';
  const forecastCollectionName =
    process.env.AIRKOREA_FORECAST_READER_COLLECTION || 'air_quality_forecast_daily';
  const forecastCollection = conn.connection
    .useDb(airQualityDbName)
    .collection<AirQualityForecastRawDoc>(forecastCollectionName);

  const now = new Date();
  const forecastStart = formatKstDate(now);
  const forecastEnd = formatKstDate(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
  const docs = await forecastCollection
    .find(
      {
        forecastDate: { $gte: forecastStart, $lte: forecastEnd },
        informCode: { $in: ['PM10', 'PM25'] },
      } as Filter<AirQualityForecastRawDoc>,
      {
        projection: {
          _id: 0,
          informCode: 1,
          forecastDate: 1,
          issuedAt: 1,
          issuedAtUtc: 1,
          overall: 1,
          cause: 1,
          actionKnack: 1,
          gradesByRegion: 1,
        },
      },
    )
    .sort({ forecastDate: 1, issuedAtUtc: -1 })
    .limit(20)
    .toArray();

  return mapAirQualityForecastDocsToView(docs, requestedStation, regionHint);
}

async function loadLifestyleIndicesDocs(
  requestedStation: string,
  regionHint: string | null,
): Promise<LifestyleIndicesView | null> {
  const normalizedRegion = toLifestyleRegionQuery(regionHint || inferExpectedSido(requestedStation));
  if (!normalizedRegion) return null;

  const conn = await dbConnect();
  const forecastDbName = process.env.WEATHER_FORECAST_DB_NAME || 'weather_forecast';
  const lifestyleCollectionName =
    process.env.KMA_LIFESTYLE_READER_COLLECTION || 'lifestyle_indices_daily';
  const lifestyleCollection = conn.connection
    .useDb(forecastDbName)
    .collection<LifestyleIndexRawDoc>(lifestyleCollectionName);

  const now = new Date();
  const forecastStart = formatKstDate(now);
  const forecastEnd = formatKstDate(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
  const docs = await lifestyleCollection
    .find(
      {
        sidoName: normalizedRegion,
        forecastDate: { $gte: forecastStart, $lte: forecastEnd },
        category: { $in: ['UV', 'POLLEN'] },
      } as Filter<LifestyleIndexRawDoc>,
      {
        projection: {
          _id: 0,
          category: 1,
          pollenType: 1,
          sidoName: 1,
          forecastDate: 1,
          issuedAt: 1,
          issuedAtUtc: 1,
          valueCode: 1,
          valueLabel: 1,
          peakValue: 1,
          peakHourLabel: 1,
        },
      },
    )
    .sort({ forecastDate: 1, issuedAtUtc: -1, category: 1, pollenType: 1 })
    .limit(40)
    .toArray();

  return mapLifestyleIndexDocsToView(docs, requestedStation, regionHint);
}

function pickWindowItems(
  items: WeatherForecastViewItemWithUpdatedAt[],
): WeatherForecastViewItemWithUpdatedAt[] {
  const nowMs = Date.now();
  const endMs = nowMs + FORECAST_WINDOW_HOURS * 60 * 60 * 1000;

  let selected = items.filter((item) => {
    const itemMs = Date.parse(item.forecastAt);
    return itemMs >= nowMs && itemMs < endMs;
  });

  if (selected.length === 0) {
    selected = items.filter((item) => Date.parse(item.forecastAt) >= nowMs);
  }

  if (selected.length === 0) {
    selected = items;
  }

  return selected.slice(0, FORECAST_WINDOW_HOURS);
}

async function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function handleGet(request: Request) {
  const url = new URL(request.url);
  const stationName = url.searchParams.get('stationName')?.trim();

  if (!stationName) {
    return NextResponse.json(
      { error: 'Missing stationName' },
      { status: 400, headers: corsHeaders() },
    );
  }

  try {
    const loaded = await loadStationForecastDocs(stationName);
    const resolvedStation = loaded.station;
    const regionHint =
      loaded.docs.find((doc) => doc.stationName === resolvedStation)?.sidoName ||
      loaded.docs[0]?.sidoName ||
      inferExpectedSido(stationName);
    const mapped = dedupeForecastItems(
      loaded.docs
        .map((doc) => mapRawToView(doc))
        .filter((item): item is WeatherForecastViewItemWithUpdatedAt => item !== null),
    );
    const windowed = pickWindowItems(mapped).map((item) => ({
      forecastAt: item.forecastAt,
      dateKst: item.dateKst,
      hourKst: item.hourKst,
      timeLabel: item.timeLabel,
      temperature: item.temperature,
      humidity: item.humidity,
      precipitation: item.precipitation,
      precipitationProbability: item.precipitationProbability,
      precipitationType: item.precipitationType,
      sky: item.sky,
    }));
    const airQualityForecast = await loadAirQualityForecastDocs(stationName, regionHint || null);
    const lifestyleIndices = await loadLifestyleIndicesDocs(stationName, regionHint || null);

    const response: WeatherForecastResponse = {
      requestedStation: stationName,
      resolvedStation,
      triedStations: loaded.triedStations,
      windowHours: FORECAST_WINDOW_HOURS,
      items: windowed,
      airQualityForecast,
      lifestyleIndices,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(
      response,
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          ...corsHeaders(),
        },
      },
    );
  } catch (error) {
    console.error('[api/weather-forecast] failed:', error);
    return NextResponse.json(
      { error: 'Failed to load weather forecast' },
      { status: 500, headers: corsHeaders() },
    );
  }
}

export const OPTIONS = withApiObservability('/api/weather-forecast', 'OPTIONS', handleOptions);
export const GET = withApiObservability('/api/weather-forecast', 'GET', handleGet);
