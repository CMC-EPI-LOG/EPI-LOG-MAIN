import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/clothing-recommendation/route';

describe('/api/clothing-recommendation route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AI endpoint 응답을 전달한다', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          summary: '더운 날씨예요. 열 배출이 잘되는 복장이 좋아요.',
          recommendation: '반팔 + 반바지/얇은 바지 + 통풍 좋은 소재',
          tips: ['습도가 높아요. 땀 배출이 잘되는 소재를 권장해요.'],
          comfortLevel: 'HOT',
          temperature: 29,
          humidity: 78,
          source: 'rule-based-v1',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/clothing-recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: 29, humidity: 78 }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      summary: string;
      recommendation: string;
      tips: string[];
      source: string;
    };

    const fetchCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(fetchCall[0]).toContain('/api/clothing-recommendation');
    expect(fetchCall[1].method).toBe('POST');
    expect(fetchCall[1].body).toBe(JSON.stringify({
      temperature: 29,
      humidity: 78,
      userProfile: null,
      airQuality: null,
      airGrade: null,
    }));

    expect(payload.summary).toContain('더운 날씨');
    expect(payload.recommendation).toContain('반팔');
    expect(payload.source).toBe('rule-based-v1');
  });

  it('AI 호출 실패 시 BFF fallback을 반환한다', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network failed');
    });

    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/clothing-recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: 3, humidity: 25 }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      source: string;
      recommendation: string;
      tips: string[];
    };

    expect(payload.source).toBe('fallback-bff');
    expect(payload.recommendation).toContain('코트');
    expect(payload.tips.length).toBeGreaterThan(0);
  });
});
