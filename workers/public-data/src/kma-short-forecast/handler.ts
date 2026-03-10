import { FORECAST_GRIDS } from '../config/forecast-grids';
import { extractKmaItems, buildForecastDocuments } from './normalize';
import { getWeatherForecastCollections } from '../shared/collections';
import { normalizeServiceKey, optionalEnv, parseIntegerEnv, requireEnv } from '../shared/env';
import { fetchJson } from '../shared/http';
import { emitMetrics } from '../shared/metrics';
import { bulkUpsert, getCollection } from '../shared/mongo';
import { finishRun, hasSuccessfulKmaBaseRun, startRun } from '../shared/run-log';
import { expireAtFromIso, getLatestSafeKmaShortForecastBase } from '../shared/time';
import type { ForecastGrid, KmaShortForecastApiItem, ScheduledIngestEvent } from '../shared/types';

type KmaResponse = {
  response?: {
    header?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };
};

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_FORECAST_TTL_DAYS = 14;
const DEFAULT_RUNS_TTL_DAYS = 30;

export async function handler(event: ScheduledIngestEvent) {
  const dbName = optionalEnv('WEATHER_FORECAST_DB_NAME', 'weather_forecast');
  const collections = getWeatherForecastCollections();
  const serviceKey = normalizeServiceKey(requireEnv('KMA_SERVICE_KEY'));
  const baseUrl = requireEnv('KMA_BASE_URL');
  const trigger = event.trigger || 'manual';
  const dryRun = Boolean(event.dryRun);
  const pageSize = parseIntegerEnv('KMA_PAGE_SIZE', DEFAULT_PAGE_SIZE);
  const forecastTtlDays = parseIntegerEnv('WEATHER_FORECAST_WRITER_TTL_DAYS', DEFAULT_FORECAST_TTL_DAYS);
  const runsTtlDays = parseIntegerEnv('WEATHER_FORECAST_RUNS_TTL_DAYS', DEFAULT_RUNS_TTL_DAYS);
  const base = getLatestSafeKmaShortForecastBase(new Date(), parseIntegerEnv('KMA_SAFETY_LAG_MINUTES', 20));
  const selectedGrids = selectGrids(event.scope);

  if (!base) {
    return {
      ok: false,
      status: 'skipped',
      reason: 'No safe KMA base time available',
    };
  }

  const alreadyRun = await hasSuccessfulKmaBaseRun(
    dbName,
    collections.runs,
    'kma-short-forecast',
    base.baseDate,
    base.baseTime,
  );
  if (alreadyRun && trigger === 'scheduler') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'Base already ingested successfully',
      base,
    };
  }

  const runId = await startRun({
    dbName,
    collectionName: collections.runs,
    ttlDays: runsTtlDays,
    jobName: 'kma-short-forecast',
    trigger,
    meta: {
      baseDate: base.baseDate,
      baseTime: base.baseTime,
      gridCount: selectedGrids.length,
      dryRun,
    },
  });

  let fetchedRows = 0;
  let upsertedRows = 0;
  let failedGrids = 0;
  const ingestedAt = new Date().toISOString();

  try {
    const collection = await getCollection<Record<string, unknown>>(dbName, collections.writer);

    for (const grid of selectedGrids) {
      try {
        let pageNo = 1;
        let totalCount = Number.MAX_SAFE_INTEGER;
        const allItems: KmaShortForecastApiItem[] = [];

        while ((pageNo - 1) * pageSize < totalCount) {
          const payload = await fetchJson<KmaResponse>(baseUrl, {
            query: {
              serviceKey,
              pageNo,
              numOfRows: pageSize,
              dataType: optionalEnv('KMA_DATA_TYPE', 'JSON'),
              base_date: base.baseDate,
              base_time: base.baseTime,
              nx: grid.nx,
              ny: grid.ny,
            },
            timeoutMs: 12_000,
            retryCount: 1,
          });

          const parsed = extractKmaItems(payload);
          totalCount = parsed.totalCount || 0;
          const items = parsed.items as KmaShortForecastApiItem[];
          allItems.push(...items);
          fetchedRows += items.length;
          pageNo += 1;
          if (items.length === 0) break;
        }

        const docs = buildForecastDocuments(grid, base.baseDate, base.baseTime, allItems, ingestedAt).map(
          (doc) => ({
            ...doc,
            expireAt: expireAtFromIso(ingestedAt, forecastTtlDays),
          }),
        );
        const ops = docs.map((doc) => ({
          updateOne: {
            filter: {
              regionKey: doc.regionKey,
              forecastAtUtc: doc.forecastAtUtc,
              stationName: doc.stationName,
            },
            update: { $set: doc },
            upsert: true,
          },
        }));

        if (!dryRun) {
          await bulkUpsert(collection, ops);
        }

        upsertedRows += ops.length;
      } catch (error) {
        failedGrids += 1;
        console.error(`[kma-short-forecast] grid failed: ${grid.regionKey}`, error);
      }
    }

    const status = failedGrids > 0 ? 'partial_failed' : 'success';
    emitMetrics(
      'EpiLog/PublicData',
      { JobName: 'kma-short-forecast' },
      [
        { name: 'RowsFetched', value: fetchedRows },
        { name: 'RowsUpserted', value: upsertedRows },
        { name: 'FailedGrids', value: failedGrids },
      ],
    );

    await finishRun({
      dbName,
      runId,
      collectionName: collections.runs,
      status,
      summary: {
        baseDate: base.baseDate,
        baseTime: base.baseTime,
        fetchedRows,
        upsertedRows,
        failedGrids,
        dryRun,
      },
    });

    return {
      ok: status === 'success',
      status,
      base,
      fetchedRows,
      upsertedRows,
      failedGrids,
    };
  } catch (error) {
    await finishRun({
      dbName,
      runId,
      collectionName: collections.runs,
      status: 'failed',
      summary: {
        baseDate: base.baseDate,
        baseTime: base.baseTime,
        fetchedRows,
        upsertedRows,
        failedGrids,
        dryRun,
      },
      error: error instanceof Error ? error.message : 'Unknown KMA ingest error',
    });

    throw error;
  }
}

function selectGrids(scope?: string[]): ForecastGrid[] {
  if (!scope || scope.length === 0) {
    return FORECAST_GRIDS;
  }

  const scopeSet = new Set(scope);
  return FORECAST_GRIDS.filter(
    (grid) =>
      scopeSet.has(grid.regionKey)
      || scopeSet.has(grid.stationName)
      || grid.stationNames.some((stationName) => scopeSet.has(stationName)),
  );
}
