import type { AnyBulkWriteOperation } from 'mongodb';
import { KMA_LIFESTYLE_REGIONS } from '../config/kma-lifestyle-regions';
import { getKmaLifestyleCollections } from '../shared/collections';
import { normalizeServiceKey, optionalEnv, parseIntegerEnv, requireEnv } from '../shared/env';
import { fetchJson } from '../shared/http';
import { emitMetrics } from '../shared/metrics';
import { bulkUpsert, getCollection } from '../shared/mongo';
import { finishRun, startRun } from '../shared/run-log';
import { expireAtFromIso, getLatestKmaLifestyleIssueCandidates } from '../shared/time';
import type { KmaLifestyleIndexDoc, PollenType, ScheduledIngestEvent } from '../shared/types';
import {
  buildLifestyleRawDoc,
  buildPollenLatestDocs,
  buildUvLatestDocs,
  extractKmaLifestyleItems,
} from './normalize';

type LifestyleResponse = {
  response?: {
    header?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };
};

type FetchResult = {
  item: Record<string, unknown> | null;
  requestedTime: string | null;
  permissionDenied: boolean;
};

const DEFAULT_RAW_TTL_DAYS = 14;
const DEFAULT_RUNS_TTL_DAYS = 30;
const DEFAULT_TIME_CANDIDATES = 3;
const DEFAULT_SAFETY_LAG_MINUTES = 20;

const POLLEN_ENDPOINTS: Array<{ pollenType: PollenType; envName: string; fallback: string }> = [
  {
    pollenType: 'pine',
    envName: 'KMA_PINE_POLLEN_BASE_URL',
    fallback: 'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getPinePollenRiskIdxV3',
  },
  {
    pollenType: 'oak',
    envName: 'KMA_OAK_POLLEN_BASE_URL',
    fallback: 'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getOakPollenRiskIdxV3',
  },
  {
    pollenType: 'weed',
    envName: 'KMA_WEED_POLLEN_BASE_URL',
    fallback: 'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getWeedsPollenRiskndxV3',
  },
];

function normalizeScope(values: string[] | undefined) {
  return (values || [])
    .map((value) => value.trim())
    .filter(Boolean);
}

function filterRegions(scope: string[] | undefined) {
  const normalizedScope = normalizeScope(scope);
  if (normalizedScope.length === 0) return KMA_LIFESTYLE_REGIONS;

  return KMA_LIFESTYLE_REGIONS.filter((region) =>
    normalizedScope.some(
      (value) => region.sidoName === value || region.aliases.includes(value),
    ),
  );
}

async function fetchFirstAvailableItem(input: {
  baseUrl: string;
  keyParamName: 'ServiceKey' | 'serviceKey';
  serviceKey: string;
  areaNo: string;
  requestedTimes: string[];
}) {
  let lastError: unknown = null;

  for (const requestedTime of input.requestedTimes) {
    try {
      const payload = await fetchJson<LifestyleResponse>(input.baseUrl, {
        query: {
          [input.keyParamName]: input.serviceKey,
          pageNo: 1,
          numOfRows: 10,
          dataType: 'JSON',
          areaNo: input.areaNo,
          time: requestedTime,
        },
        timeoutMs: 12_000,
        retryCount: 1,
      });

      const parsed = extractKmaLifestyleItems(payload);
      if (parsed.resultCode !== '00' || parsed.items.length === 0) {
        continue;
      }

      return {
        item: parsed.items[0],
        requestedTime,
        permissionDenied: false,
      } satisfies FetchResult;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message === 'HTTP_403') {
        return {
          item: null,
          requestedTime: null,
          permissionDenied: true,
        } satisfies FetchResult;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return {
    item: null,
    requestedTime: null,
    permissionDenied: false,
  } satisfies FetchResult;
}

export async function handler(event: ScheduledIngestEvent) {
  const dbName = optionalEnv('WEATHER_FORECAST_DB_NAME', 'weather_forecast');
  const collections = getKmaLifestyleCollections();
  const sharedServiceKey = normalizeServiceKey(requireEnv('KMA_SERVICE_KEY'));
  const uvServiceKey = normalizeServiceKey(optionalEnv('KMA_UV_SERVICE_KEY', sharedServiceKey));
  const pollenServiceKey = normalizeServiceKey(
    optionalEnv('KMA_POLLEN_SERVICE_KEY', sharedServiceKey),
  );
  const uvBaseUrl = optionalEnv(
    'KMA_UV_BASE_URL',
    'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV4/getUVIdxV4',
  );
  const sourceVersion = optionalEnv('KMA_LIFESTYLE_SOURCE_VERSION', 'lifestyle-v1');
  const rawTtlDays = parseIntegerEnv('KMA_LIFESTYLE_RAW_TTL_DAYS', DEFAULT_RAW_TTL_DAYS);
  const runsTtlDays = parseIntegerEnv('KMA_LIFESTYLE_RUNS_TTL_DAYS', DEFAULT_RUNS_TTL_DAYS);
  const timeCandidateCount = parseIntegerEnv(
    'KMA_LIFESTYLE_TIME_CANDIDATE_COUNT',
    DEFAULT_TIME_CANDIDATES,
  );
  const safetyLagMinutes = parseIntegerEnv(
    'KMA_LIFESTYLE_SAFETY_LAG_MINUTES',
    DEFAULT_SAFETY_LAG_MINUTES,
  );
  const trigger = event.trigger || 'manual';
  const dryRun = Boolean(event.dryRun);
  const regions = filterRegions(event.scope);
  const requestedTimes = getLatestKmaLifestyleIssueCandidates(
    new Date(),
    timeCandidateCount,
    safetyLagMinutes,
  );

  const runId = await startRun({
    dbName,
    collectionName: collections.runs,
    ttlDays: runsTtlDays,
    jobName: 'kma-lifestyle',
    trigger,
    meta: {
      requestedRegions: regions.map((region) => region.sidoName),
      requestedTimes,
      dryRun,
    },
  });

  let rawRows = 0;
  let latestRows = 0;
  let fetchedScopes = 0;
  let uvPermissionDenied = false;
  const pollenPermissionDenied = new Set<PollenType>();
  const ingestedAt = new Date().toISOString();

  try {
    const rawCollection = await getCollection<Record<string, unknown>>(dbName, collections.raw);
    const latestCollection = await getCollection<KmaLifestyleIndexDoc>(dbName, collections.latest);
    const rawOps: AnyBulkWriteOperation<Record<string, unknown>>[] = [];
    const latestOps: AnyBulkWriteOperation<KmaLifestyleIndexDoc>[] = [];

    for (const region of regions) {
      if (!uvPermissionDenied) {
        const uvResult = await fetchFirstAvailableItem({
          baseUrl: uvBaseUrl,
          keyParamName: 'ServiceKey',
          serviceKey: uvServiceKey,
          areaNo: region.areaNo,
          requestedTimes,
        });

        if (uvResult.permissionDenied) {
          uvPermissionDenied = true;
        } else if (uvResult.item && uvResult.requestedTime) {
          fetchedScopes += 1;
          rawOps.push({
            updateOne: {
              filter: {
                category: 'UV',
                pollenType: null,
                areaNo: region.areaNo,
                requestedTime: uvResult.requestedTime,
                payloadHash: buildLifestyleRawDoc({
                  category: 'UV',
                  areaNo: region.areaNo,
                  sidoName: region.sidoName,
                  requestedTime: uvResult.requestedTime,
                  item: uvResult.item,
                  ingestedAt,
                }).payloadHash,
              },
              update: {
                $set: {
                  ...buildLifestyleRawDoc({
                    category: 'UV',
                    areaNo: region.areaNo,
                    sidoName: region.sidoName,
                    requestedTime: uvResult.requestedTime,
                    item: uvResult.item,
                    ingestedAt,
                  }),
                  expireAt: expireAtFromIso(ingestedAt, rawTtlDays),
                },
              },
              upsert: true,
            },
          });

          for (const doc of buildUvLatestDocs({
            areaNo: region.areaNo,
            sidoName: region.sidoName,
            item: uvResult.item,
            ingestedAt,
            sourceVersion,
          })) {
            latestOps.push({
              updateOne: {
                filter: {
                  category: doc.category,
                  pollenType: doc.pollenType,
                  sidoName: doc.sidoName,
                  forecastDate: doc.forecastDate,
                },
                update: { $set: doc },
                upsert: true,
              },
            });
          }
        }
      }

      for (const endpoint of POLLEN_ENDPOINTS) {
        if (pollenPermissionDenied.has(endpoint.pollenType)) continue;

        const pollenResult = await fetchFirstAvailableItem({
          baseUrl: optionalEnv(endpoint.envName, endpoint.fallback),
          keyParamName: 'serviceKey',
          serviceKey: pollenServiceKey,
          areaNo: region.areaNo,
          requestedTimes,
        });

        if (pollenResult.permissionDenied) {
          pollenPermissionDenied.add(endpoint.pollenType);
          continue;
        }

        if (!pollenResult.item || !pollenResult.requestedTime) {
          continue;
        }

        fetchedScopes += 1;
        rawOps.push({
          updateOne: {
            filter: {
              category: 'POLLEN',
              pollenType: endpoint.pollenType,
              areaNo: region.areaNo,
              requestedTime: pollenResult.requestedTime,
              payloadHash: buildLifestyleRawDoc({
                category: 'POLLEN',
                pollenType: endpoint.pollenType,
                areaNo: region.areaNo,
                sidoName: region.sidoName,
                requestedTime: pollenResult.requestedTime,
                item: pollenResult.item,
                ingestedAt,
              }).payloadHash,
            },
            update: {
              $set: {
                ...buildLifestyleRawDoc({
                  category: 'POLLEN',
                  pollenType: endpoint.pollenType,
                  areaNo: region.areaNo,
                  sidoName: region.sidoName,
                  requestedTime: pollenResult.requestedTime,
                  item: pollenResult.item,
                  ingestedAt,
                }),
                expireAt: expireAtFromIso(ingestedAt, rawTtlDays),
              },
            },
            upsert: true,
          },
        });

        for (const doc of buildPollenLatestDocs({
          areaNo: region.areaNo,
          sidoName: region.sidoName,
          pollenType: endpoint.pollenType,
          item: pollenResult.item,
          ingestedAt,
          sourceVersion,
        })) {
          latestOps.push({
            updateOne: {
              filter: {
                category: doc.category,
                pollenType: doc.pollenType,
                sidoName: doc.sidoName,
                forecastDate: doc.forecastDate,
              },
              update: { $set: doc },
              upsert: true,
            },
          });
        }
      }
    }

    const blockedCategories = [
      ...(uvPermissionDenied ? ['UV'] : []),
      ...Array.from(pollenPermissionDenied.values()).map((pollenType) => `POLLEN:${pollenType}`),
    ];

    if (rawOps.length === 0 && blockedCategories.length > 0) {
      await finishRun({
        dbName,
        runId,
        collectionName: collections.runs,
        status: 'skipped',
        summary: {
          requestedRegions: regions.map((region) => region.sidoName),
          requestedTimes,
          blockedCategories,
          reason: 'KMA lifestyle dataset permission not granted for current service key',
          dryRun,
        },
      });

      return {
        ok: false,
        status: 'skipped',
        reason: 'permission_denied',
        blockedCategories,
      };
    }

    if (!dryRun) {
      await bulkUpsert(rawCollection, rawOps);
      await bulkUpsert(latestCollection, latestOps);
    }

    rawRows = rawOps.length;
    latestRows = latestOps.length;

    emitMetrics(
      'EpiLog/PublicData',
      { JobName: 'kma-lifestyle' },
      [
        { name: 'RawRowsUpserted', value: rawRows },
        { name: 'LatestRowsUpserted', value: latestRows },
        { name: 'FetchedScopes', value: fetchedScopes },
      ],
    );

    const runStatus = blockedCategories.length > 0 ? 'partial_failed' : 'success';

    await finishRun({
      dbName,
      runId,
      collectionName: collections.runs,
      status: runStatus,
      summary: {
        requestedRegions: regions.map((region) => region.sidoName),
        requestedTimes,
        fetchedScopes,
        rawRows,
        latestRows,
        blockedCategories,
        dryRun,
      },
    });

    return {
      ok: true,
      status: runStatus,
      fetchedScopes,
      rawRows,
      latestRows,
      blockedCategories,
    };
  } catch (error) {
    await finishRun({
      dbName,
      runId,
      collectionName: collections.runs,
      status: 'failed',
      summary: {
        requestedRegions: regions.map((region) => region.sidoName),
        requestedTimes,
        fetchedScopes,
        rawRows,
        latestRows,
        dryRun,
      },
      error: error instanceof Error ? error.message : 'Unknown KMA lifestyle ingest error',
    });

    throw error;
  }
}
