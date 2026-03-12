import type { AnyBulkWriteOperation } from 'mongodb';
import { getAirKoreaForecastCollections } from '../shared/collections';
import { normalizeServiceKey, optionalEnv, parseIntegerEnv, requireEnv } from '../shared/env';
import { fetchJson } from '../shared/http';
import { emitMetrics } from '../shared/metrics';
import { bulkUpsert, getCollection } from '../shared/mongo';
import { finishRun, startRun } from '../shared/run-log';
import { expireAtFromIso, parseAirKoreaForecastIssuedAt } from '../shared/time';
import type { AirKoreaForecastApiItem, ScheduledIngestEvent } from '../shared/types';
import {
  buildAirKoreaForecastLatestDoc,
  buildAirKoreaForecastRawDoc,
  extractAirKoreaForecastItems,
} from './normalize';

type AirKoreaForecastResponse = {
  response?: {
    header?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };
};

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_RAW_TTL_DAYS = 30;
const DEFAULT_RUNS_TTL_DAYS = 30;
const DEFAULT_CODES = ['PM10', 'PM25'];

function getKstSearchDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

export async function handler(event: ScheduledIngestEvent) {
  const dbName = optionalEnv('AIRKOREA_DB_NAME', 'air_quality');
  const collections = getAirKoreaForecastCollections();
  const serviceKey = normalizeServiceKey(requireEnv('AIRKOREA_SERVICE_KEY'));
  const baseUrl = requireEnv('AIRKOREA_FORECAST_BASE_URL');
  const sourceVersion = optionalEnv('AIRKOREA_FORECAST_API_VERSION', 'forecast-v1');
  const trigger = event.trigger || 'manual';
  const dryRun = Boolean(event.dryRun);
  const pageSize = parseIntegerEnv('AIRKOREA_FORECAST_PAGE_SIZE', DEFAULT_PAGE_SIZE);
  const rawTtlDays = parseIntegerEnv('AIRKOREA_FORECAST_RAW_TTL_DAYS', DEFAULT_RAW_TTL_DAYS);
  const runsTtlDays = parseIntegerEnv('AIRKOREA_FORECAST_RUNS_TTL_DAYS', DEFAULT_RUNS_TTL_DAYS);
  const searchDate = getKstSearchDate();
  const requestedCodes = event.scope && event.scope.length > 0 ? unique(event.scope) : DEFAULT_CODES;
  const runId = await startRun({
    dbName,
    collectionName: collections.runs,
    ttlDays: runsTtlDays,
    jobName: 'airkorea-forecast',
    trigger,
    meta: {
      searchDate,
      requestedCodes,
      dryRun,
    },
  });

  let fetchedRows = 0;
  let rawRows = 0;
  let latestRows = 0;
  let failedCodes = 0;
  const ingestedAt = new Date().toISOString();

  try {
    const rawCollection = await getCollection<Record<string, unknown>>(dbName, collections.raw);
    const latestCollection = await getCollection<Record<string, unknown>>(dbName, collections.latest);
    const rawOps: AnyBulkWriteOperation<Record<string, unknown>>[] = [];
    const latestOps: AnyBulkWriteOperation<Record<string, unknown>>[] = [];
    const latestIssuedAtValues: string[] = [];

    for (const requestedCode of requestedCodes) {
      try {
        let pageNo = 1;
        let totalCount = Number.MAX_SAFE_INTEGER;
        const matchedItems: AirKoreaForecastApiItem[] = [];

        while ((pageNo - 1) * pageSize < totalCount) {
          const payload = await fetchJson<AirKoreaForecastResponse>(baseUrl, {
            query: {
              serviceKey,
              returnType: 'json',
              numOfRows: pageSize,
              pageNo,
              searchDate,
              InformCode: requestedCode,
            },
            timeoutMs: 12_000,
            retryCount: 1,
          });

          const parsed = extractAirKoreaForecastItems(payload);
          totalCount = parsed.totalCount || 0;
          const items = parsed.items.filter(
            (item) => (item.informCode || '').trim().toUpperCase() === requestedCode.toUpperCase(),
          );

          matchedItems.push(...items);
          fetchedRows += items.length;
          pageNo += 1;
          if (items.length === 0) break;
        }

        const rawDocs = matchedItems.map((item) => ({
          ...buildAirKoreaForecastRawDoc(item, requestedCode, ingestedAt),
          expireAt: expireAtFromIso(ingestedAt, rawTtlDays),
        }));
        const normalizedDocs = matchedItems
          .map((item) => buildAirKoreaForecastLatestDoc(item, ingestedAt, sourceVersion))
          .filter((doc): doc is NonNullable<ReturnType<typeof buildAirKoreaForecastLatestDoc>> => Boolean(doc));

        if (normalizedDocs.length === 0) {
          failedCodes += 1;
          continue;
        }

        const latestIssuedAtMs = normalizedDocs.reduce((latest, doc) => {
          const next = Date.parse(doc.issuedAtUtc);
          return Number.isNaN(next) ? latest : Math.max(latest, next);
        }, 0);
        const latestDocs = normalizedDocs.filter((doc) => Date.parse(doc.issuedAtUtc) === latestIssuedAtMs);

        latestIssuedAtValues.push(...latestDocs.map((doc) => doc.issuedAt));

        rawOps.push(
          ...rawDocs.map((doc) => ({
            updateOne: {
              filter: {
                requestedCode: doc.requestedCode,
                informCode: doc.informCode,
                informData: doc.informData,
                dataTime: doc.dataTime,
                payloadHash: doc.payloadHash,
              },
              update: { $set: doc },
              upsert: true,
            },
          })),
        );

        latestOps.push(
          ...latestDocs.map((doc) => ({
            updateOne: {
              filter: {
                informCode: doc.informCode,
                forecastDate: doc.forecastDate,
              },
              update: { $set: doc },
              upsert: true,
            },
          })),
        );
      } catch (error) {
        failedCodes += 1;
        console.error(`[airkorea-forecast] code failed: ${requestedCode}`, error);
      }
    }

    if (!dryRun) {
      await bulkUpsert(rawCollection, rawOps);
      await bulkUpsert(latestCollection, latestOps);
    }

    rawRows = rawOps.length;
    latestRows = latestOps.length;
    const latestIssuedAt = latestIssuedAtValues
      .map((value) => ({ value, parsed: parseAirKoreaForecastIssuedAt(value)?.getTime() || 0 }))
      .sort((left, right) => right.parsed - left.parsed)[0]?.value || null;
    const status = failedCodes > 0 ? 'partial_failed' : 'success';

    emitMetrics(
      'EpiLog/PublicData',
      { JobName: 'airkorea-forecast' },
      [
        { name: 'RowsFetched', value: fetchedRows },
        { name: 'RawRowsUpserted', value: rawRows },
        { name: 'LatestRowsUpserted', value: latestRows },
        { name: 'FailedCodes', value: failedCodes },
      ],
    );

    await finishRun({
      dbName,
      runId,
      collectionName: collections.runs,
      status,
      summary: {
        searchDate,
        requestedCodes,
        latestIssuedAt,
        fetchedRows,
        rawRows,
        latestRows,
        failedCodes,
        dryRun,
      },
    });

    return {
      ok: status === 'success',
      status,
      searchDate,
      latestIssuedAt,
      fetchedRows,
      rawRows,
      latestRows,
      failedCodes,
    };
  } catch (error) {
    await finishRun({
      dbName,
      runId,
      collectionName: collections.runs,
      status: 'failed',
      summary: {
        searchDate,
        requestedCodes,
        fetchedRows,
        rawRows,
        latestRows,
        failedCodes,
        dryRun,
      },
      error: error instanceof Error ? error.message : 'Unknown AirKorea forecast ingest error',
    });

    throw error;
  }
}
