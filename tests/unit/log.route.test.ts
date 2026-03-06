import { afterEach, describe, expect, it, vi } from 'vitest';

const { dbConnectMock, eventBulkWriteMock, sessionSummaryBulkWriteMock } = vi.hoisted(() => ({
  dbConnectMock: vi.fn(),
  eventBulkWriteMock: vi.fn(),
  sessionSummaryBulkWriteMock: vi.fn(),
}));

vi.mock('@/lib/mongoose', () => ({
  dbConnect: dbConnectMock,
}));

vi.mock('@/models/EventLog', () => ({
  EventLog: {
    bulkWrite: eventBulkWriteMock,
  },
}));

vi.mock('@/models/SessionSummary', () => ({
  SessionSummary: {
    bulkWrite: sessionSummaryBulkWriteMock,
  },
}));

import { POST } from '../../app/api/log/route';

describe('/api/log route', () => {
  const originalMongoUri = process.env.MONGODB_URI;

  afterEach(() => {
    dbConnectMock.mockReset();
    eventBulkWriteMock.mockReset();
    sessionSummaryBulkWriteMock.mockReset();
    vi.restoreAllMocks();
    process.env.MONGODB_URI = originalMongoUri;
  });

  it('payload가 유효하지 않으면 400을 반환한다', async () => {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';

    const request = new Request('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      ok: boolean;
      error?: { code?: string };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe('INVALID_PAYLOAD');
  });

  it('MONGODB_URI가 없으면 저장을 건너뛰고 202를 반환한다', async () => {
    delete process.env.MONGODB_URI;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const request = new Request('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'session-1',
        event_name: 'landing_view',
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean; skipped?: boolean };

    expect(response.status).toBe(202);
    expect(payload.ok).toBe(true);
    expect(payload.skipped).toBe(true);
    expect(dbConnectMock).not.toHaveBeenCalled();
    expect(eventBulkWriteMock).not.toHaveBeenCalled();
    expect(sessionSummaryBulkWriteMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('MONGODB_URI가 있으면 로그를 event/session 컬렉션으로 저장한다', async () => {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';
    dbConnectMock.mockResolvedValue({});
    eventBulkWriteMock.mockResolvedValue({
      upsertedIds: { 0: 'mock-id-0' },
    });
    sessionSummaryBulkWriteMock.mockResolvedValue({});

    const request = new Request('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: '2.0.0',
        events: [
          {
            event_id: 'evt-12345678',
            schema_version: '2.0.0',
            session_id: 'session-2',
            event_name: 'landing_view',
            client_ts: new Date().toISOString(),
            entry_source: 'direct',
            deployment_id: null,
            toss_app_version: null,
            route: '/',
            source: 'ref-test',
            shared_by: 'share-1',
            metadata: { foo: 'bar' },
          },
        ],
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      ok: boolean;
      stored_count?: number;
      deduped_count?: number;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.stored_count).toBe(1);
    expect(payload.deduped_count).toBe(0);
    expect(dbConnectMock).toHaveBeenCalledTimes(1);
    expect(eventBulkWriteMock).toHaveBeenCalledTimes(1);
    expect(sessionSummaryBulkWriteMock).toHaveBeenCalledTimes(1);
  });
});
