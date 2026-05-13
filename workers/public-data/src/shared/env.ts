import { isIP } from 'node:net';

const LOCALHOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const PRIVATE_IPV4_PATTERN =
  /^(10\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/;

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (LOCALHOST_PATTERN.test(normalized) || normalized.endsWith('.local')) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return PRIVATE_IPV4_PATTERN.test(normalized);
  if (ipVersion === 6) return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd');
  return false;
}

function validateAbsoluteUrl(rawValue: string, envName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`Invalid env: ${envName} must be an absolute URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Invalid env: ${envName} must use HTTPS`);
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error(`Invalid env: ${envName} cannot target private or localhost hosts`);
  }

  return parsed.toString();
}

export function requireUrlEnv(name: string): string {
  return validateAbsoluteUrl(requireEnv(name), name);
}

export function optionalUrlEnv(name: string, fallback: string): string {
  return validateAbsoluteUrl(optionalEnv(name, fallback), name);
}

export function normalizeServiceKey(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;

  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }

  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }

  return fallback;
}

export function parseIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
