import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbConnectMock = vi.hoisted(() => vi.fn());
const getSharedCacheMock = vi.hoisted(() => vi.fn());
const setSharedCacheMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/mongoose', () => ({
  dbConnect: dbConnectMock,
}));

vi.mock('../../lib/sharedCache', () => ({
  getSharedCache: getSharedCacheMock,
  setSharedCache: setSharedCacheMock,
}));

describe('/api/weather-forecast route fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    dbConnectMock.mockReset();
    getSharedCacheMock.mockReset();
    setSharedCacheMock.mockReset();
    getSharedCacheMock.mockResolvedValue(null);
    setSharedCacheMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a degraded empty payload instead of 500 when the upstream load fails', async () => {
    dbConnectMock.mockRejectedValue(new Error('Missing env: MONGODB_URI'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { GET } = await import('../../app/api/weather-forecast/route');

    const response = await GET(
      new Request('http://localhost/api/weather-forecast?stationName=%EA%B0%95%EB%82%A8%EA%B5%AC'),
    );
    const payload = (await response.json()) as {
      requestedStation: string;
      resolvedStation: string | null;
      triedStations: string[];
      windowHours: number;
      items: unknown[];
      airQualityForecast: unknown;
      lifestyleIndices: unknown;
      timestamp: string;
    };

    expect(response.status).toBe(200);
    expect(payload.requestedStation).toBe('강남구');
    expect(payload.resolvedStation).toBeNull();
    expect(Array.isArray(payload.triedStations)).toBe(true);
    expect(payload.triedStations.length).toBeGreaterThan(0);
    expect(payload.items).toEqual([]);
    expect(payload.airQualityForecast).toBeNull();
    expect(payload.lifestyleIndices).toBeNull();
    expect(payload.windowHours).toBe(48);
    expect(payload.timestamp).toBeTruthy();
    expect(response.headers.get('x-bff-weather-cache')).toBe('primary=fallback:empty');
    expect(response.headers.get('x-degraded')).toBe('1');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(response.headers.get('server-timing')).toBeTruthy();
    expect(errorSpy).toHaveBeenCalled();
  });
});
