import { createHash } from 'node:crypto';
import { dbConnect } from '@/lib/mongoose';
import { RuntimeSharedCache } from '@/models/RuntimeSharedCache';

export type SharedCacheState = 'shared' | 'stale';

export type SharedCachePolicy = {
  freshMs: number;
  staleMs: number;
  hardTtlMs?: number;
};

export type SharedCacheHit<T> = {
  state: SharedCacheState;
  value: T;
  updatedAt: string;
};

const CACHE_ENABLED = process.env.BFF_SHARED_CACHE_ENABLED !== '0';
const DEFAULT_HARD_TTL_MS = Number(process.env.BFF_SHARED_CACHE_HARD_TTL_MS || 24 * 60 * 60 * 1000);

let indexesReady = false;

function isMongoConfigured() {
  return typeof process.env.MONGODB_URI === 'string' && process.env.MONGODB_URI.trim().length > 0;
}

function sanitizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '-');
}

function buildDocId(scope: string, cacheKey: string): string {
  const digest = createHash('sha256').update(`${scope}:${cacheKey}`).digest('hex');
  return `${sanitizeToken(scope)}:${digest}`;
}

async function ensureCacheIndexes() {
  if (indexesReady) return;
  await dbConnect();
  await RuntimeSharedCache.syncIndexes();
  indexesReady = true;
}

export function isSharedCacheEnabled() {
  return CACHE_ENABLED && isMongoConfigured();
}

export async function getSharedCache<T>(
  scope: string,
  cacheKey: string,
  options?: { allowStale?: boolean },
): Promise<SharedCacheHit<T> | null> {
  if (!isSharedCacheEnabled()) return null;

  try {
    await ensureCacheIndexes();
    const doc = await RuntimeSharedCache.findById(buildDocId(scope, cacheKey)).lean();
    if (!doc) return null;

    const now = Date.now();
    const freshUntil = new Date(doc.freshUntil).getTime();
    const staleUntil = new Date(doc.staleUntil).getTime();
    if (!Number.isFinite(staleUntil) || staleUntil <= now) {
      return null;
    }

    const isFresh = Number.isFinite(freshUntil) && freshUntil > now;
    if (!isFresh && !options?.allowStale) {
      return null;
    }

    const updatedAt = new Date(doc.updatedAt).toISOString();
    return {
      state: isFresh ? 'shared' : 'stale',
      value: doc.value as T,
      updatedAt,
    };
  } catch (error) {
    console.warn(`[shared-cache] read failed scope=${scope}:`, error);
    return null;
  }
}

export async function setSharedCache<T>(
  scope: string,
  cacheKey: string,
  value: T,
  policy: SharedCachePolicy,
): Promise<void> {
  if (!isSharedCacheEnabled()) return;

  try {
    await ensureCacheIndexes();
    const now = Date.now();
    const freshUntil = new Date(now + policy.freshMs);
    const staleUntil = new Date(now + policy.staleMs);
    const expireAt = new Date(now + Math.max(policy.hardTtlMs ?? DEFAULT_HARD_TTL_MS, policy.staleMs));

    await RuntimeSharedCache.updateOne(
      { _id: buildDocId(scope, cacheKey) },
      {
        $set: {
          scope,
          cacheKey,
          value,
          freshUntil,
          staleUntil,
          expireAt,
          updatedAt: new Date(now),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.warn(`[shared-cache] write failed scope=${scope}:`, error);
  }
}
