import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bulkUpsertMock = vi.hoisted(() => vi.fn());
const emitMetricsMock = vi.hoisted(() => vi.fn());
const fetchJsonMock = vi.hoisted(() => vi.fn());
const finishRunMock = vi.hoisted(() => vi.fn());
const getCollectionMock = vi.hoisted(() => vi.fn());
const startRunMock = vi.hoisted(() => vi.fn());

vi.mock('../../workers/public-data/src/shared/http', () => ({
  fetchJson: fetchJsonMock,
}));

vi.mock('../../workers/public-data/src/shared/metrics', () => ({
  emitMetrics: emitMetricsMock,
}));

vi.mock('../../workers/public-data/src/shared/mongo', () => ({
  bulkUpsert: bulkUpsertMock,
  getCollection: getCollectionMock,
}));

vi.mock('../../workers/public-data/src/shared/run-log', () => ({
  finishRun: finishRunMock,
  startRun: startRunMock,
}));

describe('public-data retention defaults', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      AIRKOREA_SERVICE_KEY: 'test-service-key',
      AIRKOREA_BASE_URL: 'https://example.com/airkorea',
    };
    bulkUpsertMock.mockReset();
    emitMetricsMock.mockReset();
    fetchJsonMock.mockReset();
    finishRunMock.mockReset();
    getCollectionMock.mockReset();
    startRunMock.mockReset();
    bulkUpsertMock.mockResolvedValue(null);
    finishRunMock.mockResolvedValue(undefined);
    startRunMock.mockResolvedValue('run-id');
    getCollectionMock.mockImplementation(async (_dbName: string, collectionName: string) => ({ name: collectionName }));
    fetchJsonMock.mockResolvedValue({
      response: {
        header: {
          resultCode: '00',
          resultMsg: 'OK',
        },
        body: {
          totalCount: 1,
          items: [
            {
              sidoName: '서울',
              stationName: '강남구',
              mangName: '도시대기',
              dataTime: '2026-03-19 19:00',
              pm10Value: '12',
              pm25Value: '5',
              pm10Grade: '1',
              pm25Grade: '1',
            },
          ],
        },
      },
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not write AirKorea history when AIRKOREA_WRITE_HISTORY is unset', async () => {
    delete process.env.AIRKOREA_WRITE_HISTORY;
    const { handler } = await import('../../workers/public-data/src/airkorea/handler');

    const result = await handler({
      trigger: 'manual',
      scope: ['서울'],
    } as never);

    expect(getCollectionMock.mock.calls.map(([, collectionName]) => collectionName)).not.toContain('air_quality_history');
    expect(bulkUpsertMock.mock.calls.map(([collection]) => collection.name)).toEqual([
      'airkorea_realtime_raw',
      'air_quality_latest',
    ]);
    expect(result).toMatchObject({
      status: 'success',
      historyRows: 0,
      writeHistory: false,
    });
    expect(fetchJsonMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      retryCount: 3,
      retryDelayMs: 1500,
      maxRetryDelayMs: 8000,
      retryStatusCodes: [429],
    }));
    expect(finishRunMock).toHaveBeenCalledWith(expect.objectContaining({
      summary: expect.objectContaining({
        writeHistory: false,
      }),
    }));
  });

  it('writes AirKorea history only when AIRKOREA_WRITE_HISTORY=true', async () => {
    process.env.AIRKOREA_WRITE_HISTORY = 'true';
    const { handler } = await import('../../workers/public-data/src/airkorea/handler');

    const result = await handler({
      trigger: 'manual',
      scope: ['서울'],
    } as never);

    expect(getCollectionMock.mock.calls.map(([, collectionName]) => collectionName)).toContain('air_quality_history');
    expect(bulkUpsertMock.mock.calls.map(([collection]) => collection.name)).toEqual([
      'airkorea_realtime_raw',
      'air_quality_history',
      'air_quality_latest',
    ]);
    expect(result).toMatchObject({
      status: 'success',
      historyRows: 1,
      writeHistory: true,
    });
    expect(fetchJsonMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      retryCount: 3,
      retryDelayMs: 1500,
      maxRetryDelayMs: 8000,
      retryStatusCodes: [429],
    }));
  });
});
