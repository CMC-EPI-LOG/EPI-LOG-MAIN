import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('server env security', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows only trusted CORS origins', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.ai-soom.site';
    const { isAllowedCorsOrigin } = await import('../../lib/serverEnv');

    expect(isAllowedCorsOrigin('https://www.ai-soom.site')).toBe(true);
    expect(isAllowedCorsOrigin('https://epilog.apps.tossmini.com')).toBe(true);
    expect(isAllowedCorsOrigin('https://attacker.example.com')).toBe(false);
  });

  it('rejects private or non-https AI upstream URLs', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.AI_API_URL = 'https://127.0.0.1/internal';
    const { getAiApiUrl } = await import('../../lib/serverEnv');

    expect(() => getAiApiUrl()).toThrow(/must use HTTPS|private or localhost/);
  });

  it('fails fast in production when critical server env is missing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    delete process.env.KAKAO_REST_API_KEY;

    const { validateCriticalServerEnv } = await import('../../lib/serverEnv');
    expect(() => validateCriticalServerEnv()).toThrow(/KAKAO_REST_API_KEY/);
  });

  it('blocks private worker upstream URLs', async () => {
    process.env.AIRKOREA_BASE_URL = 'https://127.0.0.1/internal';
    const { requireUrlEnv } = await import('../../workers/public-data/src/shared/env');

    expect(() => requireUrlEnv('AIRKOREA_BASE_URL')).toThrow(/private or localhost/);
  });
});
