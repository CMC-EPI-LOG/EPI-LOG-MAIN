import { describe, expect, it } from 'vitest';
import {
  buildReliabilityMeta,
  deriveDecisionSignals,
  type AirFetchResult,
  type AirQualityView,
  type AiGuideView,
  type ProfileInput,
} from '../../lib/dailyReportDecision';

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
