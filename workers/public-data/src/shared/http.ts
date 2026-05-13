type QueryValue = string | number | boolean | undefined | null;

export type FetchJsonOptions = {
  query?: Record<string, QueryValue>;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  retryStatusCodes?: number[];
  init?: RequestInit;
};

type HttpError = Error & {
  status?: number;
  retryAfterMs?: number;
  url?: string;
  bodySnippet?: string;
};

function buildUrl(baseUrl: string, query?: Record<string, QueryValue>) {
  const url = new URL(baseUrl);
  if (!query) return url;

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  return url;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(rawValue: string | null) {
  if (!rawValue) return undefined;

  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const retryAtMs = Date.parse(trimmed);
  if (Number.isNaN(retryAtMs)) return undefined;

  return Math.max(0, retryAtMs - Date.now());
}

export async function fetchJson<T>(baseUrl: string, options: FetchJsonOptions = {}): Promise<T> {
  const {
    query,
    timeoutMs = 10_000,
    retryCount = 1,
    retryDelayMs = 300,
    maxRetryDelayMs = 10_000,
    retryStatusCodes = [],
    init,
  } = options;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = buildUrl(baseUrl, query);
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodySnippet = (await response.text()).slice(0, 300);
        const error: HttpError = new Error(`HTTP_${response.status}`);
        error.status = response.status;
        error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        error.url = url.toString();
        error.bodySnippet = bodySnippet;
        throw error;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as HttpError).status)
          : NaN;
      const shouldRetry =
        attempt < retryCount
        && (
          !Number.isFinite(status)
          || status >= 500
          || status === 408
          || retryStatusCodes.includes(status)
        );

      if (!shouldRetry) break;
      const retryAfterMs =
        typeof error === 'object' && error !== null && 'retryAfterMs' in error
          ? Number((error as HttpError).retryAfterMs)
          : NaN;
      const exponentialDelayMs = retryDelayMs * 2 ** attempt;
      const nextDelayMs = Number.isFinite(retryAfterMs) && retryAfterMs >= 0
        ? retryAfterMs
        : exponentialDelayMs;
      await wait(Math.min(nextDelayMs, maxRetryDelayMs));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch JSON');
}
