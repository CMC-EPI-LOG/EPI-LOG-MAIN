import { afterEach, describe, expect, it, vi } from 'vitest';

const { dbConnectMock, findOneAndUpdateMock } = vi.hoisted(() => ({
  dbConnectMock: vi.fn(),
  findOneAndUpdateMock: vi.fn(),
}));

vi.mock('@/lib/mongoose', () => ({
  dbConnect: dbConnectMock,
}));

vi.mock('@/models/UserLog', () => ({
  UserLog: {
    findOneAndUpdate: findOneAndUpdateMock,
  },
}));

import { POST } from '../../app/api/log/route';

describe('/api/log route', () => {
  const originalMongoUri = process.env.MONGODB_URI;

  afterEach(() => {
    dbConnectMock.mockReset();
    findOneAndUpdateMock.mockReset();
    vi.restoreAllMocks();
    process.env.MONGODB_URI = originalMongoUri;
  });

  it('session_id/event_name이 없으면 400을 반환한다', async () => {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';

    const request = new Request('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain('session_id and event_name');
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
    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('MONGODB_URI가 있으면 로그를 upsert한다', async () => {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';
    dbConnectMock.mockResolvedValue({});
    findOneAndUpdateMock.mockResolvedValue({});

    const request = new Request('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'session-2',
        source: 'ref-test',
        shared_by: 'share-1',
        event_name: 'landing_view',
        metadata: { foo: 'bar' },
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(dbConnectMock).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdateMock).toHaveBeenCalledTimes(1);
  });
});
