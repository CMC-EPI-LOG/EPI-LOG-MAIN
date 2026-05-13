import { NextResponse } from 'next/server';
import { corsHeaders, handleCorsOptions } from '@/lib/cors';
import { dbConnect } from '@/lib/mongoose';
import { withApiObservability } from '@/lib/api-observability';
import { applyRateLimit } from '@/lib/requestRateLimit';
import { getAiApiUrl } from '@/lib/serverEnv';

export const runtime = 'nodejs';

const AI_API_URL = getAiApiUrl();
const APP_VERSION = process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
const APP_ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

async function handleOptions(request: Request) {
  return handleCorsOptions(request);
}

async function checkAiApiReachable() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${AI_API_URL}/api/healthz`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleGet(request: Request) {
  const rateLimit = applyRateLimit('/api/healthz', request, { max: 30 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: {
          ...corsHeaders(request),
          'x-rate-limit-remaining': String(rateLimit.remaining),
          'x-rate-limit-reset': String(rateLimit.resetAt),
        },
      },
    );
  }

  let mongoConfigured = false;

  if (typeof process.env.MONGODB_URI === 'string' && process.env.MONGODB_URI.trim()) {
    try {
      await dbConnect();
      mongoConfigured = true;
    } catch {
      mongoConfigured = false;
    }
  }

  const payload = {
    ok: true,
    version: APP_VERSION,
    env: APP_ENV,
    aiApiReachable: await checkAiApiReachable(),
    mongoConfigured,
    sentryEnabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  };

  return NextResponse.json(payload, {
    headers: {
      ...corsHeaders(request),
      'Cache-Control': 'no-store, max-age=0',
      'x-rate-limit-remaining': String(rateLimit.remaining),
      'x-rate-limit-reset': String(rateLimit.resetAt),
    },
  });
}

export const OPTIONS = withApiObservability('/api/healthz', 'OPTIONS', handleOptions);
export const GET = withApiObservability('/api/healthz', 'GET', handleGet);
