import { NextResponse } from 'next/server';
import { buildReliabilityMeta, type AirFetchResult } from '@/lib/dailyReportDecision';
import { corsHeaders } from '@/lib/cors';

const DATA_API_URL = process.env.NEXT_PUBLIC_DATA_API_URL || 'https://epi-log-ai.vercel.app';
const FALLBACK_TEMP = 22;
const FALLBACK_HUMIDITY = 45;

// When an upstream returns this exact signature, we treat it as "unknown station" and try next candidate.
const UNKNOWN_STATION_SIGNATURE = {
  pm25_value: 65,
  pm10_value: 85,
  o3_value: 0.065,
  no2_value: 0.025,
};

const STATION_HINTS: Record<string, string[]> = {
  '성남시 분당구': ['정자동', '수내동', '운중동'],
  분당구: ['정자동', '수내동', '운중동'],
  판교동: ['운중동', '정자동'],
  세종시: ['보람동', '아름동', '한솔동', '조치원읍'],
  세종특별자치시: ['보람동', '아름동', '한솔동', '조치원읍'],
};

interface AirQualityRaw {
  sidoName?: string;
  stationName?: string;
  dataTime?: string;
  pm25_grade?: string;
  pm25_value?: number;
  pm10_grade?: string;
  pm10_value?: number;
  o3_grade?: string;
  o3_value?: number;
  no2_grade?: string;
  no2_value?: number;
  co_grade?: string;
  co_value?: number;
  so2_grade?: string;
  so2_value?: number;
  temp?: number;
  temperature?: number;
  humidity?: number;
}

interface AirQualityView {
  sidoName?: string | null;
  stationName: string;
  dataTime?: string | null;
  grade: 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD';
  value?: number;
  pm25_value?: number;
  pm10_value?: number;
  o3_value?: number;
  no2_value?: number;
  co_value?: number;
  so2_value?: number;
  temp?: number;
  humidity?: number;
  detail: {
    pm10: { grade: number; value?: number };
    pm25: { grade: number; value?: number };
    o3: { value?: number };
    no2: { value?: number };
  } | null;
}

function normalizeDongName(name: string) {
  return name.replace(/^(.+?)\d+동$/, '$1동');
}

function normalizeSubregionName(name: string) {
  // Kakao depth3 often includes numeric suffixes like `역삼1동`, `효자동1가`.
  // Normalize to maximize DB hit rate.
  return name
    .replace(/^(.+?)\d+동$/, '$1동')
    .replace(/^(.+?)\d+가$/, '$1')
    .replace(/^(.+?)\d+리$/, '$1리');
}

function buildStationCandidates(rawStation: string): string[] {
  const cleaned = rawStation.trim().replace(/\s+/g, ' ');
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (value?: string) => {
    if (!value) return;
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  add(cleaned);
  add(cleaned.replace(/\s+/g, ''));
  add(normalizeDongName(cleaned));
  add(normalizeSubregionName(cleaned));

  const tokens = cleaned.split(' ').filter(Boolean);
  for (const token of tokens) {
    add(token);
    add(normalizeDongName(token));
    add(normalizeSubregionName(token));
  }

  if (tokens.length >= 2) {
    add(tokens[tokens.length - 1]);
    add(tokens[tokens.length - 2]);
    add(`${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`);
  }

  const matchedHints = new Set<string>();
  for (const [key, hints] of Object.entries(STATION_HINTS)) {
    if (cleaned.includes(key) || tokens.includes(key)) {
      hints.forEach((hint) => matchedHints.add(hint));
    }
  }
  matchedHints.forEach((hint) => add(hint));

  return candidates;
}

function isUnknownStationSignature(data: AirQualityRaw | null): boolean {
  if (!data) return false;
  return (
    Number(data.pm25_value) === UNKNOWN_STATION_SIGNATURE.pm25_value &&
    Number(data.pm10_value) === UNKNOWN_STATION_SIGNATURE.pm10_value &&
    Math.abs(Number(data.o3_value) - UNKNOWN_STATION_SIGNATURE.o3_value) < 0.000001 &&
    Math.abs(Number(data.no2_value) - UNKNOWN_STATION_SIGNATURE.no2_value) < 0.000001
  );
}

async function fetchAirDataWithStationFallback(stationName: string): Promise<AirFetchResult> {
  const candidates = buildStationCandidates(stationName);
  let fallbackResult: { data: AirQualityRaw; resolvedStation: string } | null = null;
  const unknownSignatureCandidates: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(
        `${DATA_API_URL}/api/air-quality?stationName=${encodeURIComponent(candidate)}`,
        { cache: 'no-store' },
      );

      if (!response.ok) {
        console.error(
          '[BFF] Air API Failed:',
          response.status,
          response.statusText,
          `candidate=${candidate}`,
        );
        continue;
      }

      const parsed = (await response.json()) as AirQualityRaw;
      const resolvedStationName = parsed.stationName || candidate;
      if (!fallbackResult) {
        fallbackResult = { data: parsed, resolvedStation: resolvedStationName };
      }

      if (isUnknownStationSignature(parsed)) {
        unknownSignatureCandidates.push(candidate);
        console.warn(
          `[BFF] Unknown station signature detected for "${candidate}", trying next candidate`,
        );
        continue;
      }

      return {
        data: parsed,
        resolvedStation: resolvedStationName,
        triedStations: candidates,
        usedFallbackCandidate:
          candidate !== candidates[0] || resolvedStationName !== candidates[0],
        usedFallbackData: false,
        unknownSignatureCandidates,
      };
    } catch (error) {
      console.error('[BFF] Air API Error:', error, `candidate=${candidate}`);
    }
  }

  return {
    data: fallbackResult?.data || null,
    resolvedStation: fallbackResult?.resolvedStation || stationName,
    triedStations: candidates,
    usedFallbackCandidate: Boolean(
      fallbackResult && fallbackResult.resolvedStation !== candidates[0],
    ),
    usedFallbackData: Boolean(fallbackResult),
    unknownSignatureCandidates,
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
    o3_value: raw.o3_value,
    no2_value: raw.no2_value,
    co_value: raw.co_value,
    so2_value: raw.so2_value,
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stationName = url.searchParams.get('stationName')?.trim();
  if (!stationName) {
    return NextResponse.json(
      { error: 'Missing stationName' },
      { status: 400, headers: corsHeaders() },
    );
  }

  const airFetch = await fetchAirDataWithStationFallback(stationName);
  const airQuality = toViewAirData(airFetch.data as AirQualityRaw | null, airFetch.resolvedStation);
  const reliability = buildReliabilityMeta(stationName, airFetch, true);

  return NextResponse.json(
    {
      airQuality,
      reliability,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        ...corsHeaders(),
      },
    },
  );
}
