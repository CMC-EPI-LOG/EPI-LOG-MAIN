import { describe, expect, it } from 'vitest';
import {
  buildReliabilityMeta,
  deriveDecisionSignals,
  type AirFetchResult,
  type AirQualityView,
  type AiGuideView,
  type ProfileInput,
  } from '../../lib/dailyReportDecision';
import { getGradeBadgeColor, getGradeText } from '../../lib/colorUtils';
import { getGradeCode } from '../../lib/characterUtils';

function createAir(overrides: Partial<AirQualityView> = {}): AirQualityView {
  return {
    stationName: '중구',
    grade: 'NORMAL',
    pm25_value: 20,
    pm10_value: 40,
    o3_value: 0.05,
    no2_value: 0.02,
    temp: 22,
    humidity: 45,
    detail: {
      pm10: { grade: 2, value: 40 },
      pm25: { grade: 2, value: 20 },
      o3: { value: 0.05 },
      no2: { value: 0.02 },
    },
    ...overrides,
  };
}

function createGuide(overrides: Partial<AiGuideView> = {}): AiGuideView {
  return {
    summary: '테스트 요약',
    detail: '테스트 상세',
    threeReason: ['기본 사유 1', '기본 사유 2', '기본 사유 3'],
    detailAnswer: '기본 상세 답변',
    actionItems: ['기본 액션'],
    activityRecommendation: '확인 필요',
    maskRecommendation: 'KF80 권장',
    ...overrides,
  };
}

describe('deriveDecisionSignals', () => {
  it('오존 BAD 이상이면 오존 강제 액션과 안내 문구를 추가한다', () => {
    const air = createAir({ o3_value: 0.12, pm25_value: 18 });
    const guide = createGuide();
    const profile: ProfileInput = { ageGroup: 'elementary_low', condition: 'none' };

    const result = deriveDecisionSignals(air, guide, profile, 15);

    expect(result.decisionSignals.o3OutingBanForced).toBe(true);
    expect(result.aiGuide.actionItems).toContain('오후 2~5시 외출 금지');
    expect(result.aiGuide.detailAnswer).toContain('오존은 가스성 오염물질');
    expect(result.aiGuide.summary).toContain('오후 2~5시');
  });

  it('오존 위험 시간대(14~17시)가 아니면 요약 문구를 강제 변경하지 않는다', () => {
    const air = createAir({ o3_value: 0.12, pm25_value: 18 });
    const guide = createGuide({ summary: '기본 요약 유지' });
    const profile: ProfileInput = { ageGroup: 'elementary_low', condition: 'none' };

    const result = deriveDecisionSignals(air, guide, profile, 11);

    expect(result.decisionSignals.o3OutingBanForced).toBe(true);
    expect(result.aiGuide.summary).toBe('기본 요약 유지');
  });

  it('영아 프로필이면 마스크 금지 정책을 반영한다', () => {
    const air = createAir();
    const guide = createGuide();
    const profile: ProfileInput = { ageGroup: 'infant', condition: 'none' };

    const result = deriveDecisionSignals(air, guide, profile, 10);

    expect(result.decisionSignals.infantMaskBanApplied).toBe(true);
    expect(result.aiGuide.maskRecommendation).toBe('마스크 착용 금지(영아)');
    expect(result.aiGuide.actionItems).toContain('영아는 마스크 대신 실내 공기질 관리에 집중');
  });

  it('영아 프로필이면 격한 야외 액션 문구를 제거하고 안전 문구로 대체한다', () => {
    const air = createAir();
    const guide = createGuide({
      summary: '운동장에서 마음껏!',
      activityRecommendation: '축구/달리기 추천',
      actionItems: ['축구/달리기 추천', '교실 전면 환기', '야외 학습'],
    });
    const profile: ProfileInput = { ageGroup: 'infant', condition: 'none' };

    const result = deriveDecisionSignals(air, guide, profile, 10);
    const joinedItems = (result.aiGuide.actionItems || []).join(' ');

    expect(joinedItems).not.toContain('축구');
    expect(joinedItems).not.toContain('달리기');
    expect(joinedItems).not.toContain('야외 학습');
    expect(joinedItems).toContain('영아는 마스크 대신 실내 공기질 관리에 집중');
    expect(result.aiGuide.activityRecommendation).toBe('실내 중심의 가벼운 활동을 추천해요');
    expect(result.aiGuide.summary).toBe('실내 중심의 가벼운 활동을 추천해요');
    expect(result.aiGuide.threeReason?.some((reason) => reason.includes('영아 안전 기준'))).toBe(true);
  });

  it('질환/온습도 보정이 적용되면 위험도와 사유를 올린다', () => {
    const air = createAir({ pm25_value: 20, o3_value: 0.05, humidity: 25 });
    const guide = createGuide();
    const profile: ProfileInput = { ageGroup: 'elementary_low', condition: 'rhinitis' };

    const result = deriveDecisionSignals(air, guide, profile, 11);

    expect(result.decisionSignals.weatherAdjusted).toBe(true);
    expect(result.decisionSignals.weatherAdjustmentReason).toContain('비염 + 건조');
    expect(result.decisionSignals.adjustedRiskGrade).toBeGreaterThanOrEqual(3);
    expect(result.aiGuide.threeReason?.some((reason) => reason.includes('비염 + 건조'))).toBe(true);
  });

  it('복수 질환 선택 시 각각의 보정이 함께 반영된다', () => {
    const air = createAir({ pm25_value: 20, o3_value: 0.05, temp: 0, humidity: 25 });
    const guide = createGuide();
    const profile: ProfileInput = {
      ageGroup: 'elementary_low',
      conditions: ['rhinitis', 'asthma'],
      condition: 'asthma',
    };

    const result = deriveDecisionSignals(air, guide, profile, 11);

    expect(result.decisionSignals.weatherAdjusted).toBe(true);
    expect(result.decisionSignals.adjustedRiskGrade).toBe(4);
    expect(result.aiGuide.threeReason?.some((reason) => reason.includes('비염 + 건조'))).toBe(true);
    expect(result.aiGuide.threeReason?.some((reason) => reason.includes('천식 + 저온'))).toBe(true);
  });

  it('AI 서버와 동일하게 영유아/초등 저학년은 극단 기온에서 1단계 상향한다', () => {
    const air = createAir({
      pm25_value: 15,
      o3_value: 0.031,
      temp: -2.6,
      humidity: 62,
    });
    const guide = createGuide();

    const toddler = deriveDecisionSignals(air, guide, { ageGroup: 'toddler', condition: 'none' }, 11);
    const elementaryLow = deriveDecisionSignals(air, guide, { ageGroup: 'elementary_low', condition: 'none' }, 11);
    const elementaryHigh = deriveDecisionSignals(air, guide, { ageGroup: 'elementary_high', condition: 'none' }, 11);

    expect(toddler.decisionSignals.finalGrade).toBe('BAD');
    expect(toddler.decisionSignals.weatherAdjustmentReason).toContain('영유아/초등 저학년 + 극단 기온');
    expect(elementaryLow.decisionSignals.finalGrade).toBe('BAD');
    expect(elementaryLow.decisionSignals.weatherAdjustmentReason).toContain('영유아/초등 저학년 + 극단 기온');
    expect(elementaryHigh.decisionSignals.finalGrade).toBe('NORMAL');
    expect(elementaryHigh.decisionSignals.weatherAdjusted).toBe(false);
  });

  it('BAD 등급은 UI에서 VERY_BAD로 승격되지 않는다', () => {
    const air = createAir({ pm25_value: 40, o3_value: 0.02, temp: 22, humidity: 45 });
    const guide = createGuide();
    const profile: ProfileInput = { ageGroup: 'elementary_high', condition: 'none' };

    const result = deriveDecisionSignals(air, guide, profile, 11);

    expect(result.decisionSignals.finalGrade).toBe('BAD');
    expect(result.airData.grade).toBe('BAD');
    expect(getGradeText(result.airData.grade)).toBe('나쁨');
    expect(getGradeBadgeColor(result.airData.grade)).toBe('bg-orange-400');
    expect(getGradeCode(result.airData.grade)).toBe('C');
  });
});

describe('buildReliabilityMeta', () => {
  const baseFetch: AirFetchResult = {
    data: {
      stationName: '중구',
      pm25_value: 20,
      pm10_value: 40,
      o3_value: 0.04,
      no2_value: 0.02,
    },
    resolvedStation: '중구',
    triedStations: ['중구'],
    usedFallbackCandidate: false,
    usedFallbackData: false,
    unknownSignatureCandidates: [],
  };

  it('기본 성공이면 LIVE 상태를 반환한다', () => {
    const meta = buildReliabilityMeta('중구', baseFetch, true);
    expect(meta.status).toBe('LIVE');
    expect(meta.label).toBe('최근 1시간 기준 실측 데이터');
  });

  it('대체 후보를 사용하면 STATION_FALLBACK 상태를 반환한다', () => {
    const meta = buildReliabilityMeta(
      '판교동',
      { ...baseFetch, resolvedStation: '성남시', usedFallbackCandidate: true },
      true,
    );
    expect(meta.status).toBe('STATION_FALLBACK');
    expect(meta.label).toBe('인근 측정소 자동 보정');
  });

  it('대체 데이터면 DEGRADED 상태를 반환한다', () => {
    const meta = buildReliabilityMeta(
      '어딘가',
      { ...baseFetch, usedFallbackData: true },
      false,
    );
    expect(meta.status).toBe('DEGRADED');
    expect(meta.label).toBe('주변 평균 대체 데이터');
    expect(meta.aiStatus).toBe('failed');
  });
});
