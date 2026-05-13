const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|dsn|mongodb_uri|database_url)/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /KakaoAK\s+[A-Za-z0-9._~+/=-]+/gi,
  /([?&](?:token|key|secret|signature|auth)=)[^&\s]+/gi,
  /(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi,
];

function redactStringValue(value: string): string {
  let sanitized = value;

  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (_match, prefix = "") => `${prefix}${REDACTED_VALUE}`);
  }

  return sanitized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function redactSensitiveText(value: string): string {
  return redactStringValue(value);
}

export function sanitizeForLogging(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth >= 4) return "[Truncated]";

  if (typeof value === "string") {
    return redactStringValue(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key)
          ? REDACTED_VALUE
          : sanitizeForLogging(nestedValue, depth + 1),
      ]),
    );
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactStringValue(value.message),
    };
  }

  return String(value);
}

export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactStringValue(error.message);
  }

  return redactStringValue(String(error));
}

export function sanitizeSentryEvent<T>(event: T): T {
  return sanitizeForLogging(event) as T;
}
