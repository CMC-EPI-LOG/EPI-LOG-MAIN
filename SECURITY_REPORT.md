# Security Report

## Scope

This repository is a public consumer application, not a multi-tenant authenticated SaaS control plane.
The security posture implemented here assumes:

- all public routes receive hostile input
- all provider and database credentials remain server-only
- no browser code can directly call secret provider APIs
- no debug surface is reachable in production unless explicitly enabled

Implemented hardening is centered in:

- `/Users/lux/Documents/EPI-LOG-MAIN/lib/serverEnv.ts`
- `/Users/lux/Documents/EPI-LOG-MAIN/lib/cors.ts`
- `/Users/lux/Documents/EPI-LOG-MAIN/lib/securityRedaction.ts`
- `/Users/lux/Documents/EPI-LOG-MAIN/lib/requestBody.ts`
- `/Users/lux/Documents/EPI-LOG-MAIN/app/api`
- `/Users/lux/Documents/EPI-LOG-MAIN/workers/public-data/src/shared/env.ts`

## 1. Authenticated Routes

Current authenticated routes: none.

Reason:

- the app router contains only public operational routes
- no session, JWT, Supabase Auth, Clerk, NextAuth, or custom auth middleware exists in this repository
- no route accepts client-supplied `userId`, `orgId`, or role values as an authorization substitute

Current public routes:

- `GET /api/air-quality-latest`
- `POST /api/clothing-recommendation`
- `POST /api/daily-report`
- `GET /api/healthz`
- `POST /api/log`
- `POST /api/reverse-geocode`
- `GET /api/weather-forecast`

## 2. Admin-Only Routes

Current admin-only routes: none.

Verification:

- there is no `app/admin`, `app/internal`, `app/ops`, webhook, or upload route
- `/test-sentry` exists only as a debug page and is blocked in production unless `ENABLE_DEBUG_PAGES=1`

Relevant guard:

- `/Users/lux/Documents/EPI-LOG-MAIN/app/test-sentry/page.tsx`

## 3. Resource Access Scoping

There are no tenant-owned resources in this repository.

Resource inventory:

| Resource | Tenant-owned | Access scope |
| --- | --- | --- |
| `RuntimeSharedCache` | No | Server-only cache backing BFF responses; no direct client DB access |
| `EventLog` | No | Public write-only ingestion through `/api/log`; no read API exposed |
| `SessionSummary` | No | Server-only aggregation derived from `/api/log`; no client read route |
| Air quality Mongo collections | No | Public environmental data read by server routes and written by workers only |
| Weather/lifestyle Mongo collections | No | Public forecast data read by server routes and written by workers only |

## 4. Supabase RLS Policies

None.

Reason:

- this repository does not use Supabase client SDKs, Supabase Auth, Supabase storage, or exposed SQL tables
- no RLS policy was required or created here

## 5. Environment Variables

### Client-safe

- `NEXT_PUBLIC_GA_ID`
- `NEXT_PUBLIC_GA4_ID`
- `NEXT_PUBLIC_KAKAO_JS_KEY`
- `NEXT_PUBLIC_PLATFORM`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SITE_URL`
- `VITE_API_BASE`
- `VITE_SENTRY_RELEASE`

### Server-only

- `AI_API_URL`
- `KAKAO_REST_API_KEY`
- `MONGODB_URI`
- `MONGODB_DB`
- `SITE_URL`
- `CORS_ALLOWED_ORIGINS`
- `ENABLE_DEBUG_PAGES`
- `APP_VERSION`
- `API_RATE_LIMIT_WINDOW_MS`
- `API_RATE_LIMIT_MAX_PER_IP`
- `BFF_SHARED_CACHE_ENABLED`
- `BFF_SHARED_CACHE_HARD_TTL_MS`
- `DAILY_REPORT_AI_CACHE_TTL_MS`
- `DAILY_REPORT_AI_CACHE_MAX_ENTRIES`
- `DAILY_REPORT_AI_CACHE_STALE_MS`
- `DAILY_REPORT_AI_TIMEOUT_MS`
- `DAILY_REPORT_AI_PRIMARY_RETRY_COUNT`
- `DAILY_REPORT_AI_PRIMARY_RETRY_TIMEOUT_MS`
- `DAILY_REPORT_AI_PRIMARY_RETRY_BACKOFF_MS`
- `DAILY_REPORT_AIR_MAX_CANDIDATES`
- `DAILY_REPORT_AIR_CACHE_TTL_MS`
- `DAILY_REPORT_AIR_CACHE_MAX_ENTRIES`
- `DAILY_REPORT_AIR_CACHE_STALE_MS`
- `AIRKOREA_DB_NAME`
- `AIRKOREA_LATEST_COLLECTION`
- `AIRKOREA_LEGACY_DB_NAME`
- `AIRKOREA_LEGACY_COLLECTION`
- `AIRKOREA_FORECAST_READER_COLLECTION`
- `WEATHER_FORECAST_DB_NAME`
- `WEATHER_FORECAST_READER_COLLECTION`
- `KMA_LIFESTYLE_READER_COLLECTION`
- `LOG_ALERT_WINDOW_MS`
- `LOG_ALERT_MIN_REQUESTS_5XX`
- `LOG_ALERT_MIN_EVENTS_DROP`
- `LOG_ALERT_MIN_PAGEVIEWS_FALLBACK`
- `LOG_ALERT_MIN_SHARE_ATTEMPTS`
- `LOG_ALERT_MAX_5XX_RATE`
- `LOG_ALERT_MAX_DROP_RATE`
- `LOG_ALERT_MAX_FALLBACK_EXPOSED_RATIO`
- `LOG_ALERT_MAX_SHARE_FAILURE_RATIO`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_DSN`
- `SENTRY_RELEASE`
- `DISCORD_WEBHOOK_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `AIRKOREA_SERVICE_KEY`
- `AIRKOREA_BASE_URL`
- `AIRKOREA_FORECAST_BASE_URL`
- `KMA_SERVICE_KEY`
- `KMA_BASE_URL`
- `KMA_LIFESTYLE_UV_BASE_URL`
- `KMA_LIFESTYLE_POLLEN_BASE_URL`
- `AIRKOREA_RAW_COLLECTION`
- `AIRKOREA_HISTORY_COLLECTION`
- `AIRKOREA_RUNS_COLLECTION`
- `AIRKOREA_FORECAST_RAW_COLLECTION`
- `AIRKOREA_FORECAST_LATEST_COLLECTION`
- `AIRKOREA_FORECAST_RUNS_COLLECTION`
- `WEATHER_FORECAST_WRITER_COLLECTION`
- `WEATHER_FORECAST_RUNS_COLLECTION`
- `KMA_LIFESTYLE_RAW_COLLECTION`
- `KMA_LIFESTYLE_LATEST_COLLECTION`
- `KMA_LIFESTYLE_RUNS_COLLECTION`
- `AIRKOREA_RAW_TTL_DAYS`
- `AIRKOREA_HISTORY_TTL_DAYS`
- `AIRKOREA_RUNS_TTL_DAYS`
- `AIRKOREA_FORECAST_RAW_TTL_DAYS`
- `AIRKOREA_FORECAST_RUNS_TTL_DAYS`
- `WEATHER_FORECAST_WRITER_TTL_DAYS`
- `WEATHER_FORECAST_RUNS_TTL_DAYS`
- `KMA_LIFESTYLE_RAW_TTL_DAYS`
- `KMA_LIFESTYLE_RUNS_TTL_DAYS`
- `AWS_REGION`
- `CDK_DEFAULT_ACCOUNT`
- `CDK_DEFAULT_REGION`
- `CI`
- `NODE_ENV`
- `NEXT_RUNTIME`
- `VERCEL`
- `VERCEL_ENV`
- `VERCEL_GIT_COMMIT_SHA`
- `VERCEL_URL`

### Legacy compatibility

- `NEXT_PUBLIC_AI_API_URL`

Notes:

- `NEXT_PUBLIC_AI_API_URL` is still accepted on the server for backward compatibility, but new code should prefer server-only `AI_API_URL`
- tests assert that server-only secrets are not referenced from client-executable code

## 6. Webhook Verification Logic

None in this repository.

Reason:

- there is no Stripe webhook
- there is no signed inbound webhook handler
- there is no external callback endpoint that relies on request signature validation

## 7. Rate Limits and Abuse Protections

Implemented protections:

- default IP rate limit: `60 requests / 60 seconds`
- tighter IP rate limit for sensitive low-cost routes:
  - `/api/healthz`: `30 / 60s`
  - `/api/log`: `30 / 60s`
  - `/api/reverse-geocode`: `30 / 60s`
- strict request schema validation with unknown-field rejection on:
  - `/api/daily-report`
  - `/api/clothing-recommendation`
  - `/api/reverse-geocode`
  - `/api/log`
- request size caps:
  - reverse geocode body limit
  - log ingestion body limit `64KB`
- log ingestion batch cap: max `100` events per request
- expensive BFF routes keep shared cache and stale fallback behavior instead of unbounded upstream fan-out
- CORS is now allowlist-based instead of `*`
- upstream URLs are validated as absolute HTTPS URLs and reject localhost/private hosts
- production startup fails fast on missing critical envs currently required for reverse geocoding
- debug page is off in production unless explicitly enabled
- Sentry server/edge events are sanitized and IP PII is removed before send

## 8. Security Assumptions and Remaining Risks

### Security assumptions

- this app is currently public and does not expose private customer data
- MongoDB is reachable only from trusted server environments
- Vercel environment-variable separation is correctly configured for development, preview, and production
- AI upstream is trusted infrastructure but still treated as untrusted network dependency

### Remaining risks

- there is still no authentication or authorization layer because the current product does not yet expose user-private or tenant-private resources; if that changes, auth must land before release
- there is no multi-tenant isolation model in this repo because there are no tenant-owned resources; if organizations/workspaces are added later, every table and query will need explicit tenant scoping and tests
- there are no webhook endpoints today; if billing or provider webhooks are introduced, signature verification and idempotency must be implemented before shipping
- there is no file-upload or user-controlled URL-fetch feature; if either is added later, MIME validation, size limits, storage isolation, and SSRF protections will be mandatory
- `NEXT_PUBLIC_AI_API_URL` remains as a compatibility path and should eventually be removed to avoid future misuse
- dependency audit still reports upstream vulnerabilities in the current tree, especially around `next-pwa` and transitive tooling; those need a separate upgrade pass before a hardened production release

## Security Tests Added

- `/Users/lux/Documents/EPI-LOG-MAIN/tests/unit/server-env.security.test.ts`
- `/Users/lux/Documents/EPI-LOG-MAIN/tests/unit/client-boundary.security.test.ts`
- `/Users/lux/Documents/EPI-LOG-MAIN/tests/unit/debug-routes.security.test.ts`
- `/Users/lux/Documents/EPI-LOG-MAIN/tests/unit/request-validation.security.test.ts`

These tests currently cover:

- startup env validation
- SSRF-style upstream URL rejection for server and worker URLs
- secret-boundary checks against client code
- debug-route blocking in production
- strict payload validation and CORS denial for untrusted origins
