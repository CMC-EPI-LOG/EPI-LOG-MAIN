import * as Sentry from "@sentry/browser";

type SentryRuntimeContext = {
  stationName?: string;
  reliabilityStatus?: string;
  cacheMode?: string;
  ageGroup?: string;
  condition?: string;
  knownConditions?: string[];
  customConditions?: string[];
};

const env = import.meta.env as Record<string, string | undefined>;
const SENTRY_DSN = env.VITE_SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN || "";
const SENTRY_ENVIRONMENT =
  env.VITE_SENTRY_ENVIRONMENT || env.MODE || env.NODE_ENV || "production";
const SENTRY_RELEASE =
  env.VITE_SENTRY_RELEASE || env.SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA;
const APP_VERSION = env.VITE_APP_VERSION || env.APP_VERSION || SENTRY_RELEASE || "dev";
const MINIAPP_PLATFORM = "toss-miniapp";

let isInitialized = false;

function toNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function initializeSentry(): void {
  if (isInitialized) return;
  isInitialized = true;

  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE,
    enabled: env.MODE !== "test",
    sendDefaultPii: false,
    // Browser SDK only; native crash collection is intentionally disabled.
    tracesSampleRate: toNumber(env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0),
  });
  Sentry.setTag("platform", MINIAPP_PLATFORM);
  Sentry.setTag("app_version", APP_VERSION);
}

export function setSentryRuntimeContext({
  stationName,
  reliabilityStatus,
  cacheMode,
  ageGroup,
  condition,
  knownConditions,
  customConditions,
}: SentryRuntimeContext): void {
  if (!SENTRY_DSN) return;

  Sentry.setTag("platform", MINIAPP_PLATFORM);
  Sentry.setTag("app_version", APP_VERSION);
  Sentry.setTag("station", stationName || "unknown");
  Sentry.setTag("station.requested", stationName || "unknown");
  Sentry.setTag("reliability", reliabilityStatus || "unknown");
  Sentry.setTag("reliability.status", reliabilityStatus || "unknown");
  Sentry.setTag("cache.mode", cacheMode || "network:unknown");
  Sentry.setTag("age_group", ageGroup || "unknown");
  Sentry.setTag("condition", condition || "unknown");
  Sentry.setContext("profile", {
    ageGroup: ageGroup || "unknown",
    condition: condition || "none",
    conditions: knownConditions || [],
    customConditions: customConditions || [],
  });
}
