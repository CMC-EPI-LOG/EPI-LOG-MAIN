type RateLimitKey = string;

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

const DEFAULT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000);
const DEFAULT_MAX = Number(process.env.API_RATE_LIMIT_MAX_PER_IP || 60);
const buckets = new Map<RateLimitKey, Bucket>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
  const primary = forwarded.split(',')[0]?.trim();
  return primary || 'unknown';
}

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function applyRateLimit(route: string, request: Request): RateLimitResult {
  const now = Date.now();
  pruneBuckets(now);

  const windowMs = Number.isFinite(DEFAULT_WINDOW_MS) && DEFAULT_WINDOW_MS > 0 ? DEFAULT_WINDOW_MS : 60_000;
  const max = Number.isFinite(DEFAULT_MAX) && DEFAULT_MAX > 0 ? DEFAULT_MAX : 60;
  const key = `${route}:${getClientIp(request)}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(max - 1, 0),
      resetAt: now + windowMs,
    };
  }

  existing.count += 1;
  const remaining = Math.max(max - existing.count, 0);
  if (existing.count > max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  return {
    allowed: true,
    remaining,
    resetAt: existing.resetAt,
  };
}
