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

describe('public-data rate-limit defaults', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      AIRKOREA_SERVICE_KEY: 'test-service-key',
      AIRKOREA_BASE_URL: 'https://example.com/airkorea',
      AIRKOREA_FORECAST_BASE_URL: 'https://example.com/airkorea-forecast',
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
    getCollectionMock.mockImplementation(async (_dbName: string, collectionName: string) => ({
      name: collectionName,
    }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('configures 429 retries for AirKorea forecast requests', async () => {
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
              informCode: 'PM10',
              informData: '2026-03-19',
              dataTime: '2026-03-19 11시 발표',
              informGrade: '서울: 좋음',
              informOverall: '보통',
              informCause: '황사 없음',
              actionKnack: '실외활동 가능',
            },
          ],
        },
      },
    });

    const { handler } = await import('../../workers/public-data/src/airkorea-forecast/handler');
    const result = await handler({
      trigger: 'manual',
      scope: ['PM10'],
    } as never);

    expect(result).toMatchObject({
      status: 'success',
      failedCodes: 0,
    });
    expect(fetchJsonMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      retryCount: 3,
      retryDelayMs: 1500,
      maxRetryDelayMs: 8000,
      retryStatusCodes: [429],
    }));
  });
});
