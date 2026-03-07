import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongoose';
import { corsHeaders } from '@/lib/cors';
import { buildStationCandidates } from '@/lib/stationResolution';
import { withApiObservability } from '@/lib/api-observability';
import { resolveForecastStationName } from '@/lib/weatherForecastResolution';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KST_OFFSET_HOURS = 9;
const KST_OFFSET_MS = KST_OFFSET_HOURS * 60 * 60 * 1000;
const FORECAST_WINDOW_HOURS = 48;

interface WeatherForecastRawDoc {
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
  const conn = await dbConnect();
  const forecastCollection = conn.connection
    .useDb('weather_forecast')
    .collection<WeatherForecastRawDoc>('weather_forecast_data');

  const now = new Date();
  const dateWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateWindowEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const startKey = toKstDateQueryKey(dateWindowStart);
  const endKey = toKstDateQueryKey(dateWindowEnd);

  let docs = await forecastCollection
    .find(
      {
        stationName: { $in: triedStations },
        forecastDate: { $gte: startKey, $lte: endKey },
      },
      {
        projection: {
          _id: 0,
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
        {
          stationName: { $in: triedStations },
        },
        {
          projection: {
            _id: 0,
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

    return NextResponse.json(
      {
        requestedStation: stationName,
        resolvedStation,
        triedStations: loaded.triedStations,
        windowHours: FORECAST_WINDOW_HOURS,
        items: windowed,
        timestamp: new Date().toISOString(),
      },
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
