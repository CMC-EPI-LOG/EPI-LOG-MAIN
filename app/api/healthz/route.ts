import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { dbConnect } from '@/lib/mongoose';
import { withApiObservability } from '@/lib/api-observability';

export const runtime = 'nodejs';

const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'https://epi-log-ai.vercel.app';
const APP_VERSION = process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
const APP_ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

async function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
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

async function handleGet() {
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
      ...corsHeaders(),
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export const OPTIONS = withApiObservability('/api/healthz', 'OPTIONS', handleOptions);
export const GET = withApiObservability('/api/healthz', 'GET', handleGet);
