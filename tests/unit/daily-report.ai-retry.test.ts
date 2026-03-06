import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  setTag: vi.fn(),
  setContext: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  setTag: sentryMocks.setTag,
  setContext: sentryMocks.setContext,
  addBreadcrumb: sentryMocks.addBreadcrumb,
  captureException: sentryMocks.captureException,
  withScope: (callback: (scope: { setTag: () => void; setLevel: () => void; setExtra: () => void }) => void) => {
    callback({
      setTag: () => {},
      setLevel: () => {},
      setExtra: () => {},
    });
  },
}));

import { POST } from '../../app/api/daily-report/route';

function createAirQualityResponse(stationName: string, overrides?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      stationName,
      sidoName: '서울',
      pm25_grade: '보통',
      pm10_grade: '보통',
      pm25_value: 20,
      pm10_value: 40,
      o3_value: 0.03,
      no2_value: 0.02,
      temp: 22,
      humidity: 45,
      ...(overrides ?? {}),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

function createAdviceResponse(summary = '테스트 결정', detail = '테스트 상세 설명') {
  return new Response(
    JSON.stringify({
      decision: summary,
      reason: detail,
      detail_answer: detail,
      three_reason: ['사유1', '사유2', '사유3'],
      actionItems: ['행동1'],
      references: ['테스트 출처'],
      pm25_value: 20,
      pm10_value: 40,
      o3_value: 0.03,
      no2_value: 0.02,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

function createPartialFallbackAdviceResponse(summary = '체육 전 상태 확인') {
  return new Response(
    JSON.stringify({
      decision: summary,
      csv_reason: '활동량이 폭증해 보통 수치도 영향받아요',
      reason: '일시적인 오류로 상세 설명을 불러오지 못했습니다. 하지만 행동 지침은 위와 같이 준수해주세요.',
      detail_answer: '일시적인 오류로 상세 설명을 불러오지 못했습니다. 하지만 행동 지침은 위와 같이 준수해주세요.',
      three_reason: [
        '일시적인 오류로 상세 분석을 불러오지 못했습니다.',
        '하지만 **행동 지침**은 위와 같이 준수해주세요.',
        '문제가 지속되면 **관리자**에게 문의하세요.',
      ],
      actionItems: ['중간 수분 섭취', '활동 후 양치', '대기질 수시 체크'],
      references: [],
      pm25_value: 34,
      pm10_value: 42,
      o3_value: 0.034,
      no2_value: 0.013,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('/api/daily-report ai retry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AI 1차 타임아웃 시 재시도로 복구한다', async () => {
    let aiCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes('/api/air-quality')) {
        return createAirQualityResponse('성북구');
      }

      if (url.includes('/api/advice')) {
        aiCallCount += 1;
        if (aiCallCount === 1) {
          throw new Error('AI API timeout after 3200ms');
        }
        return createAdviceResponse('실외 체육은 쉬어요', '재시도 성공 상세');
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationName: '강남구',
        profile: { ageGroup: 'elementary_low', condition: 'none' },
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      aiGuide: {
        summary?: string;
        detail?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(aiCallCount).toBe(2);
    expect(payload.aiGuide.summary).toBe('실외 체육은 쉬어요');
    expect(payload.aiGuide.detail).toContain('재시도 성공');
  });

  it('AI 4xx 에러는 재시도하지 않고 폴백 응답을 반환한다', async () => {
    let aiCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes('/api/air-quality')) {
        return createAirQualityResponse('송파구');
      }

      if (url.includes('/api/advice')) {
        aiCallCount += 1;
        return new Response(JSON.stringify({ error: 'bad request' }), {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationName: '송파구',
        profile: { ageGroup: 'elementary_low', condition: 'none' },
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      aiGuide: {
        summary?: string;
        detail?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(aiCallCount).toBe(1);
    expect(payload.aiGuide.summary).toContain('지금은 정보를 가져올 수 없어요');
    expect(payload.aiGuide.detail).toContain('AI 선생님이 잠시 쉬고 있어요');
  });

  it('AI 403 + 측정소 보정 케이스에서도 추가 AI 재호출 없이 폴백한다', async () => {
    let aiCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes('/api/air-quality')) {
        return createAirQualityResponse('중구');
      }

      if (url.includes('/api/advice')) {
        aiCallCount += 1;
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationName: '서울 중구',
        profile: { ageGroup: 'elementary_low', condition: 'none' },
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      aiGuide: {
        summary?: string;
        detail?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(aiCallCount).toBe(1);
    expect(payload.aiGuide.summary).toContain('지금은 정보를 가져올 수 없어요');
    expect(payload.aiGuide.detail).toContain('AI 선생님이 잠시 쉬고 있어요');
  });

  it('측정소 보정 시에도 AI/대기 측정값이 일치하면 재호출을 생략한다', async () => {
    let aiCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes('/api/air-quality')) {
        return createAirQualityResponse('중구');
      }

      if (url.includes('/api/advice')) {
        aiCallCount += 1;
        return createAdviceResponse('종합 판단', '일치 데이터');
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationName: '서울 중구',
        profile: { ageGroup: 'elementary_low', condition: 'none' },
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      aiGuide: {
        summary?: string;
        detail?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(aiCallCount).toBe(1);
    expect(payload.aiGuide.summary).toBe('종합 판단');
    expect(payload.aiGuide.detail).toContain('일치 데이터');
  });

  it('AI 업스트림 실패 시 stale 캐시 가이드를 사용해 복구한다', async () => {
    const now = new Date('2026-03-06T00:00:00.000Z').getTime();
    let nowOffsetMs = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now + nowOffsetMs);

    let aiCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes('/api/air-quality')) {
        return createAirQualityResponse('강남구');
      }

      if (url.includes('/api/advice')) {
        aiCallCount += 1;
        if (aiCallCount === 1) {
          return createAdviceResponse('캐시 가능한 결정', '초기 성공 응답');
        }
        throw new Error('fetch failed');
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const createRequest = () => new Request('http://localhost/api/daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationName: '성북구',
        profile: { ageGroup: 'elementary_low', condition: 'none' },
      }),
    });

    const first = await POST(createRequest());
    const firstPayload = (await first.json()) as {
      aiGuide: {
        summary?: string;
      };
      reliability: {
        aiStatus?: string;
      };
    };

    expect(first.status).toBe(200);
    expect(firstPayload.aiGuide.summary).toBe('캐시 가능한 결정');
    expect(firstPayload.reliability.aiStatus).toBe('ok');

    // Move time forward beyond in-memory TTL(5m) but within stale window(30m).
    nowOffsetMs = 6 * 60 * 1000;

    const second = await POST(createRequest());
    const secondPayload = (await second.json()) as {
      aiGuide: {
        summary?: string;
        detail?: string;
      };
      reliability: {
        aiStatus?: string;
      };
    };

    expect(second.status).toBe(200);
    expect(secondPayload.aiGuide.summary).toBe('캐시 가능한 결정');
    expect(secondPayload.aiGuide.detail).toContain('초기 성공 응답');
    expect(secondPayload.reliability.aiStatus).toBe('ok');
    // 1st call success + 2nd call retries(3 attempts with strengthened policy)
    expect(aiCallCount).toBe(4);
  });

  it('AI 부분 fallback 응답이면 detail/threeReason를 로컬 복구하고 failed로 표기한다', async () => {
    let aiCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes('/api/air-quality')) {
        return createAirQualityResponse('서대문구');
      }

      if (url.includes('/api/advice')) {
        aiCallCount += 1;
        return createPartialFallbackAdviceResponse();
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const createRequest = () => new Request('http://localhost/api/daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationName: '서대문구',
        profile: { ageGroup: 'elementary_low', condition: 'none' },
      }),
    });

    const first = await POST(createRequest());
    const firstPayload = (await first.json()) as {
      aiGuide: {
        summary?: string;
        detail?: string;
        threeReason?: string[];
      };
      reliability: {
        aiStatus?: string;
      };
    };

    expect(first.status).toBe(200);
    expect(aiCallCount).toBe(3);
    expect(firstPayload.aiGuide.summary).toBe('체육 전 상태 확인');
    expect(firstPayload.aiGuide.detail).toContain('활동량이 폭증해 보통 수치도 영향받아요');
    expect(firstPayload.aiGuide.detail).toContain('우선 중간 수분 섭취, 활동 후 양치부터 챙겨주세요.');
    expect(firstPayload.aiGuide.detail).not.toContain('일시적인 오류로 상세 설명');
    expect(firstPayload.aiGuide.threeReason).toEqual([
      '활동량이 폭증해 보통 수치도 영향받아요',
      '초미세먼지 34ug/m3, 미세먼지 42ug/m3, 오존 0.034ppm, 이산화질소 0.013ppm 기준으로 판단했어요.',
      '우선 중간 수분 섭취, 활동 후 양치부터 챙겨주세요.',
    ]);
    expect(firstPayload.reliability.aiStatus).toBe('failed');

    const second = await POST(createRequest());
    const secondPayload = (await second.json()) as {
      aiGuide: {
        detail?: string;
      };
      reliability: {
        aiStatus?: string;
      };
    };

    expect(second.status).toBe(200);
    expect(aiCallCount).toBe(6);
    expect(secondPayload.aiGuide.detail).toContain('활동량이 폭증해 보통 수치도 영향받아요');
    expect(secondPayload.reliability.aiStatus).toBe('failed');
  });
});
