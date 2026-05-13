import type { AnyBulkWriteOperation } from 'mongodb';
import { DEFAULT_AIRKOREA_SIDOS } from '../config/airkorea-sidos';
import { buildAirKoreaLatestDoc, buildAirKoreaRawDoc, extractAirKoreaItems } from './normalize';
import { getAirKoreaCollections } from '../shared/collections';
import {
  normalizeServiceKey,
  optionalEnv,
  parseBooleanEnv,
  parseIntegerEnv,
  requireEnv,
  requireUrlEnv,
} from '../shared/env';
import { fetchJson } from '../shared/http';
import { emitMetrics } from '../shared/metrics';
import { bulkUpsert, getCollection } from '../shared/mongo';
import { finishRun, startRun } from '../shared/run-log';
import { expireAtFromIso } from '../shared/time';
import type { AirKoreaApiItem, ScheduledIngestEvent } from '../shared/types';

type AirKoreaResponse = {
  response?: {
    header?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };
};

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_RAW_TTL_DAYS = 1;
const DEFAULT_HISTORY_TTL_DAYS = 1;
const DEFAULT_RUNS_TTL_DAYS = 7;
const DEFAULT_HTTP_RETRY_COUNT = 3;
const DEFAULT_HTTP_RETRY_DELAY_MS = 1_500;
const DEFAULT_HTTP_MAX_RETRY_DELAY_MS = 8_000;
const RETRY_STATUS_CODES = [429];

export async function handler(event: ScheduledIngestEvent) {
  const dbName = optionalEnv('AIRKOREA_DB_NAME', 'air_quality');
  const collections = getAirKoreaCollections();
  const serviceKey = normalizeServiceKey(requireEnv('AIRKOREA_SERVICE_KEY'));
  const baseUrl = requireUrlEnv('AIRKOREA_BASE_URL');
  const apiVersion = optionalEnv('AIRKOREA_API_VERSION', '1.0');
  const pageSize = parseIntegerEnv('AIRKOREA_PAGE_SIZE', DEFAULT_PAGE_SIZE);
  const rawTtlDays = parseIntegerEnv('AIRKOREA_RAW_TTL_DAYS', DEFAULT_RAW_TTL_DAYS);
  const historyTtlDays = parseIntegerEnv('AIRKOREA_HISTORY_TTL_DAYS', DEFAULT_HISTORY_TTL_DAYS);
  const runsTtlDays = parseIntegerEnv('AIRKOREA_RUNS_TTL_DAYS', DEFAULT_RUNS_TTL_DAYS);
  const httpRetryCount = Math.max(
    0,
    parseIntegerEnv('AIRKOREA_HTTP_RETRY_COUNT', DEFAULT_HTTP_RETRY_COUNT),
  );
  const httpRetryDelayMs = Math.max(
    0,
    parseIntegerEnv('AIRKOREA_HTTP_RETRY_DELAY_MS', DEFAULT_HTTP_RETRY_DELAY_MS),
  );
  const httpMaxRetryDelayMs = Math.max(
    httpRetryDelayMs,
    parseIntegerEnv('AIRKOREA_HTTP_MAX_RETRY_DELAY_MS', DEFAULT_HTTP_MAX_RETRY_DELAY_MS),
  );
  const writeHistory = parseBooleanEnv('AIRKOREA_WRITE_HISTORY', false);
  const trigger = event.trigger || 'manual';
  const dryRun = Boolean(event.dryRun);
  const scopes = event.scope && event.scope.length > 0 ? event.scope : DEFAULT_AIRKOREA_SIDOS;
  const runId = await startRun({
    dbName,
    collectionName: collections.runs,
    ttlDays: runsTtlDays,
    jobName: 'airkorea-realtime',
    trigger,
    meta: {
      scopes,
      dryRun,
      writeHistory,
      httpRetryCount,
      httpRetryDelayMs,
      httpMaxRetryDelayMs,
    },
  });

  let fetchedRows = 0;
  let latestRows = 0;
  let historyRows = 0;
  let failedScopes = 0;
  const ingestedAt = new Date().toISOString();

  try {
    const rawCollection = await getCollection<Record<string, unknown>>(dbName, collections.raw);
    const historyCollection = writeHistory
      ? await getCollection<Record<string, unknown>>(dbName, collections.history)
      : null;
    const latestCollection = await getCollection<Record<string, unknown>>(dbName, collections.latest);

    for (const scope of scopes) {
      let pageNo = 1;
      let totalCount = Number.MAX_SAFE_INTEGER;
      const rawOps: AnyBulkWriteOperation<Record<string, unknown>>[] = [];
      const historyOps: AnyBulkWriteOperation<Record<string, unknown>>[] = [];
      const latestOps: AnyBulkWriteOperation<Record<string, unknown>>[] = [];

      try {
        while ((pageNo - 1) * pageSize < totalCount) {
          const payload = await fetchJson<AirKoreaResponse>(baseUrl, {
            query: {
              serviceKey,
              returnType: 'json',
              numOfRows: pageSize,
              pageNo,
              sidoName: scope,
              ver: apiVersion,
            },
            timeoutMs: 12_000,
            retryCount: httpRetryCount,
            retryDelayMs: httpRetryDelayMs,
            maxRetryDelayMs: httpMaxRetryDelayMs,
            retryStatusCodes: RETRY_STATUS_CODES,
          });

          const parsed = extractAirKoreaItems(payload);
          totalCount = parsed.totalCount || 0;
          const items = parsed.items as AirKoreaApiItem[];

          for (const item of items) {
            fetchedRows += 1;
            const rawDoc = {
              ...buildAirKoreaRawDoc(item, scope, ingestedAt),
              expireAt: expireAtFromIso(ingestedAt, rawTtlDays),
            };
            const latestDoc = buildAirKoreaLatestDoc(item, ingestedAt, apiVersion);
            if (!latestDoc) continue;
            rawOps.push({
              updateOne: {
                filter: {
                  requestScope: scope,
                  sidoName: latestDoc.sidoName,
                  stationName: latestDoc.stationName,
                  mangName: latestDoc.mangName,
                  dataTime: latestDoc.dataTime,
                  payloadHash: rawDoc.payloadHash,
                },
                update: { $set: rawDoc },
                upsert: true,
              },
            });

            if (writeHistory) {
              historyOps.push({
                updateOne: {
                  filter: {
                    sidoName: latestDoc.sidoName,
                    stationName: latestDoc.stationName,
                    mangName: latestDoc.mangName,
                    dataTime: latestDoc.dataTime,
                  },
                  update: {
                    $set: {
                      ...latestDoc,
                      expireAt: expireAtFromIso(ingestedAt, historyTtlDays),
                    },
                  },
                  upsert: true,
                },
              });
            }

            latestOps.push({
              updateOne: {
                filter: {
                  sidoName: latestDoc.sidoName,
                  stationName: latestDoc.stationName,
                  mangName: latestDoc.mangName,
                },
                update: { $set: latestDoc },
                upsert: true,
              },
            });
          }

          pageNo += 1;
          if (items.length === 0) break;
        }

        if (!dryRun) {
          await bulkUpsert(rawCollection, rawOps);
          if (historyCollection) {
            await bulkUpsert(historyCollection, historyOps);
          }
          await bulkUpsert(latestCollection, latestOps);
        }

        historyRows += historyOps.length;
        latestRows += latestOps.length;
      } catch (error) {
        failedScopes += 1;
        console.error(`[airkorea] scope failed: ${scope}`, error);
      }
    }

    const status = failedScopes > 0 ? 'partial_failed' : 'success';
    emitMetrics(
      'EpiLog/PublicData',
      { JobName: 'airkorea-realtime' },
      [
        { name: 'RowsFetched', value: fetchedRows },
        { name: 'LatestRowsUpserted', value: latestRows },
        { name: 'HistoryRowsUpserted', value: historyRows },
        { name: 'FailedScopes', value: failedScopes },
      ],
    );

    await finishRun({
      dbName,
      runId,
      collectionName: collections.runs,
      status,
      summary: {
        fetchedRows,
        latestRows,
        historyRows,
        failedScopes,
        dryRun,
        writeHistory,
        httpRetryCount,
        httpRetryDelayMs,
        httpMaxRetryDelayMs,
      },
    });

    return {
      ok: status === 'success',
      status,
      fetchedRows,
      latestRows,
      historyRows,
      failedScopes,
      writeHistory,
      httpRetryCount,
      httpRetryDelayMs,
      httpMaxRetryDelayMs,
    };
  } catch (error) {
    await finishRun({
      dbName,
      runId,
      collectionName: collections.runs,
      status: 'failed',
      summary: {
        fetchedRows,
        latestRows,
        historyRows,
        failedScopes,
        dryRun,
        writeHistory,
        httpRetryCount,
        httpRetryDelayMs,
        httpMaxRetryDelayMs,
      },
      error: error instanceof Error ? error.message : 'Unknown AirKorea ingest error',
    });

    throw error;
  }
}
