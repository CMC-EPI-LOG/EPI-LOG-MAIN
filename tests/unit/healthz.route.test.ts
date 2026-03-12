import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbConnectMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/mongoose', () => ({
  dbConnect: dbConnectMock,
}));

describe('/api/healthz route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    dbConnectMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MONGODB_URI;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.APP_VERSION;
    delete process.env.VERCEL_ENV;
  });

  it('reports reachable dependencies and observability headers', async () => {
    process.env.MONGODB_URI = 'mongodb://example';
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    process.env.APP_VERSION = 'sha-123';
    process.env.VERCEL_ENV = 'preview';
    dbConnectMock.mockResolvedValue(undefined);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    const { GET } = await import('../../app/api/healthz/route');

    const response = await GET(new Request('http://localhost/api/healthz'));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      ok: true,
      version: 'sha-123',
      env: 'preview',
      aiApiReachable: true,
      mongoConfigured: true,
      sentryEnabled: true,
    });
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('reports unhealthy optional dependencies without failing the route', async () => {
    dbConnectMock.mockRejectedValue(new Error('mongo down'));
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ai down');
    }));

    const { GET } = await import('../../app/api/healthz/route');

    const response = await GET(new Request('http://localhost/api/healthz'));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      aiApiReachable: false,
      mongoConfigured: false,
      sentryEnabled: false,
    });
  });
});
