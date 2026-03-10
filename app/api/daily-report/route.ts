import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { buildReliabilityMeta, deriveDecisionSignals } from '@/lib/dailyReportDecision';
import { corsHeaders } from '@/lib/cors';
import { withApiObservability } from '@/lib/api-observability';
import { loadAirQualityFromMongo } from '@/lib/airQualityMongo';
import { buildStationCandidates, inferExpectedSido } from '@/lib/stationResolution';
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
  // Some data sources store temperature as `temperature` instead of `temp`.
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

interface AiAirQualityContext {
  source: 'mongo_airkorea_kma';
  requestedStation: string;
  resolvedStation: string;
  resolvedFromFallbackCandidate: boolean;
  sidoName?: string | null;
  dataTime?: string | null;
  grade?: AirQualityView['grade'];
  pm25_value?: number;
  pm10_value?: number;
  o3_value?: number;
  no2_value?: number;
  co_value?: number;
  so2_value?: number;
  temp?: number;
  humidity?: number;
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

function buildAiAirContextFingerprint(airContext: AiAirQualityContext | null): string {
  if (!airContext) return 'no-air-context';

  return [
    airContext.requestedStation.trim().toLowerCase(),
    airContext.resolvedStation.trim().toLowerCase(),
    airContext.dataTime ?? '',
    airContext.pm25_value ?? '',
    airContext.pm10_value ?? '',
    airContext.o3_value ?? '',
    airContext.no2_value ?? '',
    airContext.co_value ?? '',
    airContext.so2_value ?? '',
    airContext.temp ?? '',
    airContext.humidity ?? '',
  ].join('|');
}

function buildAiCacheKey(
  stationName: string,
  aiProfile: { ageGroup: string; condition: string },
  airContext: AiAirQualityContext | null,
): string {
  return [
    stationName.trim().toLowerCase(),
    aiProfile.ageGroup.trim().toLowerCase(),
    aiProfile.condition.trim().toLowerCase(),
    buildAiAirContextFingerprint(airContext),
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

function buildAiAirContextSummary(airContext: AiAirQualityContext | null): string | undefined {
  if (!airContext) return undefined;

  const metricParts: string[] = [];
  if (airContext.pm25_value != null) metricParts.push(`초미세먼지 ${airContext.pm25_value}ug/m3`);
  if (airContext.pm10_value != null) metricParts.push(`미세먼지 ${airContext.pm10_value}ug/m3`);
  if (airContext.o3_value != null) metricParts.push(`오존 ${airContext.o3_value}ppm`);
  if (airContext.no2_value != null) metricParts.push(`이산화질소 ${airContext.no2_value}ppm`);
  if (airContext.temp != null) metricParts.push(`기온 ${airContext.temp}도`);
  if (airContext.humidity != null) metricParts.push(`습도 ${airContext.humidity}%`);

  const location = airContext.resolvedStation !== airContext.requestedStation
    ? `${airContext.requestedStation} 요청을 ${airContext.resolvedStation} 기준으로 보정`
    : `${airContext.resolvedStation} 기준`;

  const timestamp = airContext.dataTime ? `, 측정시각 ${airContext.dataTime}` : '';
  return `${location}${timestamp}, ${metricParts.join(', ')}. 이 수치를 우선 기준으로 안내를 생성하세요.`;
}

function gradeLabel(grade: AirQualityView['grade']): string {
  if (grade === 'GOOD') return '좋음';
  if (grade === 'NORMAL') return '보통';
  if (grade === 'BAD') return '나쁨';
  return '매우 나쁨';
}

function buildConditionLabel(profile: ProfileInput): string {
  const conditions = normalizeKnownConditions(profile).filter((condition) => condition !== 'none');
  if (conditions.length === 0) return '일반';
  if (conditions.includes('asthma')) return '천식';
  if (conditions.includes('rhinitis')) return '비염';
  if (conditions.includes('atopy')) return '아토피';
  return '민감군';
}

function buildAuthoritativeActionItems(airData: AirQualityView, profile: ProfileInput): string[] {
  const items: string[] = [];

  if (airData.grade === 'GOOD') {
    items.push('가벼운 외출은 가능하지만 귀가 후 손발 씻기를 챙기기');
    items.push('점심 이후 오존이 오를 수 있어 장시간 야외 활동 전 수치 한 번 더 확인하기');
  } else if (airData.grade === 'NORMAL') {
    items.push('장시간 실외 활동은 줄이고 중간중간 실내에서 쉬기');
    items.push('외출 후 세안과 코 주변 정리를 바로 하기');
  } else if (airData.grade === 'BAD') {
    items.push('실외 체육 대신 실내 활동을 우선 선택하기');
    items.push('외출이 필요하면 KF80 이상 마스크를 착용하기');
  } else {
    items.push('불필요한 외출은 미루고 실내 중심으로 보내기');
    items.push('문을 오래 열어두기보다 짧게 환기하고 실내 공기질을 관리하기');
  }

  if ((profile.ageGroup === 'infant' || profile.ageGroup === 'toddler') && !items.includes('실내 놀이 중심으로 활동 계획하기')) {
    items.push('실내 놀이 중심으로 활동 계획하기');
  }

  if (profile.condition === 'rhinitis' && airData.humidity != null && airData.humidity < 40) {
    items.push('실내가 건조하면 가습이나 보습을 함께 챙기기');
  }

  if (profile.condition === 'asthma' && airData.temp != null && airData.temp < 5) {
    items.push('차가운 공기를 오래 마시지 않도록 외출 시간을 짧게 조절하기');
  }

  if (airData.temp != null && airData.temp < 5) {
    items.push('추운 시간대에는 목도리나 겉옷으로 체온 유지하기');
  }

  return Array.from(new Set(items)).slice(0, 3);
}

function buildAuthoritativeAiGuide(
  airData: AirQualityView,
  profile: ProfileInput,
  existingGuide?: AiGuideView | null,
): AiGuideView {
  const gradeText = gradeLabel(airData.grade);
  const conditionText = buildConditionLabel(profile);
  const metricParts: string[] = [];

  if (airData.pm25_value != null) metricParts.push(`초미세먼지 ${airData.pm25_value}ug/m3`);
  if (airData.pm10_value != null) metricParts.push(`미세먼지 ${airData.pm10_value}ug/m3`);
  if (airData.o3_value != null) metricParts.push(`오존 ${airData.o3_value}ppm`);
  if (airData.no2_value != null) metricParts.push(`이산화질소 ${airData.no2_value}ppm`);
  if (airData.temp != null) metricParts.push(`기온 ${airData.temp}도`);
  if (airData.humidity != null) metricParts.push(`습도 ${airData.humidity}%`);

  let summary = '오늘은 비교적 편하게 외출할 수 있어요';
  let activityRecommendation = '가벼운 실외 활동은 가능해요';
  let maskRecommendation = '민감군이라면 마스크를 챙겨두세요';

  if (airData.grade === 'NORMAL') {
    summary = '오늘은 무리한 실외 활동만 조금 줄여주세요';
    activityRecommendation = '짧은 실외 활동은 가능하지만 오래 머무르진 마세요';
    maskRecommendation = '민감군은 KF80 마스크를 권장해요';
  } else if (airData.grade === 'BAD') {
    summary = '오늘은 실외 활동을 줄이고 실내 중심으로 보내는 편이 안전해요';
    activityRecommendation = '실외 체육보다 실내 활동을 추천해요';
    maskRecommendation = 'KF80 이상 마스크를 권장해요';
  } else if (airData.grade === 'VERY_BAD') {
    summary = '오늘은 외출을 최대한 줄이고 실내에 머무르는 편이 안전해요';
    activityRecommendation = '필수 외출 외에는 실내에 머무르는 편이 좋아요';
    maskRecommendation = 'KF80 이상 마스크와 실내 공기질 관리가 필요해요';
  }

  const measuredAt = airData.dataTime ? `${airData.dataTime} 기준` : '최근 실측 기준';
  const metricSummary = metricParts.length > 0 ? metricParts.join(', ') : '대기질 핵심 지표';
  const detailAnswer =
    `${measuredAt} ${airData.stationName}의 현재 수치는 ${metricSummary}입니다. `
    + `이 값을 기준으로 보면 전체 위험도는 ${gradeText} 수준이며, ${conditionText} 프로필을 고려해 안내를 맞췄어요. `
    + `${activityRecommendation}`;

  const threeReason = [
    `${airData.stationName} 현재 대기질은 ${gradeText} 수준이에요.`,
    metricParts.length > 0 ? `${metricSummary} 기준으로 판단했어요.` : '현재 실측 수치를 기준으로 판단했어요.',
    `${conditionText} 프로필을 고려해 행동 지침을 조정했어요.`,
  ];

  return {
    ...existingGuide,
    summary,
    csvReason: `${airData.stationName} 현재 실측은 ${gradeText} 수준이에요.`,
    detail: detailAnswer,
    detailAnswer,
    threeReason,
    actionItems: buildAuthoritativeActionItems(airData, profile),
    activityRecommendation,
    maskRecommendation,
    pm25_value: airData.pm25_value,
    pm10_value: airData.pm10_value,
    o3_value: airData.o3_value,
    no2_value: airData.no2_value,
  };
}

function synchronizeAiGuideMetrics(
  aiGuide: AiGuideView,
  airData: Pick<AirQualityView, 'pm25_value' | 'pm10_value' | 'o3_value' | 'no2_value'>,
): AiGuideView {
  return {
    ...aiGuide,
    pm25_value: airData.pm25_value ?? aiGuide.pm25_value,
    pm10_value: airData.pm10_value ?? aiGuide.pm10_value,
    o3_value: airData.o3_value ?? aiGuide.o3_value,
    no2_value: airData.no2_value ?? aiGuide.no2_value,
  };
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
  const mongoResult = await loadAirQualityFromMongo(candidates, expectedSido);
  if (mongoResult) {
    const mongoData: AirQualityRaw = {
      ...mongoResult.raw,
      sidoName: mongoResult.raw.sidoName ?? undefined,
      dataTime: mongoResult.raw.dataTime ?? undefined,
    };

    return {
      data: mongoData,
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
    mang_name: raw.mang_name ?? null,
    dataTime: raw.dataTime ?? null,
    grade: worstGrade === 4 ? 'VERY_BAD' : worstGrade === 3 ? 'BAD' : worstGrade === 2 ? 'NORMAL' : 'GOOD',
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

function buildAiAirContext(
  requestedStation: string,
  airFetch: AirFetchResult,
  airData: AirQualityView,
): AiAirQualityContext | null {
  if (!airFetch.data) return null;

  return {
    source: 'mongo_airkorea_kma',
    requestedStation,
    resolvedStation: airFetch.resolvedStation,
    resolvedFromFallbackCandidate: airFetch.usedFallbackCandidate,
    sidoName: airData.sidoName ?? undefined,
    dataTime: airData.dataTime ?? undefined,
    grade: airData.grade,
    pm25_value: airData.pm25_value,
    pm10_value: airData.pm10_value,
    o3_value: airData.o3_value,
    no2_value: airData.no2_value,
    co_value: airData.co_value,
    so2_value: airData.so2_value,
    temp: airData.temp,
    humidity: airData.humidity,
  };
}

async function fetchAiDataFromApi(
  stationName: string,
  aiProfile: { ageGroup: string; condition: string },
  timeoutMs: number,
  airContext: AiAirQualityContext | null,
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
        currentAirQuality: airContext,
        authoritativeAirQuality: airContext,
        airQualitySummary: buildAiAirContextSummary(airContext),
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchAiData(
  stationName: string,
  aiProfile: { ageGroup: string; condition: string },
  timeoutMs: number,
  airContext: AiAirQualityContext | null,
): Promise<AiFetchResult> {
  const cacheKey = buildAiCacheKey(stationName, aiProfile, airContext);
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

  const requestPromise = fetchAiDataFromApi(stationName, aiProfile, timeoutMs, airContext)
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
  airContext: AiAirQualityContext | null,
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
  const cacheKey = buildAiCacheKey(stationName, aiProfile, airContext);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const timeoutMs = attempt === 0 ? options.primaryTimeoutMs : options.retryTimeoutMs;

    try {
      const fetched = await fetchAiData(stationName, aiProfile, timeoutMs, airContext);
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
    console.log(`[BFF] API targets: ai=${AI_API_URL}`);

    const airFetchStartedAt = Date.now();
    let airPrimaryCache = { source: 'api', hit: false } as { source: AirCacheSource; hit: boolean };
    let airFetch: AirFetchResult = {
      data: null,
      resolvedStation: requestedStation,
      triedStations: [requestedStation],
      usedFallbackCandidate: false,
      usedFallbackData: false,
      unknownSignatureCandidates: [],
    };

    try {
      const fetchedAir = await fetchAirData(requestedStation);
      airPrimaryCache = {
        source: fetchedAir.cacheSource,
        hit: fetchedAir.cacheHit,
      };
      airFetch = fetchedAir.data;
    } catch (error) {
      console.error('[BFF] Air fetch failed:', error);
      Sentry.withScope((scope) => {
        scope.setTag('fetch.phase', 'air');
        scope.setTag('station.requested', requestedStation);
        scope.setLevel('error');
        scope.setExtra('reason', String(error));
        Sentry.captureException(
          error instanceof Error ? error : new Error(String(error)),
        );
      });
    } finally {
      timing.airFetchMs = Date.now() - airFetchStartedAt;
    }

    console.log('[BFF] Air station candidates:', airFetch.triedStations.join(' -> '));
    console.log('[BFF] Resolved station for air:', airFetch.resolvedStation);

    const airData = toViewAirData(airFetch.data, airFetch.resolvedStation);
    const aiAirContext = buildAiAirContext(requestedStation, airFetch, airData);
    const aiTargetStation = aiAirContext?.resolvedStation ?? requestedStation;

    if (aiAirContext) {
      console.log(
        '[BFF] AI authoritative air context:',
        JSON.stringify({
          requestedStation: aiAirContext.requestedStation,
          resolvedStation: aiAirContext.resolvedStation,
          dataTime: aiAirContext.dataTime,
          pm25_value: aiAirContext.pm25_value,
          pm10_value: aiAirContext.pm10_value,
          o3_value: aiAirContext.o3_value,
          no2_value: aiAirContext.no2_value,
          temp: aiAirContext.temp,
          humidity: aiAirContext.humidity,
        }),
      );
    }

    const aiPrimaryStartedAt = Date.now();
    let aiPrimaryCache = { source: 'api', hit: false } as { source: AiCacheSource; hit: boolean };
    let aiPrimaryAttempts = 1;
    let aiData: AiGuideView | null = null;
    let aiContentRecovered = false;

    try {
      const aiResult = await fetchAiDataWithRetry(aiTargetStation, aiProfile, aiAirContext, {
        primaryTimeoutMs: AI_PRIMARY_TIMEOUT_MS,
        retryTimeoutMs: AI_PRIMARY_RETRY_TIMEOUT_MS,
        retryCount: AI_PRIMARY_RETRY_COUNT,
        retryBackoffMs: AI_PRIMARY_RETRY_BACKOFF_MS,
      });
      aiPrimaryCache = {
        source: aiResult.cacheSource,
        hit: aiResult.cacheHit,
      };
      aiPrimaryAttempts = aiResult.attempts;
      aiData = aiResult.data;
      aiContentRecovered = aiResult.contentRecovered;
    } catch (error) {
      console.error('[BFF] AI API Error(primary):', error);
      Sentry.withScope((scope) => {
        scope.setTag('fetch.phase', 'ai_primary');
        scope.setTag('station.requested', requestedStation);
        scope.setTag('station.resolved', aiTargetStation);
        scope.setLevel('error');
        scope.setExtra('reason', String(error));
        scope.setExtra('airContextFingerprint', buildAiAirContextFingerprint(aiAirContext));
        Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
      });
    } finally {
      timing.aiPrimaryMs = Date.now() - aiPrimaryStartedAt;
    }

    let aiOk = Boolean(aiData) && !aiContentRecovered;
    let aiRetryResolvedCache = { source: 'api', hit: false } as { source: AiCacheSource; hit: boolean };
    let aiRetrySignatureCache = { source: 'api', hit: false } as { source: AiCacheSource; hit: boolean };

    if (!aiData) {
      aiData = {
        summary: '지금은 정보를 가져올 수 없어요 🥲\n잠시 후 다시 시도해주세요!',
        detail: 'AI 선생님이 잠시 쉬고 있어요. 연결을 확인해주세요.',
      };
    }

    // Air 값이 없을 때 AI 숫자 데이터를 보강으로 사용
    if (airData.pm25_value == null && aiData.pm25_value != null) airData.pm25_value = aiData.pm25_value;
    if (airData.o3_value == null && aiData.o3_value != null) airData.o3_value = aiData.o3_value;
    if (airData.pm10_value == null && aiData.pm10_value != null) airData.pm10_value = aiData.pm10_value;
    if (airData.no2_value == null && aiData.no2_value != null) airData.no2_value = aiData.no2_value;

    const hasMetricMismatch = hasAiMetricMismatch(aiData, airFetch.data);
    const aiUnknownSignature = isUnknownMetricSignature(aiData);
    const shouldUseAuthoritativeGuide =
      Boolean(airFetch.data) && (!aiData || hasMetricMismatch || aiUnknownSignature || !aiOk);

    if (shouldUseAuthoritativeGuide) {
      console.warn(
        `[BFF] AI guide overridden with authoritative air context: requested=${requestedStation} `
          + `resolved=${aiTargetStation} hasAiData=${Boolean(aiData)} aiOk=${aiOk} `
          + `metricMismatch=${hasMetricMismatch} unknownSignature=${aiUnknownSignature}`,
      );
      aiData = buildAuthoritativeAiGuide(airData, finalProfile, aiData);
    }

    if (hasMetricMismatch) {
      console.warn(
        `[BFF] AI metric mismatch corrected: requested=${requestedStation} resolved=${aiTargetStation}`,
      );
    }
    aiData = synchronizeAiGuideMetrics(aiData, airData);

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
