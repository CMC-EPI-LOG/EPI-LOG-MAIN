export interface ProfileInput {
  ageGroup?: string;
  condition?: string;
  conditions?: string[];
  customConditions?: string[];
}

export interface AirQualityView {
  stationName: string;
  sidoName?: string | null;
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

export interface AirFetchResult {
  data: unknown | null;
  resolvedStation: string;
  triedStations: string[];
  usedFallbackCandidate: boolean;
  usedFallbackData: boolean;
  unknownSignatureCandidates: string[];
}

export interface AiGuideView {
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

export interface ReliabilityMeta {
  status: 'LIVE' | 'STATION_FALLBACK' | 'DEGRADED';
  label: string;
  description: string;
  requestedStation: string;
  resolvedStation: string;
  triedStations: string[];
  updatedAt: string;
  aiStatus: 'ok' | 'failed';
}

export interface DecisionSignals {
  pm25Grade: number;
  o3Grade: number;
  adjustedRiskGrade: number;
  finalGrade: 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD';
  o3IsDominantRisk: boolean;
  o3OutingBanForced: boolean;
  infantMaskBanApplied: boolean;
  weatherAdjusted: boolean;
  weatherAdjustmentReason?: string;
  weatherAdjustmentReasons?: string[];
}

const KNOWN_CONDITIONS = ['none', 'rhinitis', 'asthma', 'atopy'] as const;
const KNOWN_CONDITION_SET = new Set<string>(KNOWN_CONDITIONS);
type KnownCondition = (typeof KNOWN_CONDITIONS)[number];

function clampGrade(grade: number): 1 | 2 | 3 | 4 {
  if (grade <= 1) return 1;
  if (grade >= 4) return 4;
  return grade as 1 | 2 | 3 | 4;
}

function toUiGrade(grade: number): 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD' {
  const safe = clampGrade(grade);
  if (safe === 1) return 'GOOD';
  if (safe === 2) return 'NORMAL';
  if (safe === 3) return 'BAD';
  return 'VERY_BAD';
}

function pm25GradeFromValue(value?: number): 1 | 2 | 3 | 4 {
  if (value == null || Number.isNaN(value)) return 2;
  if (value <= 15) return 1;
  if (value <= 35) return 2;
  if (value <= 75) return 3;
  return 4;
}

function o3GradeFromValue(value?: number): 1 | 2 | 3 | 4 {
  if (value == null || Number.isNaN(value)) return 2;
  if (value <= 0.03) return 1;
  if (value <= 0.09) return 2;
  if (value <= 0.15) return 3;
  return 4;
}

function getSeoulHour(): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());

  return Number(hour);
}

function appendUnique(items: string[], next: string): string[] {
  if (items.includes(next)) return items;
  return [...items, next];
}

const INFANT_UNSAFE_ACTION_KEYWORDS = [
  '축구',
  '달리기',
  '운동장',
  '야외학습',
  '교실전면환기',
  '조깅',
  '등산',
  '격렬운동',
  '체육',
];

const INFANT_SAFE_ACTION_FALLBACKS = [
  '실내 놀이 중심으로 활동 계획하기',
  '짧은 환기 후 공기청정기 가동하기',
  '귀가 후 손발 씻기와 보습 챙기기',
];

const INFANT_SAFE_ACTIVITY_RECOMMENDATION = '실내 중심의 가벼운 활동을 추천해요';

function hasInfantUnsafeAction(text?: string): boolean {
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  return INFANT_UNSAFE_ACTION_KEYWORDS.some((keyword) => compact.includes(keyword));
}

function sanitizeInfantActionItems(actionItems: string[] | undefined): { items: string[]; removedUnsafe: boolean } {
  const source = Array.isArray(actionItems) ? actionItems : [];
  const filtered = source.filter((item) => !hasInfantUnsafeAction(item));
  const removedUnsafe = filtered.length !== source.length;
  const items = [...filtered];

  if (removedUnsafe || items.length === 0) {
    for (const fallback of INFANT_SAFE_ACTION_FALLBACKS) {
      if (items.length >= 3) break;
      if (items.includes(fallback)) continue;
      items.push(fallback);
    }
  }

  return { items, removedUnsafe };
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

function applyWeatherAdjustment(
  baseRiskGrade: number,
  profile: ProfileInput,
  temp?: number,
  humidity?: number,
): { adjusted: 1 | 2 | 3 | 4; reasons: string[] } {
  let adjusted = baseRiskGrade;
  const reasons: string[] = [];

  const ageGroup = profile.ageGroup || 'elementary_low';
  const conditions = normalizeKnownConditions(profile);

  if ((ageGroup === 'infant' || ageGroup === 'toddler') && humidity != null && humidity < 35) {
    adjusted += 1;
    reasons.push('영유아 + 저습도(35% 미만)로 위험도를 1단계 상향했어요.');
  } else if (ageGroup === 'elementary_low' && temp != null && (temp >= 30 || temp <= 2)) {
    adjusted += 1;
    reasons.push('초등 저학년 + 극단 기온으로 위험도를 1단계 상향했어요.');
  }

  if (conditions.includes('asthma') && temp != null && temp < 5) {
    adjusted += 1;
    reasons.push('천식 + 저온(5°C 미만)로 위험도를 1단계 상향했어요.');
  }
  if (conditions.includes('rhinitis') && humidity != null && humidity < 30) {
    adjusted += 1;
    reasons.push('비염 + 건조(30% 미만)로 위험도를 1단계 상향했어요.');
  }
  if (conditions.includes('atopy') && temp != null && temp > 30) {
    adjusted += 1;
    reasons.push('아토피 + 고온(30°C 초과)로 위험도를 1단계 상향했어요.');
  }

  return {
    adjusted: clampGrade(adjusted),
    reasons,
  };
}

export function deriveDecisionSignals(
  airData: AirQualityView,
  aiGuide: AiGuideView,
  profile: ProfileInput,
  hourOverride?: number,
): { airData: AirQualityView; aiGuide: AiGuideView; decisionSignals: DecisionSignals } {
  const pm25Grade = pm25GradeFromValue(airData.pm25_value);
  const o3Grade = o3GradeFromValue(airData.o3_value);
  const baseRisk = Math.max(pm25Grade, o3Grade);
  const weatherAdjusted = applyWeatherAdjustment(baseRisk, profile, airData.temp, airData.humidity);

  let finalNumericGrade = weatherAdjusted.adjusted;

  if (pm25Grade >= 3 && o3Grade >= 3) {
    finalNumericGrade = 4;
  }

  const finalGrade = toUiGrade(finalNumericGrade);
  const isO3DominantRisk = o3Grade >= 3 && o3Grade >= pm25Grade;
  const isO3High = o3Grade >= 3;
  const nowHourSeoul = hourOverride ?? getSeoulHour();
  const inO3RiskWindow = nowHourSeoul >= 14 && nowHourSeoul < 17;

  const nextGuide: AiGuideView = {
    ...aiGuide,
    actionItems: [...(aiGuide.actionItems || [])],
    threeReason: [...(aiGuide.threeReason || [])],
  };

  if (isO3High) {
    nextGuide.actionItems = appendUnique(nextGuide.actionItems || [], '오후 2~5시 외출 금지');

    nextGuide.detailAnswer = [
      nextGuide.detailAnswer || nextGuide.detail,
      '오존은 가스성 오염물질이라 마스크로 충분히 걸러지지 않아요.',
    ]
      .filter(Boolean)
      .join(' ');

    nextGuide.threeReason = appendUnique(
      nextGuide.threeReason || [],
      '오존 농도가 높아 실외 활동 제한이 필요해요.',
    );
  }

  const isInfant = profile.ageGroup === 'infant';
  if (isInfant) {
    const sanitized = sanitizeInfantActionItems(nextGuide.actionItems);
    nextGuide.actionItems = sanitized.items;

    if (hasInfantUnsafeAction(nextGuide.activityRecommendation)) {
      nextGuide.activityRecommendation = INFANT_SAFE_ACTIVITY_RECOMMENDATION;
    }

    if (hasInfantUnsafeAction(nextGuide.summary)) {
      nextGuide.summary = nextGuide.activityRecommendation || INFANT_SAFE_ACTIVITY_RECOMMENDATION;
    }

    if (sanitized.removedUnsafe) {
      nextGuide.threeReason = appendUnique(
        nextGuide.threeReason || [],
        '영아 안전 기준으로 격한 실외 활동 문구를 제외했어요.',
      );
    }

    nextGuide.maskRecommendation = '마스크 착용 금지(영아)';
    nextGuide.actionItems = appendUnique(
      nextGuide.actionItems || [],
      '영아는 마스크 대신 실내 공기질 관리에 집중',
    );
    nextGuide.threeReason = appendUnique(
      nextGuide.threeReason || [],
      '영아는 마스크 착용 시 질식 위험이 있어요.',
    );
  }

  if (weatherAdjusted.reasons.length > 0) {
    for (const reason of weatherAdjusted.reasons) {
      nextGuide.threeReason = appendUnique(nextGuide.threeReason || [], reason);
    }
  }

  if (isO3DominantRisk && inO3RiskWindow) {
    nextGuide.summary = '오후 2~5시는 실내 활동이 더 안전해요';
  }

  return {
    airData: {
      ...airData,
      grade: finalGrade,
    },
    aiGuide: nextGuide,
    decisionSignals: {
      pm25Grade,
      o3Grade,
      adjustedRiskGrade: finalNumericGrade,
      finalGrade,
      o3IsDominantRisk: isO3DominantRisk,
      o3OutingBanForced: isO3High,
      infantMaskBanApplied: isInfant,
      weatherAdjusted: weatherAdjusted.reasons.length > 0,
      weatherAdjustmentReason: weatherAdjusted.reasons[0],
      weatherAdjustmentReasons: weatherAdjusted.reasons,
    },
  };
}

export function buildReliabilityMeta(
  requestedStation: string,
  airFetch: AirFetchResult,
  aiOk: boolean,
): ReliabilityMeta {
  const updatedAt = new Date().toISOString();

  if (airFetch.usedFallbackData || !airFetch.data) {
    return {
      status: 'DEGRADED',
      label: '주변 평균 대체 데이터',
      description: '실측 매칭에 실패해 주변 평균 대체 데이터를 안내하고 있어요.',
      requestedStation,
      resolvedStation: airFetch.resolvedStation,
      triedStations: airFetch.triedStations,
      updatedAt,
      aiStatus: aiOk ? 'ok' : 'failed',
    };
  }

  if (airFetch.usedFallbackCandidate) {
    return {
      status: 'STATION_FALLBACK',
      label: '인근 측정소 자동 보정',
      description: '입력 주소와 인접한 유효 측정소의 최근 1시간 기준 실측값으로 자동 보정했어요.',
      requestedStation,
      resolvedStation: airFetch.resolvedStation,
      triedStations: airFetch.triedStations,
      updatedAt,
      aiStatus: aiOk ? 'ok' : 'failed',
    };
  }

  return {
    status: 'LIVE',
    label: '최근 1시간 기준 실측 데이터',
    description: '현재 선택한 지역 측정소의 최근 1시간 기준 실측값을 반영했어요.',
    requestedStation,
    resolvedStation: airFetch.resolvedStation,
    triedStations: airFetch.triedStations,
    updatedAt,
    aiStatus: aiOk ? 'ok' : 'failed',
  };
}
