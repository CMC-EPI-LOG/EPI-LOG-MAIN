type FetchJsonConfig = {
  timeoutMs?: number;
  retryCount?: number;
};

type FetchJsonResult<T> = {
  data: T;
  response: Response;
};

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function createRequestController(externalSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timeout", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

export async function fetchResponseJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  config: FetchJsonConfig = {},
): Promise<FetchJsonResult<T>> {
  const timeoutMs = config.timeoutMs ?? 4000;
  const retryCount = config.retryCount ?? 0;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const externalSignal = init.signal ?? undefined;
    const request = createRequestController(externalSignal, timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: request.signal,
      });
      if (!response.ok) {
        const error = new Error(`HTTP_${response.status}`);
        (error as { retriable?: boolean }).retriable = isRetryableStatus(response.status);
        throw error;
      }
      return {
        data: (await response.json()) as T,
        response,
      };
    } catch (error) {
      lastError = error;
      if (externalSignal?.aborted) {
        throw error;
      }

      if (request.didTimeout()) {
        error = new DOMException("Request timeout", "TimeoutError");
        lastError = error;
      }

      const isAbortError = error instanceof DOMException && error.name === "AbortError";
      const isTimeoutError = error instanceof DOMException && error.name === "TimeoutError";
      const retriable =
        isTimeoutError ||
        (!externalSignal?.aborted && isAbortError) ||
        ((error as { retriable?: boolean } | null)?.retriable ?? false);
      const isLastAttempt = attempt >= retryCount;
      if (isLastAttempt || !retriable) {
        throw error;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
    } finally {
      request.cleanup();
    }
  }

  throw lastError || new Error("fetch_json_failed");
}

export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  config: FetchJsonConfig = {},
): Promise<T> {
  const { data } = await fetchResponseJsonWithTimeout<T>(input, init, config);
  return data;
}
