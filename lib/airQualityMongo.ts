import { dbConnect } from '@/lib/mongoose';

type MongoAirQualityLatestDoc = {
  sidoName?: string | null;
  stationName?: string | null;
  mangName?: string | null;
  dataTime?: string | null;
  measuredAtUtc?: string | null;
  pm10Value?: number | null;
  pm10Value24?: number | null;
  pm25Value?: number | null;
  pm25Value24?: number | null;
  o3Value?: number | null;
  no2Value?: number | null;
  coValue?: number | null;
  so2Value?: number | null;
  khaiValue?: number | null;
  khaiGrade?: string | null;
  pm10Grade?: string | null;
  pm25Grade?: string | null;
  pm10Grade1h?: string | null;
  pm25Grade1h?: string | null;
  o3Grade?: string | null;
  no2Grade?: string | null;
  coGrade?: string | null;
  so2Grade?: string | null;
  pm10Flag?: string | null;
  pm25Flag?: string | null;
  o3Flag?: string | null;
  no2Flag?: string | null;
  coFlag?: string | null;
  so2Flag?: string | null;
  temp?: number | string | null;
  temperature?: number | string | null;
  humidity?: number | string | null;
  updatedAt?: string | Date | null;
  ingestedAt?: string | Date | null;
};

type MongoLegacyAirQualityDoc = {
  sidoName?: string | null;
  stationName?: string | null;
  dataTime?: string | null;
  so2Value?: number | string | null;
  so2Grade?: string | null;
  coValue?: number | string | null;
  coGrade?: string | null;
  o3Value?: number | string | null;
  o3Grade?: string | null;
  no2Value?: number | string | null;
  no2Grade?: string | null;
  pm10Value?: number | string | null;
  pm10Grade?: string | null;
  pm25Value?: number | string | null;
  pm25Grade?: string | null;
  khaiValue?: number | string | null;
  khaiGrade?: string | null;
  temperature?: number | string | null;
  humidity?: number | string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type MongoWeatherForecastDoc = {
  sidoName?: string | null;
  stationName?: string | null;
  forecastDate?: string | null;
  forecastHour?: number | string | null;
  fcstDate?: string | null;
  fcstTime?: string | null;
  dataTime?: string | null;
  temperature?: number | string | null;
  humidity?: number | string | null;
  updatedAt?: string | Date | null;
};

export type AirQualityMongoRaw = {
  sidoName?: string | null;
  stationName?: string;
  mang_name?: string | null;
  dataTime?: string | null;
  pm25_grade?: string;
  pm25_value?: number;
  pm10_grade?: string;
  pm10_value?: number;
  pm25_value_24h?: number;
  pm10_value_24h?: number;
  pm10_grade_1h?: string;
  pm25_grade_1h?: string;
  o3_grade?: string;
  o3_value?: number;
  no2_grade?: string;
  no2_value?: number;
  co_grade?: string;
  co_value?: number;
  so2_grade?: string;
  so2_value?: number;
  khai_value?: number;
  khai_grade?: string;
  pm10_flag?: string | null;
  pm25_flag?: string | null;
  o3_flag?: string | null;
  no2_flag?: string | null;
  co_flag?: string | null;
  so2_flag?: string | null;
  temp?: number;
  humidity?: number;
};

type AirQualityMongoResult = {
  raw: AirQualityMongoRaw;
  resolvedStation: string;
  usedFallbackData: boolean;
};

type JoinedWeatherMetrics = {
  temp?: number;
  humidity?: number;
};

const KST_OFFSET_HOURS = 9;
const KST_OFFSET_MS = KST_OFFSET_HOURS * 60 * 60 * 1000;

function canonicalizeSido(value: string | null | undefined) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, '');
  if (!compact) return null;

  const rules: Array<{ canonical: string; tokens: string[] }> = [
    { canonical: '서울', tokens: ['서울특별시', '서울'] },
    { canonical: '부산', tokens: ['부산광역시', '부산'] },
    { canonical: '대구', tokens: ['대구광역시', '대구'] },
    { canonical: '인천', tokens: ['인천광역시', '인천'] },
    { canonical: '광주', tokens: ['광주광역시', '광주'] },
    { canonical: '대전', tokens: ['대전광역시', '대전'] },
    { canonical: '울산', tokens: ['울산광역시', '울산'] },
    { canonical: '세종', tokens: ['세종특별자치시', '세종시', '세종'] },
    { canonical: '경기', tokens: ['경기도', '경기'] },
    { canonical: '강원', tokens: ['강원특별자치도', '강원도', '강원'] },
    { canonical: '충북', tokens: ['충청북도', '충북'] },
    { canonical: '충남', tokens: ['충청남도', '충남'] },
    { canonical: '전북', tokens: ['전북특별자치도', '전라북도', '전북'] },
    { canonical: '전남', tokens: ['전라남도', '전남'] },
    { canonical: '경북', tokens: ['경상북도', '경북'] },
    { canonical: '경남', tokens: ['경상남도', '경남'] },
    { canonical: '제주', tokens: ['제주특별자치도', '제주도', '제주'] },
  ];

  for (const rule of rules) {
    if (rule.tokens.some((token) => compact.includes(token.replace(/\s+/g, '')))) {
      return rule.canonical;
    }
  }

  return compact;
}

function gradeTextFromNumeric(value: string | null | undefined) {
  if (!value) return undefined;
  if (value === '1') return '좋음';
  if (value === '2') return '보통';
  if (value === '3') return '나쁨';
  if (value === '4') return '매우나쁨';
  return value;
}

function parseNumeric(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseUpdatedAtMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function parseAirQualityDataTimeToUtc(raw?: string | null): Date | null {
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

function parseKmaCompactDateTimeToUtc(raw?: string | null): Date | null {
  if (!raw) return null;
  const matched = raw.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2})(\d{2})$/);
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

function parseFcstDateTimeToUtc(fcstDate?: string | null, fcstTime?: string | null): Date | null {
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
  forecastDate?: string | null,
  forecastHour?: number | string | null,
): Date | null {
  if (!forecastDate || !/^\d{8}$/.test(forecastDate)) return null;

  const parsedHour = parseNumeric(forecastHour);
  if (parsedHour == null) return null;

  const year = Number(forecastDate.slice(0, 4));
  const month = Number(forecastDate.slice(4, 6));
  const day = Number(forecastDate.slice(6, 8));
  const hour = Math.round(parsedHour);

  const utcMillis = Date.UTC(year, month - 1, day, hour - KST_OFFSET_HOURS, 0);
  return Number.isNaN(utcMillis) ? null : new Date(utcMillis);
}

function parseWeatherAtUtc(doc: MongoWeatherForecastDoc): Date | null {
  return (
    parseKmaCompactDateTimeToUtc(doc.dataTime) ||
    parseFcstDateTimeToUtc(doc.fcstDate, doc.fcstTime) ||
    parseForecastDateHourToUtc(doc.forecastDate, doc.forecastHour)
  );
}

function toKstDateQueryKey(dateUtc: Date): string {
  const kstDate = new Date(dateUtc.getTime() + KST_OFFSET_MS);
  const year = kstDate.getUTCFullYear();
  const month = `${kstDate.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${kstDate.getUTCDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function normalizeMangName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed === '미상' || trimmed === '정보없음' || trimmed === '정보 없음') return null;
  return trimmed;
}

function normalizeLegacyAirQualityDoc(doc: MongoLegacyAirQualityDoc): MongoAirQualityLatestDoc | null {
  const stationName = doc.stationName?.trim();
  const sidoName = doc.sidoName?.trim();
  const dataTime = doc.dataTime?.trim();
  if (!stationName || !sidoName || !dataTime) return null;

  const measuredAt = parseAirQualityDataTimeToUtc(dataTime);
  if (!measuredAt) return null;

  return {
    sidoName,
    stationName,
    mangName: null,
    dataTime,
    measuredAtUtc: measuredAt.toISOString(),
    pm10Value: parseNumeric(doc.pm10Value) ?? null,
    pm10Value24: null,
    pm25Value: parseNumeric(doc.pm25Value) ?? null,
    pm25Value24: null,
    o3Value: parseNumeric(doc.o3Value) ?? null,
    no2Value: parseNumeric(doc.no2Value) ?? null,
    coValue: parseNumeric(doc.coValue) ?? null,
    so2Value: parseNumeric(doc.so2Value) ?? null,
    khaiValue: parseNumeric(doc.khaiValue) ?? null,
    khaiGrade: doc.khaiGrade ?? null,
    pm10Grade: doc.pm10Grade ?? null,
    pm25Grade: doc.pm25Grade ?? null,
    pm10Grade1h: null,
    pm25Grade1h: null,
    o3Grade: doc.o3Grade ?? null,
    no2Grade: doc.no2Grade ?? null,
    coGrade: doc.coGrade ?? null,
    so2Grade: doc.so2Grade ?? null,
    pm10Flag: null,
    pm25Flag: null,
    o3Flag: null,
    no2Flag: null,
    coFlag: null,
    so2Flag: null,
    temperature: parseNumeric(doc.temperature) ?? null,
    humidity: parseNumeric(doc.humidity) ?? null,
    updatedAt: doc.updatedAt ?? doc.createdAt ?? null,
    ingestedAt: doc.updatedAt ?? doc.createdAt ?? null,
  };
}

function parseMeasuredAtMs(doc: MongoAirQualityLatestDoc): number {
  const measuredAt =
    (doc.measuredAtUtc ? new Date(doc.measuredAtUtc) : null)
    || parseAirQualityDataTimeToUtc(doc.dataTime);
  return measuredAt ? measuredAt.getTime() : 0;
}

function compareAirQualityRecency(left: MongoAirQualityLatestDoc, right: MongoAirQualityLatestDoc): number {
  const measuredDiff = parseMeasuredAtMs(right) - parseMeasuredAtMs(left);
  if (measuredDiff !== 0) return measuredDiff;
  return parseUpdatedAtMs(right.updatedAt ?? right.ingestedAt) - parseUpdatedAtMs(left.updatedAt ?? left.ingestedAt);
}

function hasMeaningfulAirMetrics(doc: MongoAirQualityLatestDoc): boolean {
  return [
    doc.pm25Value,
    doc.pm10Value,
    doc.o3Value,
    doc.no2Value,
    doc.coValue,
    doc.so2Value,
    doc.khaiValue,
  ].some((value) => parseNumeric(value) != null);
}

function toRaw(doc: MongoAirQualityLatestDoc, weather?: JoinedWeatherMetrics | null): AirQualityMongoRaw {
  return {
    sidoName: doc.sidoName ?? null,
    stationName: doc.stationName || undefined,
    mang_name: normalizeMangName(doc.mangName),
    dataTime: doc.dataTime ?? null,
    pm25_grade: gradeTextFromNumeric(doc.pm25Grade),
    pm25_value: doc.pm25Value ?? undefined,
    pm10_grade: gradeTextFromNumeric(doc.pm10Grade),
    pm10_value: doc.pm10Value ?? undefined,
    pm25_value_24h: doc.pm25Value24 ?? undefined,
    pm10_value_24h: doc.pm10Value24 ?? undefined,
    pm10_grade_1h: gradeTextFromNumeric(doc.pm10Grade1h),
    pm25_grade_1h: gradeTextFromNumeric(doc.pm25Grade1h),
    o3_grade: doc.o3Grade ?? undefined,
    o3_value: doc.o3Value ?? undefined,
    no2_grade: doc.no2Grade ?? undefined,
    no2_value: doc.no2Value ?? undefined,
    co_grade: doc.coGrade ?? undefined,
    co_value: doc.coValue ?? undefined,
    so2_grade: doc.so2Grade ?? undefined,
    so2_value: doc.so2Value ?? undefined,
    khai_value: doc.khaiValue ?? undefined,
    khai_grade: gradeTextFromNumeric(doc.khaiGrade),
    pm10_flag: doc.pm10Flag ?? null,
    pm25_flag: doc.pm25Flag ?? null,
    o3_flag: doc.o3Flag ?? null,
    no2_flag: doc.no2Flag ?? null,
    co_flag: doc.coFlag ?? null,
    so2_flag: doc.so2Flag ?? null,
    temp: parseNumeric(doc.temp) ?? parseNumeric(doc.temperature) ?? weather?.temp,
    humidity: parseNumeric(doc.humidity) ?? weather?.humidity,
  };
}

async function loadJoinedWeatherMetrics(
  candidates: string[],
  expectedSido: string | null,
): Promise<JoinedWeatherMetrics | null> {
  if (candidates.length === 0) return null;

  const conn = await dbConnect();
  const forecastDbName = process.env.WEATHER_FORECAST_DB_NAME || 'weather_forecast';
  const forecastCollectionName =
    process.env.WEATHER_FORECAST_READER_COLLECTION || 'weather_forecast_data_shadow';
  const forecastCollection = conn.connection
    .useDb(forecastDbName)
    .collection<MongoWeatherForecastDoc>(forecastCollectionName);

  const now = new Date();
  const startKey = toKstDateQueryKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const endKey = toKstDateQueryKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const normalizedExpectedSido = canonicalizeSido(expectedSido);

  const docs = await forecastCollection
    .find(
      {
        stationName: { $in: candidates },
        forecastDate: { $gte: startKey, $lte: endKey },
      },
      {
        projection: {
          _id: 0,
          sidoName: 1,
          stationName: 1,
          forecastDate: 1,
          forecastHour: 1,
          fcstDate: 1,
          fcstTime: 1,
          dataTime: 1,
          temperature: 1,
          humidity: 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ updatedAt: -1, forecastDate: 1, forecastHour: 1 })
    .limit(1200)
    .toArray();

  const nowMs = now.getTime();
  const byStation = new Map<string, Array<MongoWeatherForecastDoc & { forecastAtMs: number; updatedAtMs: number }>>();
  const dedupedForecasts = new Map<string, MongoWeatherForecastDoc & { forecastAtMs: number; updatedAtMs: number }>();

  for (const doc of docs) {
    const stationName = doc.stationName?.trim();
    if (!stationName) continue;

    if (normalizedExpectedSido) {
      const normalizedDocSido = canonicalizeSido(doc.sidoName);
      if (normalizedDocSido && normalizedDocSido !== normalizedExpectedSido) {
        continue;
      }
    }

    const temperature = parseNumeric(doc.temperature);
    const humidity = parseNumeric(doc.humidity);
    if (temperature == null && humidity == null) continue;

    const forecastAt = parseWeatherAtUtc(doc);
    if (!forecastAt) continue;

    const forecastAtMs = forecastAt.getTime();
    const updatedAtMs = parseUpdatedAtMs(doc.updatedAt);
    const dedupeKey = `${stationName}|${forecastAtMs}`;
    const existing = dedupedForecasts.get(dedupeKey);
    if (!existing || updatedAtMs > existing.updatedAtMs) {
      dedupedForecasts.set(dedupeKey, {
        ...doc,
        forecastAtMs,
        updatedAtMs,
      });
    }
  }

  for (const item of dedupedForecasts.values()) {
    const stationName = item.stationName?.trim();
    if (!stationName) continue;
    if (!byStation.has(stationName)) byStation.set(stationName, []);
    byStation.get(stationName)!.push(item);
  }

  const chooseBest = (items: Array<MongoWeatherForecastDoc & { forecastAtMs: number; updatedAtMs: number }>) =>
    items
      .slice()
      .sort((left, right) => {
        const leftDistance = Math.abs(left.forecastAtMs - nowMs);
        const rightDistance = Math.abs(right.forecastAtMs - nowMs);
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        if (left.forecastAtMs >= nowMs && right.forecastAtMs < nowMs) return -1;
        if (left.forecastAtMs < nowMs && right.forecastAtMs >= nowMs) return 1;
        return right.updatedAtMs - left.updatedAtMs;
      })[0];

  for (const candidate of candidates) {
    const items = byStation.get(candidate);
    if (!items || items.length === 0) continue;

    const best = chooseBest(items);
    if (!best) continue;

    return {
      temp: parseNumeric(best.temperature),
      humidity: parseNumeric(best.humidity),
    };
  }

  const allItems = Array.from(byStation.values()).flat();
  if (allItems.length === 0) return null;

  const best = chooseBest(allItems);
  return best
    ? {
        temp: parseNumeric(best.temperature),
        humidity: parseNumeric(best.humidity),
      }
    : null;
}

export async function loadAirQualityFromMongo(
  candidates: string[],
  expectedSido: string | null,
  dbName = process.env.AIRKOREA_DB_NAME || 'air_quality',
): Promise<AirQualityMongoResult | null> {
  if (candidates.length === 0) return null;

  try {
    const conn = await dbConnect();
    const primaryCollectionName = process.env.AIRKOREA_LATEST_COLLECTION || 'air_quality_latest';
    const primaryCollection = conn.connection
      .useDb(dbName)
      .collection<MongoAirQualityLatestDoc>(primaryCollectionName);

    const primaryDocs = await primaryCollection
      .find(
        {
          stationName: { $in: candidates },
        },
        {
          projection: {
            _id: 0,
            sidoName: 1,
            stationName: 1,
            mangName: 1,
            dataTime: 1,
            measuredAtUtc: 1,
            pm10Value: 1,
            pm10Value24: 1,
            pm25Value: 1,
            pm25Value24: 1,
            o3Value: 1,
            no2Value: 1,
            coValue: 1,
            so2Value: 1,
            khaiValue: 1,
            khaiGrade: 1,
            pm10Grade: 1,
            pm25Grade: 1,
            pm10Grade1h: 1,
            pm25Grade1h: 1,
            o3Grade: 1,
            no2Grade: 1,
            coGrade: 1,
            so2Grade: 1,
            pm10Flag: 1,
            pm25Flag: 1,
            o3Flag: 1,
            no2Flag: 1,
            coFlag: 1,
            so2Flag: 1,
            updatedAt: 1,
            ingestedAt: 1,
          },
        },
      )
      .sort({ measuredAtUtc: -1, updatedAt: -1 })
      .limit(200)
      .toArray();

    const legacyDbName = process.env.AIRKOREA_LEGACY_DB_NAME || 'airkorea';
    const legacyCollectionName = process.env.AIRKOREA_LEGACY_COLLECTION || 'air_quality_data';
    const legacyCollection = conn.connection
      .useDb(legacyDbName)
      .collection<MongoLegacyAirQualityDoc>(legacyCollectionName);

    const legacyDocs = (await legacyCollection
      .find(
        {
          stationName: { $in: candidates },
        },
        {
          projection: {
            _id: 0,
            sidoName: 1,
            stationName: 1,
            dataTime: 1,
            so2Value: 1,
            so2Grade: 1,
            coValue: 1,
            coGrade: 1,
            o3Value: 1,
            o3Grade: 1,
            no2Value: 1,
            no2Grade: 1,
            pm10Value: 1,
            pm10Grade: 1,
            pm25Value: 1,
            pm25Grade: 1,
            khaiValue: 1,
            khaiGrade: 1,
            temperature: 1,
            humidity: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      )
      .sort({ dataTime: -1, updatedAt: -1, createdAt: -1 })
      .limit(200)
      .toArray())
      .map(normalizeLegacyAirQualityDoc)
      .filter((doc): doc is MongoAirQualityLatestDoc => Boolean(doc));

    const docs = [...primaryDocs, ...legacyDocs].sort(compareAirQualityRecency);

    if (docs.length === 0) return null;

    const normalizedExpectedSido = canonicalizeSido(expectedSido);
    const byStation = new Map<string, MongoAirQualityLatestDoc[]>();

    for (const doc of docs) {
      const key = doc.stationName?.trim();
      if (!key) continue;
      if (!byStation.has(key)) byStation.set(key, []);
      byStation.get(key)!.push(doc);
    }

    for (const candidate of candidates) {
      const matches = byStation.get(candidate);
      if (!matches || matches.length === 0) continue;

      const preferred =
        matches.find((doc) => {
          if (!normalizedExpectedSido) return true;
          return canonicalizeSido(doc.sidoName) === normalizedExpectedSido;
        }) || matches[0];

      if (preferred) {
        const latestMeaningful =
          matches.find((doc) => {
            if (normalizedExpectedSido && canonicalizeSido(doc.sidoName) !== normalizedExpectedSido) {
              return false;
            }
            return hasMeaningfulAirMetrics(doc);
          })
          || matches.find((doc) => hasMeaningfulAirMetrics(doc));
        const chosen = latestMeaningful || preferred;
        const weatherCandidates = dedupeStrings([chosen.stationName || candidate, ...candidates]);
        const weather = await loadJoinedWeatherMetrics(weatherCandidates, expectedSido);
        return {
          raw: toRaw(chosen, weather),
          resolvedStation: chosen.stationName || candidate,
          usedFallbackData: chosen !== preferred,
        };
      }
    }

    const fallback = docs.find((doc) => {
      if (!normalizedExpectedSido) return true;
      return canonicalizeSido(doc.sidoName) === normalizedExpectedSido;
    }) || docs[0];

    if (!fallback) return null;

    const latestMeaningfulFallback =
      docs.find((doc) => {
        if (normalizedExpectedSido && canonicalizeSido(doc.sidoName) !== normalizedExpectedSido) {
          return false;
        }
        return hasMeaningfulAirMetrics(doc);
      })
      || docs.find((doc) => hasMeaningfulAirMetrics(doc));
    const chosenFallback = latestMeaningfulFallback || fallback;
    const weatherCandidates = dedupeStrings([chosenFallback.stationName || candidates[0], ...candidates]);
    const weather = await loadJoinedWeatherMetrics(weatherCandidates, expectedSido);

    return {
      raw: toRaw(chosenFallback, weather),
      resolvedStation: chosenFallback.stationName || candidates[0],
      usedFallbackData: chosenFallback !== fallback,
    };
  } catch (error) {
    console.error('[air-quality-mongo] failed to load latest air quality:', error);
    return null;
  }
}
