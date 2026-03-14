import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('/api/reverse-geocode route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.env.KAKAO_REST_API_KEY = 'test-kakao-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KAKAO_REST_API_KEY;
  });

  it('falls back to the provided station when Kakao returns no region documents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ documents: [] }), { status: 200 })),
    );

    const { POST } = await import('../../app/api/reverse-geocode/route');

    const response = await POST(new Request('http://localhost/api/reverse-geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: 40.7128,
        lng: -74.006,
        fallbackStationName: '강남구',
      }),
    }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      address: null,
      regionName: '강남구',
      stationCandidate: '강남구',
      fallbackApplied: true,
    });
  });

  it('keeps returning unsupported when there is no fallback station to use', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ documents: [] }), { status: 200 })),
    );

    const { POST } = await import('../../app/api/reverse-geocode/route');

    const response = await POST(new Request('http://localhost/api/reverse-geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: 40.7128,
        lng: -74.006,
      }),
    }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      error: 'UNSUPPORTED_COORDINATES',
    });
  });

  it('uses the provided fallback station when Kakao returns a 4xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'auth denied' }), { status: 403 })),
    );

    const { POST } = await import('../../app/api/reverse-geocode/route');

    const response = await POST(new Request('http://localhost/api/reverse-geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: 37.5665,
        lng: 126.978,
        fallbackStationName: '중구',
      }),
    }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      regionName: '중구',
      stationCandidate: '중구',
      fallbackApplied: true,
    });
  });
});
