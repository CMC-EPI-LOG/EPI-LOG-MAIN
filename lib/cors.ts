import { NextResponse } from "next/server";
import { isAllowedCorsOrigin } from "@/lib/serverEnv";

const DEFAULT_ALLOWED_METHODS = "GET,POST,OPTIONS";
const DEFAULT_ALLOWED_HEADERS =
  "Content-Type, Authorization, X-Request-Id, X-Requested-With";
const DEFAULT_EXPOSED_HEADERS =
  "x-request-id, x-degraded, x-rate-limit-remaining, x-rate-limit-reset, server-timing, x-bff-ai-cache, x-bff-air-cache, x-bff-weather-cache, x-bff-clothing-cache";

function resolveAllowedOrigin(request?: Request): string | null {
  const origin = request?.headers.get("origin");
  if (!origin) return null;
  return isAllowedCorsOrigin(origin) ? origin : null;
}

export function corsHeaders(request?: Request) {
  const allowedOrigin = resolveAllowedOrigin(request);

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Methods": DEFAULT_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": DEFAULT_EXPOSED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  };
}

export function handleCorsOptions(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedCorsOrigin(origin)) {
    return NextResponse.json(
      { error: "CORS_ORIGIN_DENIED" },
      {
        status: 403,
        headers: corsHeaders(),
      },
    );
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
