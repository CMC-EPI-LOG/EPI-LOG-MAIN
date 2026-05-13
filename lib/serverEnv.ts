const DEFAULT_AI_API_URL = "https://epi-log-ai.vercel.app";
const TOSS_HOSTNAME_PATTERN = /^([a-z0-9-]+)\.(?:private-)?apps\.tossmini\.com$/i;
const LOCALHOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const PRIVATE_IPV4_PATTERN =
  /^(10\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/;
const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;

function getHostnameIpVersion(hostname: string): 0 | 4 | 6 {
  if (IPV4_PATTERN.test(hostname)) {
    const octets = hostname.split(".").map((part) => Number(part));
    return octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? 4 : 0;
  }

  return hostname.includes(":") ? 6 : 0;
}

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function isLocalDevelopmentContext(): boolean {
  return process.env.VERCEL !== '1' && process.env.CI !== 'true' && process.env.VERCEL_ENV !== 'production';
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (LOCALHOST_PATTERN.test(normalized) || normalized.endsWith(".local")) {
    return true;
  }

  const ipVersion = getHostnameIpVersion(normalized);
  if (ipVersion === 4) {
    return PRIVATE_IPV4_PATTERN.test(normalized);
  }
  if (ipVersion === 6) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
  }

  return false;
}

function assertSafeAbsoluteUrl(rawValue: string, envName: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`Invalid env: ${envName} must be an absolute URL`);
  }

  const isLocalAllowed = isLocalDevelopmentContext();

  if (parsed.protocol !== "https:" && !(isLocalAllowed && parsed.protocol === "http:")) {
    throw new Error(`Invalid env: ${envName} must use HTTPS`);
  }

  if (!isLocalAllowed && isPrivateHostname(parsed.hostname)) {
    throw new Error(`Invalid env: ${envName} cannot target private or localhost hosts`);
  }

  return parsed;
}

export function getAiApiUrl(): string {
  const explicit = readTrimmedEnv("AI_API_URL");
  if (explicit) {
    return assertSafeAbsoluteUrl(explicit, "AI_API_URL").toString().replace(/\/$/, "");
  }

  const legacyPublic = readTrimmedEnv("NEXT_PUBLIC_AI_API_URL");
  if (legacyPublic) {
    return assertSafeAbsoluteUrl(legacyPublic, "NEXT_PUBLIC_AI_API_URL").toString().replace(/\/$/, "");
  }

  return DEFAULT_AI_API_URL;
}

function getSiteOrigins(): string[] {
  const candidates = [
    readTrimmedEnv("NEXT_PUBLIC_SITE_URL"),
    readTrimmedEnv("SITE_URL"),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ].filter((value): value is string => Boolean(value));

  const origins = new Set<string>();
  for (const candidate of candidates) {
    try {
      origins.add(assertSafeAbsoluteUrl(candidate, "SITE_URL").origin);
    } catch {
      // Ignore malformed optional site origins here; startup validation covers production.
    }
  }
  return Array.from(origins);
}

function getConfiguredCorsOrigins(): string[] {
  const configured = readTrimmedEnv("CORS_ALLOWED_ORIGINS");
  if (!configured) return [];

  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => assertSafeAbsoluteUrl(origin, "CORS_ALLOWED_ORIGINS").origin);
}

export function isAllowedCorsOrigin(origin: string): boolean {
  const normalized = origin.trim();
  if (!normalized) return false;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  if (getSiteOrigins().includes(parsed.origin)) {
    return true;
  }

  if (getConfiguredCorsOrigins().includes(parsed.origin)) {
    return true;
  }

  if (TOSS_HOSTNAME_PATTERN.test(parsed.hostname)) {
    return parsed.protocol === "https:";
  }

  if (process.env.NODE_ENV !== "production") {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(parsed.origin);
  }

  return false;
}

export function validateCriticalServerEnv(): void {
  const isProduction =
    process.env.VERCEL_ENV === "production"
    || (process.env.NODE_ENV === "production" && !isLocalDevelopmentContext());
  if (!isProduction) return;

  const missing: string[] = [];
  if (!readTrimmedEnv("KAKAO_REST_API_KEY")) {
    missing.push("KAKAO_REST_API_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing critical env(s): ${missing.join(", ")}`);
  }

  getAiApiUrl();

  const siteUrl = readTrimmedEnv("NEXT_PUBLIC_SITE_URL");
  if (siteUrl) {
    assertSafeAbsoluteUrl(siteUrl, "NEXT_PUBLIC_SITE_URL");
  }
}
