import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('request validation security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KAKAO_REST_API_KEY;
  });

  it('/api/daily-report rejects malformed JSON', async () => {
    const { POST } = await import('../../app/api/daily-report/route');
    const response = await POST(new Request('http://localhost/api/daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"stationName":"강남구"',
    }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('INVALID_JSON');
  });

  it('/api/daily-report rejects unexpected top-level fields', async () => {
    const { POST } = await import('../../app/api/daily-report/route');
    const response = await POST(new Request('http://localhost/api/daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationName: '강남구',
        profile: { ageGroup: 'elementary_low', condition: 'none' },
        role: 'admin',
      }),
    }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('INVALID_PAYLOAD');
  });

  it('/api/clothing-recommendation rejects unexpected top-level fields', async () => {
    const { POST } = await import('../../app/api/clothing-recommendation/route');
    const response = await POST(new Request('http://localhost/api/clothing-recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        temperature: 21,
        humidity: 40,
        secret: 'should-not-pass',
      }),
    }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('INVALID_PAYLOAD');
  });

  it('/api/reverse-geocode rejects unexpected top-level fields', async () => {
    process.env.KAKAO_REST_API_KEY = 'test-kakao-key';
    const { POST } = await import('../../app/api/reverse-geocode/route');
    const response = await POST(new Request('http://localhost/api/reverse-geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: 37.5665,
        lng: 126.978,
        orgId: 'tenant-b',
      }),
    }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('INVALID_PAYLOAD');
  });

  it('denies CORS preflight from untrusted origins', async () => {
    const { OPTIONS } = await import('../../app/api/healthz/route');
    const response = await OPTIONS(new Request('http://localhost/api/healthz', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example.com',
        'Access-Control-Request-Method': 'GET',
      },
    }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe('CORS_ORIGIN_DENIED');
  });
});
