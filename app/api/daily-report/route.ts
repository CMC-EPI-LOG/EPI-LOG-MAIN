import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { buildReliabilityMeta, deriveDecisionSignals } from '@/lib/dailyReportDecision';
import { corsHeaders } from '@/lib/cors';
import {
  buildStationCandidates,
  inferExpectedSido,
  isSidoMismatch,
} from '@/lib/stationResolution';

const DATA_API_URL = process.env.NEXT_PUBLIC_DATA_API_URL || 'https://epi-log-ai.vercel.app';
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'https://epi-log-ai.vercel.app';
const FALLBACK_TEMP = 22;
const FALLBACK_HUMIDITY = 45;

const UNKNOWN_STATION_SIGNATURE = {
  pm25_value: 65,
  pm10_value: 85,
  o3_value: 0.065,
  no2_value: 0.025,
};

export const runtime = 'nodejs';

export async function OPTIONS() {
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

interface AiGuideView {
  summary: string;
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

async function fetchAirDataWithStationFallback(stationName: string): Promise<AirFetchResult> {
  const candidates = buildStationCandidates(stationName);
  const expectedSido = inferExpectedSido(stationName);
  let fallbackResult: { data: AirQualityRaw; resolvedStation: string; candidate: string } | null = null;
  const unknownSignatureCandidates: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(
        `${DATA_API_URL}/api/air-quality?stationName=${encodeURIComponent(candidate)}`,
        { cache: 'no-store' },
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
      console.error('[BFF] Air API Error:', error, `candidate=${candidate}`);
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

async function fetchAiData(stationName: string, aiProfile: { ageGroup: string; condition: string }) {
  const response = await fetch(`${AI_API_URL}/api/advice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stationName,
      userProfile: aiProfile,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`AI API Failed: ${response.status} ${response.statusText}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  console.log('[BFF] Raw AI Data:', JSON.stringify(raw, null, 2));

  if (
    raw.decision === 'Error' ||
    (typeof raw.reason === 'string' && raw.reason.includes('Error code:'))
  ) {
    console.error('[BFF] AI Business Logic Error:', raw.reason);
    return {
      summary: 'AI 서버 설정 오류가 발생했어요 😅',
      detail: '백엔드 OpenAI 모델 설정(Temperature)을 확인해주세요.',
      maskRecommendation: '확인 필요',
      activityRecommendation: '확인 필요',
    } satisfies AiGuideView;
  }

  return {
    summary: typeof raw.decision === 'string' ? raw.decision : '오늘의 가이드를 준비 중이에요.',
    detail: typeof raw.reason === 'string' ? raw.reason : 'AI 설명을 준비 중이에요.',
    threeReason: Array.isArray(raw.three_reason) ? (raw.three_reason as string[]) : [],
    detailAnswer: typeof raw.detail_answer === 'string' ? raw.detail_answer : (raw.reason as string | undefined),
    actionItems: Array.isArray(raw.actionItems) ? (raw.actionItems as string[]) : [],
    activityRecommendation: typeof raw.decision === 'string' ? raw.decision : '확인 필요',
    maskRecommendation: 'KF80 권장',
    references: Array.isArray(raw.references) ? (raw.references as string[]) : [],
    pm25_value: typeof raw.pm25_value === 'number' ? raw.pm25_value : undefined,
    o3_value: typeof raw.o3_value === 'number' ? raw.o3_value : undefined,
    pm10_value: typeof raw.pm10_value === 'number' ? raw.pm10_value : undefined,
    no2_value: typeof raw.no2_value === 'number' ? raw.no2_value : undefined,
  } satisfies AiGuideView;
}

export async function POST(request: Request) {
  try {
    const requestBody = await parseRequestBody(request);
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

    // P0: 병렬 호출로 지연 완화 (air/ai를 동시에 시작)
    const [airSettled, aiSettled] = await Promise.allSettled([
      fetchAirDataWithStationFallback(requestedStation),
      fetchAiData(requestedStation, aiProfile),
    ]);

    const airFetch: AirFetchResult =
      airSettled.status === 'fulfilled'
        ? airSettled.value
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

    let aiData: AiGuideView | null = aiSettled.status === 'fulfilled' ? aiSettled.value : null;
    let aiOk = aiSettled.status === 'fulfilled';
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

    // 측정소 보정이 일어났다면 AI도 동일 측정소 기준으로 맞춰 일관성 확보
    if (airFetch.resolvedStation !== requestedStation) {
      try {
        const retriedAiData = await fetchAiData(airFetch.resolvedStation, aiProfile);
        aiData = retriedAiData;
        aiOk = true;
      } catch (error) {
        console.error('[BFF] AI API Error(retry with resolved station):', error);
      }
    }

    // 보정이 없더라도 AI 값이 기본 템플릿 시그니처면 동일 측정소로 1회 재시도
    if (aiData && isUnknownMetricSignature(aiData)) {
      try {
        const retriedAiData = await fetchAiData(airFetch.resolvedStation, aiProfile);
        if (!isUnknownMetricSignature(retriedAiData)) {
          aiData = retriedAiData;
        }
        aiOk = true;
      } catch (error) {
        console.error('[BFF] AI API Error(retry with unknown signature):', error);
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

    const derived = deriveDecisionSignals(airData, aiData, finalProfile);
    const reliability = buildReliabilityMeta(requestedStation, airFetch, aiOk);

    Sentry.setTag('station.resolved', reliability.resolvedStation);
    Sentry.setTag('reliability.status', reliability.status);
    Sentry.setTag('ai.status', reliability.aiStatus);

    return NextResponse.json({
      airQuality: derived.airData,
      aiGuide: derived.aiGuide,
      decisionSignals: derived.decisionSignals,
      reliability,
      timestamp: new Date().toISOString(),
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[BFF] Internal Server Error:', error);
    Sentry.withScope((scope) => {
      scope.setTag('api.route', '/api/daily-report');
      scope.setLevel('error');
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
