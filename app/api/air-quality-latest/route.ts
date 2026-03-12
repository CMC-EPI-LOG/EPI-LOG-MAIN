import { NextResponse } from 'next/server';
import { buildReliabilityMeta, type AirFetchResult } from '@/lib/dailyReportDecision';
import { corsHeaders } from '@/lib/cors';
import { withApiObservability } from '@/lib/api-observability';
import { loadAirQualityFromMongo } from '@/lib/airQualityMongo';
import { applyRateLimit } from '@/lib/requestRateLimit';
import { getSharedCache, setSharedCache } from '@/lib/sharedCache';
import { buildStationCandidates, inferExpectedSido } from '@/lib/stationResolution';
const FALLBACK_TEMP = 22;
const FALLBACK_HUMIDITY = 45;
const AIR_ROUTE_CACHE_SCOPE = 'route:air-quality-latest';
const AIR_ROUTE_FRESH_MS = 3 * 60 * 1000;
const AIR_ROUTE_STALE_MS = 15 * 60 * 1000;
const AIR_ROUTE_HARD_TTL_MS = 24 * 60 * 60 * 1000;

function buildServerTimingHeader(startedAt: number): string {
  return `total;dur=${Date.now() - startedAt}`;
}

interface AirQualityRaw {
  sidoName?: string;
  stationName?: string;
  mang_name?: string | null;
  dataTime?: string;
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
  temperature?: number;
  humidity?: number;
}

interface AirQualityView {
  sidoName?: string | null;
  stationName: string;
  mang_name?: string | null;
  dataTime?: string | null;
  grade: 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD';
  value?: number;
  pm25_value?: number;
  pm10_value?: number;
  pm25_value_24h?: number;
  pm10_value_24h?: number;
  o3_value?: number;
  no2_value?: number;
  co_value?: number;
  so2_value?: number;
  khai_value?: number;
  khai_grade?: string;
  pm10_grade_1h?: string;
  pm25_grade_1h?: string;
  pm10_flag?: string | null;
  pm25_flag?: string | null;
  o3_flag?: string | null;
  no2_flag?: string | null;
  co_flag?: string | null;
  so2_flag?: string | null;
  temp?: number;
  humidity?: number;
  detail: {
    pm10: { grade: number; value?: number };
    pm25: { grade: number; value?: number };
    o3: { value?: number };
    no2: { value?: number };
  } | null;
}

async function fetchAirDataWithStationFallback(stationName: string): Promise<AirFetchResult> {
  const candidates = buildStationCandidates(stationName);
  const expectedSido = inferExpectedSido(stationName);
  const mongoResult = await loadAirQualityFromMongo(candidates, expectedSido);

  if (mongoResult) {
    return {
      data: mongoResult.raw,
      resolvedStation: mongoResult.resolvedStation,
      triedStations: candidates,
      usedFallbackCandidate: mongoResult.resolvedStation !== candidates[0],
      usedFallbackData: mongoResult.usedFallbackData,
      unknownSignatureCandidates: [],
    };
  }

  return {
    data: null,
    resolvedStation: stationName,
    triedStations: candidates,
    usedFallbackCandidate: false,
    usedFallbackData: false,
    unknownSignatureCandidates: [],
  };
}

function toViewAirData(raw: AirQualityRaw | null, fallbackStation: string): AirQualityView {
  if (!raw) {
    return {
      sidoName: null,
      stationName: fallbackStation,
      dataTime: null,
      grade: 'NORMAL',
      temp: FALLBACK_TEMP,
      humidity: FALLBACK_HUMIDITY,
      detail: null,
    };
  }

  const gradeMap: Record<string, number> = {
    좋음: 1,
    보통: 2,
    나쁨: 3,
    매우나쁨: 4,
  };

  const pm10Grade = gradeMap[raw.pm10_grade || ''] || 2;
  const pm25Grade = gradeMap[raw.pm25_grade || ''] || 2;
  const worstGrade = Math.max(pm10Grade, pm25Grade);

  return {
    sidoName: raw.sidoName ?? null,
    stationName: raw.stationName || fallbackStation,
    mang_name: raw.mang_name ?? null,
    dataTime: raw.dataTime ?? null,
    grade:
      worstGrade === 4
        ? 'VERY_BAD'
        : worstGrade === 3
          ? 'BAD'
          : worstGrade === 2
            ? 'NORMAL'
            : 'GOOD',
    value: raw.pm10_value,
    pm25_value: raw.pm25_value,
    pm10_value: raw.pm10_value,
    pm25_value_24h: raw.pm25_value_24h,
    pm10_value_24h: raw.pm10_value_24h,
    o3_value: raw.o3_value,
    no2_value: raw.no2_value,
    co_value: raw.co_value,
    so2_value: raw.so2_value,
    khai_value: raw.khai_value,
    khai_grade: raw.khai_grade,
    pm10_grade_1h: raw.pm10_grade_1h,
    pm25_grade_1h: raw.pm25_grade_1h,
    pm10_flag: raw.pm10_flag ?? null,
    pm25_flag: raw.pm25_flag ?? null,
    o3_flag: raw.o3_flag ?? null,
    no2_flag: raw.no2_flag ?? null,
    co_flag: raw.co_flag ?? null,
    so2_flag: raw.so2_flag ?? null,
    temp: raw.temp ?? raw.temperature ?? FALLBACK_TEMP,
    humidity: raw.humidity ?? FALLBACK_HUMIDITY,
    detail: {
      pm10: { grade: pm10Grade, value: raw.pm10_value },
      pm25: { grade: pm25Grade, value: raw.pm25_value },
      o3: { value: raw.o3_value },
      no2: { value: raw.no2_value },
    },
  };
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function handleGet(request: Request) {
  const startedAt = Date.now();
  const rateLimit = applyRateLimit('/api/air-quality-latest', request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: {
          ...corsHeaders(),
          'x-rate-limit-remaining': String(rateLimit.remaining),
          'x-rate-limit-reset': String(rateLimit.resetAt),
          'server-timing': buildServerTimingHeader(startedAt),
          'x-degraded': '1',
        },
      },
    );
  }

  const url = new URL(request.url);
  const stationName = url.searchParams.get('stationName')?.trim();
  if (!stationName) {
    return NextResponse.json(
      { error: 'Missing stationName' },
      {
        status: 400,
        headers: {
          ...corsHeaders(),
          'x-rate-limit-remaining': String(rateLimit.remaining),
          'x-rate-limit-reset': String(rateLimit.resetAt),
          'server-timing': buildServerTimingHeader(startedAt),
          'x-degraded': '1',
        },
      },
    );
  }

  const cacheKey = stationName.toLowerCase();
  const cached = await getSharedCache<{
    airQuality: AirQualityView;
    reliability: ReturnType<typeof buildReliabilityMeta>;
    timestamp: string;
  }>(AIR_ROUTE_CACHE_SCOPE, cacheKey);
  if (cached?.state === 'shared') {
    return NextResponse.json(cached.value, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        ...corsHeaders(),
        'x-rate-limit-remaining': String(rateLimit.remaining),
        'x-rate-limit-reset': String(rateLimit.resetAt),
        'server-timing': buildServerTimingHeader(startedAt),
        'x-bff-air-cache': 'primary=shared:hit',
        'x-degraded': cached.value.reliability.status === 'LIVE' ? '0' : '1',
      },
    });
  }

  const stale = cached ?? await getSharedCache<{
    airQuality: AirQualityView;
    reliability: ReturnType<typeof buildReliabilityMeta>;
    timestamp: string;
  }>(AIR_ROUTE_CACHE_SCOPE, cacheKey, { allowStale: true });

  try {
    const airFetch = await fetchAirDataWithStationFallback(stationName);
    const airQuality = toViewAirData(airFetch.data as AirQualityRaw | null, airFetch.resolvedStation);
    const reliability = buildReliabilityMeta(stationName, airFetch, true);
    const payload = {
      airQuality,
      reliability,
      timestamp: new Date().toISOString(),
    };

    await setSharedCache(AIR_ROUTE_CACHE_SCOPE, cacheKey, payload, {
      freshMs: AIR_ROUTE_FRESH_MS,
      staleMs: AIR_ROUTE_STALE_MS,
      hardTtlMs: AIR_ROUTE_HARD_TTL_MS,
    });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        ...corsHeaders(),
        'x-rate-limit-remaining': String(rateLimit.remaining),
        'x-rate-limit-reset': String(rateLimit.resetAt),
        'server-timing': buildServerTimingHeader(startedAt),
        'x-bff-air-cache': 'primary=api:miss',
        'x-degraded': reliability.status === 'LIVE' ? '0' : '1',
      },
    });
  } catch (error) {
    console.error('[api/air-quality-latest] failed:', error);
    if (stale?.state === 'stale') {
      return NextResponse.json(stale.value, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          ...corsHeaders(),
          'x-rate-limit-remaining': String(rateLimit.remaining),
          'x-rate-limit-reset': String(rateLimit.resetAt),
          'server-timing': buildServerTimingHeader(startedAt),
          'x-bff-air-cache': 'primary=stale:hit',
          'x-degraded': '1',
        },
      });
    }

    return NextResponse.json(
      { error: 'Failed to load air quality' },
      {
        status: 500,
        headers: {
          ...corsHeaders(),
          'x-rate-limit-remaining': String(rateLimit.remaining),
          'x-rate-limit-reset': String(rateLimit.resetAt),
          'server-timing': buildServerTimingHeader(startedAt),
          'x-bff-air-cache': 'primary=api:miss',
          'x-degraded': '1',
        },
      },
    );
  }
}

export const OPTIONS = withApiObservability('/api/air-quality-latest', 'OPTIONS', handleOptions);
export const GET = withApiObservability('/api/air-quality-latest', 'GET', handleGet);
