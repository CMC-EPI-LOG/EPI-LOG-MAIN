import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from '../../workers/public-data/src/shared/http';

describe('fetchJson retry behavior', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('retries HTTP 429 when explicitly configured and honors Retry-After', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response('API rate limit exceeded', {
          status: 429,
          headers: {
            'Retry-After': '2',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    global.fetch = fetchMock as typeof fetch;

    const request = fetchJson<{ ok: boolean }>('https://example.com/data', {
      retryCount: 1,
      retryDelayMs: 300,
      retryStatusCodes: [429],
    });

    await vi.runAllTimersAsync();

    await expect(request).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timeoutSpy.mock.calls.some(([, delay]) => Number(delay) === 2000)).toBe(true);
  });

  it('does not retry HTTP 429 unless the status is explicitly allowed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('API rate limit exceeded', {
        status: 429,
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const request = fetchJson('https://example.com/data', {
      retryCount: 2,
      retryDelayMs: 300,
    });
    const rejection = expect(request).rejects.toMatchObject({
      message: 'HTTP_429',
      status: 429,
    });

    await vi.runAllTimersAsync();

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
