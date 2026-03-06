import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { buildReliabilityMeta, deriveDecisionSignals } from '@/lib/dailyReportDecision';
import { corsHeaders } from '@/lib/cors';
import { withApiObservability } from '@/lib/api-observability';
import {
  buildStationCandidates,
  inferExpectedSido,
  isSidoMismatch,
} from '@/lib/stationResolution';

const DATA_API_URL = process.env.NEXT_PUBLIC_DATA_API_URL || 'https://epi-log-ai.vercel.app';
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'https://epi-log-ai.vercel.app';
const FALLBACK_TEMP = 22;
const FALLBACK_HUMIDITY = 45;

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.round(parsed);
}

function parseNonNegativeIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return fallback;
  return Math.round(parsed);
}

const AI_BFF_CACHE_TTL_MS = parsePositiveIntEnv(process.env.DAILY_REPORT_AI_CACHE_TTL_MS, 5 * 60 * 1000);
const AI_BFF_CACHE_MAX_ENTRIES = parsePositiveIntEnv(process.env.DAILY_REPORT_AI_CACHE_MAX_ENTRIES, 200);
const AI_BFF_CACHE_STALE_MS = parsePositiveIntEnv(process.env.DAILY_REPORT_AI_CACHE_STALE_MS, 30 * 60 * 1000);
// Increase primary timeout to absorb frequent AI cold misses before fallbacking.
const AI_PRIMARY_TIMEOUT_MS = parsePositiveIntEnv(process.env.DAILY_REPORT_AI_TIMEOUT_MS, 6500);
const AI_PRIMARY_RETRY_COUNT = parseNonNegativeIntEnv(process.env.DAILY_REPORT_AI_PRIMARY_RETRY_COUNT, 2);
const AI_PRIMARY_RETRY_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.DAILY_REPORT_AI_PRIMARY_RETRY_TIMEOUT_MS,
  1600,
);
const AI_PRIMARY_RETRY_BACKOFF_MS = parseNonNegativeIntEnv(
  process.env.DAILY_REPORT_AI_PRIMARY_RETRY_BACKOFF_MS,
  150,
);
const AI_RETRY_TIMEOUT_MS = parsePositiveIntEnv(process.env.DAILY_REPORT_AI_RETRY_TIMEOUT_MS, 900);
const AIR_PRIMARY_TIMEOUT_MS = parsePositiveIntEnv(process.env.DAILY_REPORT_AIR_TIMEOUT_MS, 1200);
const AIR_FETCH_TOTAL_BUDGET_MS = parsePositiveIntEnv(process.env.DAILY_REPORT_AIR_TOTAL_BUDGET_MS, 2400);
const AIR_FETCH_MAX_CANDIDATES = parsePositiveIntEnv(process.env.DAILY_REPORT_AIR_MAX_CANDIDATES, 6);
const AIR_BFF_CACHE_TTL_MS = parsePositiveIntEnv(process.env.DAILY_REPORT_AIR_CACHE_TTL_MS, 3 * 60 * 1000);
const AIR_BFF_CACHE_MAX_ENTRIES = parsePositiveIntEnv(process.env.DAILY_REPORT_AIR_CACHE_MAX_ENTRIES, 200);
const AIR_BFF_CACHE_STALE_MS = parsePositiveIntEnv(process.env.DAILY_REPORT_AIR_CACHE_STALE_MS, 15 * 60 * 1000);

const UNKNOWN_STATION_SIGNATURE = {
  pm25_value: 65,
  pm10_value: 85,
  o3_value: 0.065,
  no2_value: 0.025,
};

export const runtime = 'nodejs';

async function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

interface ProfileInput {
  ageGroup?: string;
  condition?: string;
  conditions?: string[];
  customConditions?: string[];
}

const KNOWN_CONDITIONS = ['none', 'rhinitis', 'asthma', 'atopy'] as const;
const KNOWN_CONDITION_SET = new Set<string>(KNOWN_CONDITIONS);
type KnownCondition = (typeof KNOWN_CONDITIONS)[number];

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
  // Some data sources store temperature as `temperature` instead of `temp`.
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

interface AirFetchResult {
  data: AirQualityRaw | null;
  resolvedStation: string;
  triedStations: string[];
  usedFallbackCandidate: boolean;
  usedFallbackData: boolean;
  unknownSignatureCandidates: string[];
}

type NumericMetricKey = 'pm25_value' | 'pm10_value' | 'o3_value' | 'no2_value';

const NUMERIC_METRIC_KEYS: NumericMetricKey[] = ['pm25_value', 'pm10_value', 'o3_value', 'no2_value'];
const AI_METRIC_MISMATCH_TOLERANCE: Record<NumericMetricKey, number> = {
  pm25_value: 1,
  pm10_value: 1,
  o3_value: 0.001,
  no2_value: 0.001,
};

type AirCacheSource = 'api' | 'memory' | 'inflight' | 'stale';

interface CachedAirFetchEntry {
  data: AirFetchResult;
  expiresAt: number;
  staleUntil: number;
}

interface AirFetchWithCacheResult {
  data: AirFetchResult;
  cacheHit: boolean;
  cacheSource: AirCacheSource;
}

interface AiGuideView {
  summary: string;
  csvReason?: string;
  detail: string;
  threeReason?: string[];
  detailAnswer?: string;
  actionItems?: string[];
  activityRecommendation?: string;
  maskRecommendation?: string;
  references?: string[];
  pm25_value?: number;
  o3_value?: number;
  pm10_value?: number;
  no2_value?: number;
}

type AiCacheSource = 'api' | 'memory' | 'inflight' | 'stale';

interface CachedAiGuideEntry {
  data: AiGuideView;
  expiresAt: number;
  staleUntil: number;
}

interface AiFetchResult {
  data: AiGuideView;
  cacheHit: boolean;
  cacheSource: AiCacheSource;
  contentRecovered: boolean;
}

interface AiFetchAttemptResult extends AiFetchResult {
  attempts: number;
}

interface AiApiGuideResult {
  data: AiGuideView;
  contentRecovered: boolean;
}

const aiGuideCache = new Map<string, CachedAiGuideEntry>();
const aiGuideInFlight = new Map<string, Promise<AiApiGuideResult>>();
const airFetchCache = new Map<string, CachedAirFetchEntry>();
const airFetchInFlight = new Map<string, Promise<AirFetchResult>>();

function formatTimingLog(timing: Record<string, number>): string {
  return Object.entries(timing)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => `${key}=${value}ms`)
    .join(' ');
}

function buildServerTimingHeader(timing: Record<string, number>): string {
  return Object.entries(timing)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => `${key};dur=${value}`)
    .join(', ');
}

function buildAiCacheKey(stationName: string, aiProfile: { ageGroup: string; condition: string }): string {
  return [
    stationName.trim().toLowerCase(),
    aiProfile.ageGroup.trim().toLowerCase(),
    aiProfile.condition.trim().toLowerCase(),
  ].join('|');
}

const AI_PARTIAL_FALLBACK_MARKERS = [
  '일시적인 오류로 상세 설명을 불러오지 못했습니다',
  '일시적인 오류로 상세 분석을 불러오지 못했습니다',
  '하지만 행동 지침은 위와 같이 준수해주세요',
  '문제가 지속되면 관리자에게 문의하세요',
] as const;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function isAiPartialFallbackText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return AI_PARTIAL_FALLBACK_MARKERS.some((marker) => value.includes(marker));
}

function hasAiPartialFallback(raw: Record<string, unknown>): boolean {
  const detailCandidates = [raw.reason, raw.detail_answer, raw.detailAnswer];
  if (detailCandidates.some((candidate) => isAiPartialFallbackText(candidate))) {
    return true;
  }

  return toStringArray(raw.three_reason).some((item) => isAiPartialFallbackText(item));
}

function buildAiMetricReason(raw: Record<string, unknown>): string | null {
  const metricParts: string[] = [];

  if (typeof raw.pm25_value === 'number') metricParts.push(`초미세먼지 ${raw.pm25_value}ug/m3`);
  if (typeof raw.pm10_value === 'number') metricParts.push(`미세먼지 ${raw.pm10_value}ug/m3`);
  if (typeof raw.o3_value === 'number') metricParts.push(`오존 ${raw.o3_value}ppm`);
  if (typeof raw.no2_value === 'number') metricParts.push(`이산화질소 ${raw.no2_value}ppm`);

  if (metricParts.length === 0) return null;
  return `${metricParts.join(', ')} 기준으로 판단했어요.`;
}

function recoverAiGuideFromPartialFallback(
  raw: Record<string, unknown>,
  base: Omit<AiGuideView, 'detail' | 'threeReason' | 'detailAnswer'>,
): AiGuideView {
  const reasonItems: string[] = [];

  if (typeof base.csvReason === 'string' && base.csvReason.trim()) {
    reasonItems.push(base.csvReason.trim());
  }

  const metricReason = buildAiMetricReason(raw);
  if (metricReason) {
    reasonItems.push(metricReason);
  }

  const actionItems = Array.isArray(base.actionItems) ? base.actionItems.filter(Boolean) : [];
  if (actionItems.length > 0) {
    reasonItems.push(`우선 ${actionItems.slice(0, 2).join(', ')}부터 챙겨주세요.`);
  }

  if (reasonItems.length === 0) {
    reasonItems.push('현재 대기질 수치와 사용자 프로필을 함께 반영해 안내했어요.');
  }

  const detailAnswer = reasonItems.join(' ');
  return {
    ...base,
    detail: detailAnswer,
    detailAnswer,
    threeReason: reasonItems.slice(0, 3),
  };
}

function buildAirCacheKey(stationName: string): string {
  return stationName.trim().toLowerCase();
}

function pruneExpiredAirCache(now = Date.now()): void {
  for (const [key, entry] of airFetchCache) {
    if (entry.staleUntil <= now) {
      airFetchCache.delete(key);
    }
  }
}

function getCachedAirFetch(cacheKey: string): AirFetchWithCacheResult | null {
  pruneExpiredAirCache();
  const entry = airFetchCache.get(cacheKey);
  if (!entry) return null;

  const now = Date.now();
  let cacheSource: AirCacheSource = 'stale';
  if (entry.expiresAt > now) {
    cacheSource = 'memory';
  } else if (entry.staleUntil <= now) {
    airFetchCache.delete(cacheKey);
    return null;
  }

  airFetchCache.delete(cacheKey);
  airFetchCache.set(cacheKey, entry);
  return {
    data: entry.data,
    cacheHit: true,
    cacheSource,
  };
}

function setCachedAirFetch(cacheKey: string, data: AirFetchResult): void {
  if (!data.data) return;

  const now = Date.now();
  pruneExpiredAirCache(now);
  airFetchCache.set(cacheKey, {
    data,
    expiresAt: now + AIR_BFF_CACHE_TTL_MS,
    staleUntil: now + AIR_BFF_CACHE_STALE_MS,
  });

  while (airFetchCache.size > AIR_BFF_CACHE_MAX_ENTRIES) {
    const oldestKey = airFetchCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    airFetchCache.delete(oldestKey);
  }
}

function pruneExpiredAiCache(now = Date.now()): void {
  for (const [key, entry] of aiGuideCache) {
    if (entry.staleUntil <= now) {
      aiGuideCache.delete(key);
    }
  }
}

function getCachedAiGuide(
  cacheKey: string,
  options?: { allowStale?: boolean },
): { data: AiGuideView; source: 'memory' | 'stale' } | null {
  const allowStale = options?.allowStale ?? false;
  pruneExpiredAiCache();
  const entry = aiGuideCache.get(cacheKey);
  if (!entry) return null;
  const now = Date.now();
  if (entry.staleUntil <= now) {
    aiGuideCache.delete(cacheKey);
    return null;
  }
  if (!allowStale && entry.expiresAt <= now) {
    return null;
  }

  // Refresh insertion order for basic LRU behavior.
  aiGuideCache.delete(cacheKey);
  aiGuideCache.set(cacheKey, entry);
  return {
    data: entry.data,
    source: entry.expiresAt > now ? 'memory' : 'stale',
  };
}

function isCacheableAiGuide(data: AiGuideView): boolean {
  const summary = data.summary || '';
  const detail = data.detail || '';
  if (summary.includes('설정 오류') || detail.includes('설정 오류')) return false;
  if (summary.includes('잠시 쉬고') || detail.includes('잠시 쉬고')) return false;
  if (isAiPartialFallbackText(detail)) return false;
  if ((data.threeReason || []).some((reason) => isAiPartialFallbackText(reason))) return false;
  return true;
}

function setCachedAiGuide(cacheKey: string, data: AiGuideView): void {
  if (!isCacheableAiGuide(data)) return;

  const now = Date.now();
  pruneExpiredAiCache(now);
  aiGuideCache.set(cacheKey, {
    data,
    expiresAt: now + AI_BFF_CACHE_TTL_MS,
    staleUntil: now + AI_BFF_CACHE_STALE_MS,
  });

  while (aiGuideCache.size > AI_BFF_CACHE_MAX_ENTRIES) {
    const oldestKey = aiGuideCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    aiGuideCache.delete(oldestKey);
  }
}

function formatAiCacheState(cacheState: { source: AiCacheSource; hit: boolean }): string {
  return `${cacheState.source}:${cacheState.hit ? 'hit' : 'miss'}`;
}

function formatAirCacheState(cacheState: { source: AirCacheSource; hit: boolean }): string {
  return `${cacheState.source}:${cacheState.hit ? 'hit' : 'miss'}`;
}


async function parseRequestBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mapProfileToAiSchema(profile: ProfileInput) {
  const aiAge = profile.ageGroup || 'elementary_low';
  const knownConditions = normalizeKnownConditions(profile);
  const primaryCondition = knownConditions.find((condition) => condition !== 'none') || 'none';

  let aiCondition = 'general';
  if (primaryCondition === 'asthma') aiCondition = 'asthma';
  else if (primaryCondition === 'rhinitis') aiCondition = 'rhinitis';
  else if (primaryCondition === 'atopy') aiCondition = 'atopy';
  else if (primaryCondition === 'none') aiCondition = 'general';

  return {
    ageGroup: aiAge,
    condition: aiCondition,
  };
}

function normalizeKnownConditions(profile: ProfileInput): KnownCondition[] {
  const candidates = [
    ...(Array.isArray(profile.conditions) ? profile.conditions : []),
    ...(typeof profile.condition === 'string' ? [profile.condition] : []),
  ]
    .map((value) => value.trim().toLowerCase())
    .filter((value) => KNOWN_CONDITION_SET.has(value)) as KnownCondition[];

  const deduped = Array.from(new Set<KnownCondition>(candidates));
  const withoutNone = deduped.filter((value) => value !== 'none');
  return withoutNone.length > 0 ? withoutNone : deduped;
}

function normalizeCustomConditions(profile: ProfileInput): string[] {
  if (!Array.isArray(profile.customConditions)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const condition of profile.customConditions) {
    if (typeof condition !== 'string') continue;
    const trimmed = condition.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized.slice(0, 5);
}

function normalizeProfileInput(profile?: ProfileInput): Required<Pick<ProfileInput, 'ageGroup' | 'condition' | 'conditions' | 'customConditions'>> {
  const ageGroup = profile?.ageGroup || 'elementary_low';
  const customConditions = normalizeCustomConditions(profile || {});
  let conditions = normalizeKnownConditions(profile || {});

  if (customConditions.length > 0) {
    conditions = conditions.filter((condition) => condition !== 'none');
  }
  if (conditions.length === 0 && customConditions.length === 0) {
    conditions = ['none'];
  }

  const condition = conditions.find((item) => item !== 'none') || 'none';

  return {
    ageGroup,
    condition,
    conditions,
    customConditions,
  };
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

function isUnknownMetricSignature(
  data:
    | Pick<AirQualityRaw, 'pm25_value' | 'pm10_value' | 'o3_value' | 'no2_value'>
    | Pick<AiGuideView, 'pm25_value' | 'pm10_value' | 'o3_value' | 'no2_value'>
    | null
    | undefined,
): boolean {
  if (!data) return false;
  return (
    Number(data.pm25_value) === UNKNOWN_STATION_SIGNATURE.pm25_value &&
    Number(data.pm10_value) === UNKNOWN_STATION_SIGNATURE.pm10_value &&
    Math.abs(Number(data.o3_value) - UNKNOWN_STATION_SIGNATURE.o3_value) < 0.000001 &&
    Math.abs(Number(data.no2_value) - UNKNOWN_STATION_SIGNATURE.no2_value) < 0.000001
  );
}

function toFiniteMetric(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function hasAiMetricMismatch(aiData: AiGuideView | null, airData: AirQualityRaw | null): boolean {
  if (!aiData || !airData) return false;

  for (const metricKey of NUMERIC_METRIC_KEYS) {
    const aiValue = toFiniteMetric(aiData[metricKey]);
    const airValue = toFiniteMetric(airData[metricKey]);
    if (aiValue == null || airValue == null) continue;

    const tolerance = AI_METRIC_MISMATCH_TOLERANCE[metricKey];
    if (Math.abs(aiValue - airValue) > tolerance) {
      return true;
    }
  }

  return false;
}

async function fetchAirDataWithStationFallback(stationName: string): Promise<AirFetchResult> {
  const generatedCandidates = buildStationCandidates(stationName);
  const candidates = generatedCandidates.slice(0, AIR_FETCH_MAX_CANDIDATES);
  if (generatedCandidates.length > candidates.length) {
    console.warn(
      `[BFF] Air candidate list truncated: requested=${generatedCandidates.length} using=${candidates.length}`,
    );
  }

  const expectedSido = inferExpectedSido(stationName);
  const fetchStartedAt = Date.now();
  let fallbackResult: { data: AirQualityRaw; resolvedStation: string; candidate: string } | null = null;
  const unknownSignatureCandidates: string[] = [];

  for (const candidate of candidates) {
    const elapsed = Date.now() - fetchStartedAt;
    if (elapsed >= AIR_FETCH_TOTAL_BUDGET_MS) {
      console.warn(
        `[BFF] Air fetch budget exceeded: budget=${AIR_FETCH_TOTAL_BUDGET_MS}ms tried=${candidate}`,
      );
      break;
    }

    const remainingBudgetMs = AIR_FETCH_TOTAL_BUDGET_MS - elapsed;
    const timeoutMs = Math.max(200, Math.min(AIR_PRIMARY_TIMEOUT_MS, remainingBudgetMs));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${DATA_API_URL}/api/air-quality?stationName=${encodeURIComponent(candidate)}`,
        {
          cache: 'no-store',
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        console.error('[BFF] Air API Failed:', response.status, response.statusText, `candidate=${candidate}`);
        continue;
      }

      const parsed = (await response.json()) as AirQualityRaw;
      const resolvedStationName = parsed.stationName || candidate;

      if (isSidoMismatch(expectedSido, parsed.sidoName ?? null)) {
        console.warn(
          `[BFF] Sido mismatch for candidate "${candidate}" (expected=${expectedSido}, resolved=${parsed.sidoName}), skipping`,
        );
        continue;
      }

      if (!fallbackResult) {
        fallbackResult = { data: parsed, resolvedStation: resolvedStationName, candidate };
      }

      if (isUnknownStationSignature(parsed)) {
        unknownSignatureCandidates.push(candidate);
        console.warn(`[BFF] Unknown station signature detected for "${candidate}", trying next candidate`);
        continue;
      }

      return {
        data: parsed,
        resolvedStation: resolvedStationName,
        triedStations: candidates,
        usedFallbackCandidate: candidate !== candidates[0],
        usedFallbackData: false,
        unknownSignatureCandidates,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`[BFF] Air API Timeout: candidate=${candidate} timeoutMs=${timeoutMs}`);
      } else {
        console.error('[BFF] Air API Error:', error, `candidate=${candidate}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    data: fallbackResult?.data || null,
    resolvedStation: fallbackResult?.resolvedStation || stationName,
    triedStations: candidates,
    usedFallbackCandidate: Boolean(fallbackResult && fallbackResult.candidate !== candidates[0]),
    usedFallbackData: Boolean(fallbackResult),
    unknownSignatureCandidates,
  };
}

async function fetchAirData(stationName: string): Promise<AirFetchWithCacheResult> {
  const cacheKey = buildAirCacheKey(stationName);
  const cached = getCachedAirFetch(cacheKey);
  if (cached && cached.cacheSource === 'memory') {
    return cached;
  }

  const inFlight = airFetchInFlight.get(cacheKey);
  if (inFlight) {
    const data = await inFlight;
    return {
      data,
      cacheHit: true,
      cacheSource: 'inflight',
    };
  }

  const stale = cached && cached.cacheSource === 'stale' ? cached.data : null;
  const requestPromise = fetchAirDataWithStationFallback(stationName)
    .then((data) => {
      setCachedAirFetch(cacheKey, data);
      return data;
    })
    .finally(() => {
      airFetchInFlight.delete(cacheKey);
    });

  airFetchInFlight.set(cacheKey, requestPromise);
  try {
    const data = await requestPromise;
    if (!data.data && stale) {
      return {
        data: stale,
        cacheHit: true,
        cacheSource: 'stale',
      };
    }

    return {
      data,
      cacheHit: false,
      cacheSource: 'api',
    };
  } catch (error) {
    if (stale) {
      console.warn(`[BFF] Air API failed, using stale cache: station=${stationName}`);
      return {
        data: stale,
        cacheHit: true,
        cacheSource: 'stale',
      };
    }
    throw error;
  }
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
    grade: worstGrade === 4 ? 'VERY_BAD' : worstGrade === 3 ? 'BAD' : worstGrade === 2 ? 'NORMAL' : 'GOOD',
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

async function fetchAiDataFromApi(
  stationName: string,
  aiProfile: { ageGroup: string; condition: string },
  timeoutMs: number,
): Promise<AiApiGuideResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${AI_API_URL}/api/advice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stationName,
        userProfile: aiProfile,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AI API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`AI API Failed: ${response.status} ${response.statusText}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const csvReason = typeof raw.csv_reason === 'string'
    ? raw.csv_reason
    : (typeof raw.csvReason === 'string'
      ? raw.csvReason
      : (typeof raw.reason === 'string' ? raw.reason : undefined));
  const detailAnswer = typeof raw.detail_answer === 'string'
    ? raw.detail_answer
    : (typeof raw.detailAnswer === 'string'
      ? raw.detailAnswer
      : (typeof raw.reason === 'string' ? raw.reason : undefined));
  const detailText = detailAnswer || 'AI 설명을 준비 중이에요.';

  if (
    raw.decision === 'Error' ||
    (typeof raw.reason === 'string' && raw.reason.includes('Error code:'))
  ) {
    console.error('[BFF] AI Business Logic Error:', raw.reason);
    return {
      data: {
        summary: 'AI 서버 설정 오류가 발생했어요 😅',
        detail: '백엔드 OpenAI 모델 설정(Temperature)을 확인해주세요.',
        maskRecommendation: '확인 필요',
        activityRecommendation: '확인 필요',
      } satisfies AiGuideView,
      contentRecovered: false,
    };
  }

  const baseGuide = {
    summary: typeof raw.decision === 'string' ? raw.decision : '오늘의 가이드를 준비 중이에요.',
    csvReason,
    actionItems: Array.isArray(raw.actionItems) ? (raw.actionItems as string[]) : [],
    activityRecommendation: typeof raw.decision === 'string' ? raw.decision : '확인 필요',
    maskRecommendation: 'KF80 권장',
    references: Array.isArray(raw.references) ? (raw.references as string[]) : [],
    pm25_value: typeof raw.pm25_value === 'number' ? raw.pm25_value : undefined,
    o3_value: typeof raw.o3_value === 'number' ? raw.o3_value : undefined,
    pm10_value: typeof raw.pm10_value === 'number' ? raw.pm10_value : undefined,
    no2_value: typeof raw.no2_value === 'number' ? raw.no2_value : undefined,
  } satisfies Omit<AiGuideView, 'detail' | 'threeReason' | 'detailAnswer'>;

  if (hasAiPartialFallback(raw)) {
    console.warn(
      `[BFF] AI partial fallback detected: station=${stationName} `
        + `ageGroup=${aiProfile.ageGroup} condition=${aiProfile.condition}`,
    );
    return {
      data: recoverAiGuideFromPartialFallback(raw, baseGuide),
      contentRecovered: true,
    };
  }

  return {
    data: {
      ...baseGuide,
      detail: detailText,
      threeReason: toStringArray(raw.three_reason),
      detailAnswer,
    } satisfies AiGuideView,
    contentRecovered: false,
  };
}

function isAiRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  if (message.includes('timeout')) return true;
  if (message.includes('fetch failed')) return true;
  if (message.includes('network')) return true;

  const statusCode = getAiStatusCodeFromError(error);
  if (statusCode == null) return false;
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function getAiStatusCodeFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;

  const statusMatch = error.message.match(/AI API Failed:\s*(\d{3})/i);
  if (!statusMatch) return null;

  const statusCode = Number(statusMatch[1]);
  if (!Number.isFinite(statusCode)) return null;
  return statusCode;
}

function isAiNonRetryableClientError(error: unknown): boolean {
  const statusCode = getAiStatusCodeFromError(error);
  if (statusCode == null) return false;
  return statusCode >= 400 && statusCode < 500 && statusCode !== 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchAiData(
  stationName: string,
  aiProfile: { ageGroup: string; condition: string },
  timeoutMs: number,
): Promise<AiFetchResult> {
  const cacheKey = buildAiCacheKey(stationName, aiProfile);
  const cached = getCachedAiGuide(cacheKey);
  if (cached) {
    return {
      data: cached.data,
      cacheHit: true,
      cacheSource: cached.source,
      contentRecovered: false,
    };
  }

  const inFlight = aiGuideInFlight.get(cacheKey);
  if (inFlight) {
    const result = await inFlight;
    return {
      data: result.data,
      cacheHit: true,
      cacheSource: 'inflight',
      contentRecovered: result.contentRecovered,
    };
  }

  const requestPromise = fetchAiDataFromApi(stationName, aiProfile, timeoutMs)
    .then((result) => {
      if (!result.contentRecovered) {
        setCachedAiGuide(cacheKey, result.data);
      }
      return result;
    })
    .finally(() => {
      aiGuideInFlight.delete(cacheKey);
    });

  aiGuideInFlight.set(cacheKey, requestPromise);
  const result = await requestPromise;
  return {
    data: result.data,
    cacheHit: false,
    cacheSource: 'api',
    contentRecovered: result.contentRecovered,
  };
}

async function fetchAiDataWithRetry(
  stationName: string,
  aiProfile: { ageGroup: string; condition: string },
  options: {
    primaryTimeoutMs: number;
    retryTimeoutMs: number;
    retryCount: number;
    retryBackoffMs: number;
  },
): Promise<AiFetchAttemptResult> {
  const maxAttempts = Math.max(1, options.retryCount + 1);
  let lastError: unknown;
  let lastRecoveredContent: AiFetchResult | null = null;
  const cacheKey = buildAiCacheKey(stationName, aiProfile);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const timeoutMs = attempt === 0 ? options.primaryTimeoutMs : options.retryTimeoutMs;

    try {
      const fetched = await fetchAiData(stationName, aiProfile, timeoutMs);
      if (fetched.contentRecovered) {
        lastRecoveredContent = fetched;
        const canRetryRecovered = attempt < maxAttempts - 1;
        if (canRetryRecovered) {
          const backoffMs = options.retryBackoffMs * (attempt + 1) * (attempt + 1);
          console.warn(
            `[BFF] AI partial fallback retry scheduled: attempt=${attempt + 1} `
              + `timeoutMs=${options.retryTimeoutMs} backoffMs=${backoffMs}`,
          );
          if (backoffMs > 0) {
            await sleep(backoffMs);
          }
          continue;
        }
      }

      return {
        ...fetched,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts - 1 && isAiRetryableError(error);
      if (!canRetry) {
        const stale = getCachedAiGuide(cacheKey, { allowStale: true });
        if (stale?.source === 'stale') {
          console.warn(
            `[BFF] AI stale cache fallback: station=${stationName} `
              + `ageGroup=${aiProfile.ageGroup} condition=${aiProfile.condition} reason=${String(error)}`,
          );
          return {
            data: stale.data,
            cacheHit: true,
            cacheSource: 'stale',
            contentRecovered: false,
            attempts: attempt + 1,
          };
        }
        if (lastRecoveredContent) {
          return {
            ...lastRecoveredContent,
            attempts: attempt + 1,
          };
        }
        throw error;
      }

      const backoffMs = options.retryBackoffMs * (attempt + 1) * (attempt + 1);
      console.warn(
        `[BFF] AI primary retry scheduled: attempt=${attempt + 1} `
          + `timeoutMs=${options.retryTimeoutMs} backoffMs=${backoffMs} reason=${String(error)}`,
      );
      if (backoffMs > 0) {
        await sleep(backoffMs);
      }
    }
  }

  if (lastRecoveredContent) {
    return {
      ...lastRecoveredContent,
      attempts: maxAttempts,
    };
  }

  throw lastError instanceof Error ? lastError : new Error('AI API retry attempts exhausted');
}

async function handlePost(request: Request) {
  const requestStartedAt = Date.now();
  const timing: Record<string, number> = {};

  try {
    const requestParseStartedAt = Date.now();
    const requestBody = await parseRequestBody(request);
    timing.requestParseMs = Date.now() - requestParseStartedAt;
    const stationName = typeof requestBody.stationName === 'string' ? requestBody.stationName : undefined;
    const profile =
      typeof requestBody.profile === 'object' && requestBody.profile !== null
        ? (requestBody.profile as ProfileInput)
        : undefined;

    const requestedStation = stationName || '강남구';
    const finalProfile = normalizeProfileInput(profile);
    const aiProfile = mapProfileToAiSchema(finalProfile);

    Sentry.setTag('station.requested', requestedStation);
    Sentry.setContext('profile', {
      ageGroup: finalProfile.ageGroup,
      condition: finalProfile.condition,
      conditions: finalProfile.conditions,
      customConditions: finalProfile.customConditions,
    });

    console.log(`[BFF] Requested station: ${requestedStation}`);
    console.log('[BFF] AI Profile Payload:', aiProfile);
    console.log(`[BFF] API targets: data=${DATA_API_URL} ai=${AI_API_URL}`);

    // P0: 병렬 호출로 지연 완화 (air/ai를 동시에 시작)
    const airFetchStartedAt = Date.now();
    const aiPrimaryStartedAt = Date.now();
    const [airSettled, aiSettled] = await Promise.allSettled([
      fetchAirData(requestedStation).finally(() => {
        timing.airFetchMs = Date.now() - airFetchStartedAt;
      }),
      fetchAiDataWithRetry(requestedStation, aiProfile, {
        primaryTimeoutMs: AI_PRIMARY_TIMEOUT_MS,
        retryTimeoutMs: AI_PRIMARY_RETRY_TIMEOUT_MS,
        retryCount: AI_PRIMARY_RETRY_COUNT,
        retryBackoffMs: AI_PRIMARY_RETRY_BACKOFF_MS,
      }).finally(() => {
        timing.aiPrimaryMs = Date.now() - aiPrimaryStartedAt;
      }),
    ]);

    let airPrimaryCache = { source: 'api', hit: false } as { source: AirCacheSource; hit: boolean };
    if (airSettled.status === 'fulfilled') {
      airPrimaryCache = {
        source: airSettled.value.cacheSource,
        hit: airSettled.value.cacheHit,
      };
    }

    const airFetch: AirFetchResult =
      airSettled.status === 'fulfilled'
        ? airSettled.value.data
        : {
            data: null,
            resolvedStation: requestedStation,
            triedStations: [requestedStation],
            usedFallbackCandidate: false,
            usedFallbackData: false,
            unknownSignatureCandidates: [],
          };

    if (airSettled.status !== 'fulfilled') {
      console.error('[BFF] Air fetch failed:', airSettled.reason);
      Sentry.withScope((scope) => {
        scope.setTag('fetch.phase', 'air');
        scope.setTag('station.requested', requestedStation);
        scope.setLevel('error');
        scope.setExtra('reason', String(airSettled.reason));
        Sentry.captureException(
          airSettled.reason instanceof Error ? airSettled.reason : new Error(String(airSettled.reason)),
        );
      });
    }

    console.log('[BFF] Air station candidates:', airFetch.triedStations.join(' -> '));
    console.log('[BFF] Resolved station for air/ai:', airFetch.resolvedStation);

    let aiPrimaryCache = { source: 'api', hit: false } as { source: AiCacheSource; hit: boolean };
    let aiPrimaryAttempts = 1;
    if (aiSettled.status === 'fulfilled') {
      aiPrimaryCache = {
        source: aiSettled.value.cacheSource,
        hit: aiSettled.value.cacheHit,
      };
      aiPrimaryAttempts = aiSettled.value.attempts;
    }
    let aiRetryResolvedCache = { source: 'api', hit: false } as { source: AiCacheSource; hit: boolean };
    let aiRetrySignatureCache = { source: 'api', hit: false } as { source: AiCacheSource; hit: boolean };

    let aiData: AiGuideView | null = aiSettled.status === 'fulfilled' ? aiSettled.value.data : null;
    let aiContentRecovered = aiSettled.status === 'fulfilled' ? aiSettled.value.contentRecovered : false;
    let aiOk = aiSettled.status === 'fulfilled' && !aiContentRecovered;
    const aiPrimaryError = aiSettled.status === 'rejected' ? aiSettled.reason : null;
    const aiPrimaryNonRetryableClientError = isAiNonRetryableClientError(aiPrimaryError);
    if (aiSettled.status !== 'fulfilled') {
      console.error('[BFF] AI API Error(primary):', aiSettled.reason);
      Sentry.withScope((scope) => {
        scope.setTag('fetch.phase', 'ai_primary');
        scope.setTag('station.requested', requestedStation);
        scope.setLevel('error');
        scope.setExtra('reason', String(aiSettled.reason));
        Sentry.captureException(
          aiSettled.reason instanceof Error ? aiSettled.reason : new Error(String(aiSettled.reason)),
        );
      });
    }

    const hasMetricMismatch = hasAiMetricMismatch(aiData, airFetch.data);
    const shouldRetryResolvedStation =
      airFetch.resolvedStation !== requestedStation
      && !aiPrimaryNonRetryableClientError
      && (!aiData || isUnknownMetricSignature(aiData) || hasMetricMismatch);

    // 측정소 보정이 일어났고, primary 결과가 불확실할 때만 동일 측정소 기준으로 AI 재조회
    if (shouldRetryResolvedStation) {
      const aiRetryResolvedStartedAt = Date.now();
      try {
        const retriedAi = await fetchAiData(airFetch.resolvedStation, aiProfile, AI_RETRY_TIMEOUT_MS);
        aiData = retriedAi.data;
        aiContentRecovered = retriedAi.contentRecovered;
        aiRetryResolvedCache = {
          source: retriedAi.cacheSource,
          hit: retriedAi.cacheHit,
        };
        aiOk = !aiContentRecovered;
      } catch (error) {
        console.error('[BFF] AI API Error(retry with resolved station):', error);
      } finally {
        timing.aiRetryResolvedMs = Date.now() - aiRetryResolvedStartedAt;
      }
    } else if (airFetch.resolvedStation !== requestedStation) {
      console.log(
        `[BFF] AI resolved-station retry skipped: requested=${requestedStation} resolved=${airFetch.resolvedStation} `
          + `primaryNonRetryable4xx=${aiPrimaryNonRetryableClientError} hasAiData=${Boolean(aiData)} `
          + `unknownSignature=${aiData ? isUnknownMetricSignature(aiData) : false} metricMismatch=${hasMetricMismatch}`,
      );
    }

    // 보정이 없더라도 AI 값이 기본 템플릿 시그니처면 동일 측정소로 1회 재시도
    if (aiData && isUnknownMetricSignature(aiData)) {
      const aiRetrySignatureStartedAt = Date.now();
      try {
        const retriedAi = await fetchAiData(airFetch.resolvedStation, aiProfile, AI_RETRY_TIMEOUT_MS);
        aiRetrySignatureCache = {
          source: retriedAi.cacheSource,
          hit: retriedAi.cacheHit,
        };
        if (!isUnknownMetricSignature(retriedAi.data)) {
          aiData = retriedAi.data;
          aiContentRecovered = retriedAi.contentRecovered;
        }
        aiOk = !aiContentRecovered;
      } catch (error) {
        console.error('[BFF] AI API Error(retry with unknown signature):', error);
      } finally {
        timing.aiRetrySignatureMs = Date.now() - aiRetrySignatureStartedAt;
      }
    }

    if (!aiData) {
      aiData = {
        summary: '지금은 정보를 가져올 수 없어요 🥲\n잠시 후 다시 시도해주세요!',
        detail: 'AI 선생님이 잠시 쉬고 있어요. 연결을 확인해주세요.',
      };
    }

    const airData = toViewAirData(airFetch.data, airFetch.resolvedStation);

    // Air 값이 없을 때 AI 숫자 데이터를 보강으로 사용
    if (airData.pm25_value == null && aiData.pm25_value != null) airData.pm25_value = aiData.pm25_value;
    if (airData.o3_value == null && aiData.o3_value != null) airData.o3_value = aiData.o3_value;
    if (airData.pm10_value == null && aiData.pm10_value != null) airData.pm10_value = aiData.pm10_value;
    if (airData.no2_value == null && aiData.no2_value != null) airData.no2_value = aiData.no2_value;

    const deriveStartedAt = Date.now();
    const derived = deriveDecisionSignals(airData, aiData, finalProfile);
    const reliability = buildReliabilityMeta(requestedStation, airFetch, aiOk);
    timing.deriveMs = Date.now() - deriveStartedAt;

    Sentry.setTag('station.resolved', reliability.resolvedStation);
    Sentry.setTag('reliability.status', reliability.status);
    Sentry.setTag('ai.status', reliability.aiStatus);
    timing.totalMs = Date.now() - requestStartedAt;
    const timingLog = formatTimingLog(timing);
    const serverTiming = buildServerTimingHeader(timing);
    const aiCacheLog = [
      `primary=${formatAiCacheState(aiPrimaryCache)} attempts=${aiPrimaryAttempts} recovered=${aiContentRecovered}`,
      `retryResolved=${formatAiCacheState(aiRetryResolvedCache)}`,
      `retrySignature=${formatAiCacheState(aiRetrySignatureCache)}`,
    ].join(' ');
    const airCacheLog = `primary=${formatAirCacheState(airPrimaryCache)}`;
    console.log(
      `[BFF][timing] route=/api/daily-report requested=${requestedStation} resolved=${reliability.resolvedStation} `
      + `reliability=${reliability.status} aiOk=${aiOk} ${timingLog} ${aiCacheLog} ${airCacheLog}`,
    );

    return NextResponse.json({
      airQuality: derived.airData,
      aiGuide: derived.aiGuide,
      decisionSignals: derived.decisionSignals,
      reliability,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        ...corsHeaders(),
        'x-bff-timing': timingLog,
        'server-timing': serverTiming,
        'x-bff-ai-cache': aiCacheLog,
        'x-bff-air-cache': airCacheLog,
      },
    });
  } catch (error) {
    timing.totalMs = Date.now() - requestStartedAt;
    const timingLog = formatTimingLog(timing);
    const serverTiming = buildServerTimingHeader(timing);
    console.error(`[BFF][timing] route=/api/daily-report stage=error ${timingLog}`);
    console.error('[BFF] Internal Server Error:', error);
    Sentry.withScope((scope) => {
      scope.setTag('api.route', '/api/daily-report');
      scope.setLevel('error');
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
    return NextResponse.json(
      { error: 'Internal Server Error' },
      {
        status: 500,
        headers: {
          ...corsHeaders(),
          'x-bff-timing': timingLog,
          'server-timing': serverTiming,
        },
      },
    );
  }
}

export const OPTIONS = withApiObservability('/api/daily-report', 'OPTIONS', handleOptions);
export const POST = withApiObservability('/api/daily-report', 'POST', handlePost);
