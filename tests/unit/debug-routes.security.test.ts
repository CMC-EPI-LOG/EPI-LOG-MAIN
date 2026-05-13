import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

describe('debug route security', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not expose admin, internal, ops, webhook, or upload routes in the app router', () => {
    const appRoot = path.resolve(process.cwd(), 'app');
    const discovered: string[] = [];

    function walk(currentPath: string) {
      for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!fullPath.endsWith('route.ts') && !fullPath.endsWith('page.tsx')) continue;
        discovered.push(fullPath);
      }
    }

    walk(appRoot);

    const restricted = discovered.filter((file) =>
      /(\/admin\/|\/internal\/|\/ops\/|webhook|upload)/i.test(file),
    );

    expect(restricted).toEqual([]);
  });

  it('blocks the debug sentry page in production by default', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DEBUG_PAGES;

    const sentryPage = await import('../../app/test-sentry/page');
    expect(() => sentryPage.default()).toThrow('NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('allows the debug sentry page only when explicitly enabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEBUG_PAGES = '1';

    const sentryPage = await import('../../app/test-sentry/page');
    expect(typeof sentryPage.default).toBe('function');
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
