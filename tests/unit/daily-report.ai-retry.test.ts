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
        return createAirQualityResponse('강남구');
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
});
