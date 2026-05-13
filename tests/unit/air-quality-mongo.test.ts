import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbConnectMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mongoose', () => ({
  dbConnect: dbConnectMock,
}));

function makeCursor<T>(rows: T[]) {
  return {
    sort: vi.fn(() => ({
      limit: vi.fn(() => ({
        toArray: vi.fn(async () => rows),
      })),
    })),
  };
}

describe('loadAirQualityFromMongo', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    dbConnectMock.mockReset();
  });

  afterEach(() => {
    delete process.env.AIRKOREA_DB_NAME;
    delete process.env.AIRKOREA_LATEST_COLLECTION;
    delete process.env.WEATHER_FORECAST_DB_NAME;
    delete process.env.WEATHER_FORECAST_READER_COLLECTION;
  });

  it('reads only the latest air_quality collection and does not fall back to the legacy airkorea DB', async () => {
    const primaryCollection = {
      find: vi.fn(() => makeCursor([
        {
          sidoName: '서울',
          stationName: '강남구',
          mangName: '도시대기',
          dataTime: '2026-03-19 19:00',
          measuredAtUtc: '2026-03-19T10:00:00.000Z',
          pm10Value: 12,
          pm25Value: 5,
          updatedAt: '2026-03-19T10:05:00.000Z',
          ingestedAt: '2026-03-19T10:05:00.000Z',
        },
      ])),
    };
    const forecastCollection = {
      find: vi.fn(() => makeCursor([])),
    };
    const useDbMock = vi.fn((dbName: string) => {
      if (dbName === 'air_quality') {
        return {
          collection: vi.fn(() => primaryCollection),
        };
      }

      if (dbName === 'weather_forecast') {
        return {
          collection: vi.fn(() => forecastCollection),
        };
      }

      throw new Error(`Unexpected db access: ${dbName}`);
    });

    dbConnectMock.mockResolvedValue({
      connection: {
        useDb: useDbMock,
      },
    });

    const { loadAirQualityFromMongo } = await import('../../lib/airQualityMongo');
    const result = await loadAirQualityFromMongo(['강남구'], '서울');

    expect(result).not.toBeNull();
    expect(result?.resolvedStation).toBe('강남구');
    expect(result?.raw.pm10_value).toBe(12);
    expect(useDbMock).toHaveBeenCalledWith('air_quality');
    expect(useDbMock).toHaveBeenCalledWith('weather_forecast');
    expect(useDbMock).not.toHaveBeenCalledWith('airkorea');
  });
});
