import { ObjectId } from 'mongodb';
import { getCollection } from './mongo';
import type { IngestRunStatus } from './types';

type StartRunInput = {
  dbName: string;
  jobName: string;
  trigger: string;
  collectionName?: string;
  ttlDays?: number;
  meta?: Record<string, unknown>;
};

type FinishRunInput = {
  dbName: string;
  runId: ObjectId;
  status: IngestRunStatus;
  collectionName?: string;
  summary?: Record<string, unknown>;
  error?: string;
};

export async function startRun({
  dbName,
  jobName,
  trigger,
  collectionName = 'ingest_runs',
  ttlDays = 30,
  meta,
}: StartRunInput) {
  const collection = await getCollection(dbName, collectionName);
  const now = new Date();
  const runId = new ObjectId();
  const expireAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  await collection.insertOne({
    _id: runId,
    jobName,
    trigger,
    status: 'running',
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expireAt,
    meta: meta || {},
  });

  return runId;
}

export async function finishRun({
  dbName,
  runId,
  status,
  collectionName = 'ingest_runs',
  summary,
  error,
}: FinishRunInput) {
  const collection = await getCollection(dbName, collectionName);
  const nowIso = new Date().toISOString();

  await collection.updateOne(
    { _id: runId },
    {
      $set: {
        status,
        summary: summary || {},
        error: error || null,
        finishedAt: nowIso,
        updatedAt: nowIso,
      },
    },
  );
}

export async function hasSuccessfulKmaBaseRun(
  dbName: string,
  collectionName: string,
  jobName: string,
  baseDate: string,
  baseTime: string,
) {
  const collection = await getCollection(dbName, collectionName);
  const existing = await collection.findOne({
    jobName,
    status: 'success',
    'meta.baseDate': baseDate,
    'meta.baseTime': baseTime,
  });

  return Boolean(existing);
}
