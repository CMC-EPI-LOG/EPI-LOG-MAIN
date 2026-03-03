import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key) ?? null : null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

function setupWindow(url: string) {
  const gtag = vi.fn();
  const windowMock = {
    location: new URL(url),
    gtag,
    dataLayer: [],
    sessionStorage: new MemoryStorage(),
    localStorage: new MemoryStorage(),
  };

  (globalThis as { window?: typeof windowMock }).window = windowMock;
  return windowMock;
}

describe('miniapp analytics ga', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubEnv('VITE_GA_ID', 'G-TEST');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { window?: unknown }).window;
  });

  it('persists utm attribution and landing path', async () => {
    const windowMock = setupWindow(
      'https://epilog.apps.tossmini.com/?utm_source=toss&utm_medium=miniapp&utm_campaign=launch',
    );

    const { persistUtmAttribution } = await import(
      '../../../miniapps/ait-webview/src/lib/analytics/ga'
    );
    persistUtmAttribution();

    const raw = windowMock.localStorage.getItem('aisoom:utm_attribution');
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw as string) as Record<string, string>;
    expect(parsed.utm_source).toBe('toss');
    expect(parsed.utm_medium).toBe('miniapp');
    expect(parsed.utm_campaign).toBe('launch');
    expect(parsed.utm_landing_path).toBe('/');
  });

  it('fills default core context when trackCoreEvent is called before home context is ready', async () => {
    const windowMock = setupWindow('https://epilog.apps.tossmini.com/?utm_source=toss');

    const { persistUtmAttribution, trackCoreEvent } = await import(
      '../../../miniapps/ait-webview/src/lib/analytics/ga'
    );

    persistUtmAttribution();
    trackCoreEvent('share_clicked', { share_channel: 'toss_share' });

    expect(windowMock.gtag).toHaveBeenCalledWith(
      'event',
      'share_clicked',
      expect.objectContaining({
        station_name: 'unknown',
        age_group: 'unknown',
        condition: 'unknown',
        reliability_status: 'unknown',
        utm_source: 'toss',
        share_channel: 'toss_share',
        event_name: 'share_clicked',
      }),
    );
  });

  it('keeps shared context and allows event-level override', async () => {
    const windowMock = setupWindow('https://epilog.apps.tossmini.com/');

    const { setCoreEventContext, trackCoreEvent } = await import(
      '../../../miniapps/ait-webview/src/lib/analytics/ga'
    );

    setCoreEventContext({
      station_name: '강남구',
      age_group: 'elementary_high',
    });

    trackCoreEvent('location_changed', { station_name: '서초구' });

    expect(windowMock.gtag).toHaveBeenCalledWith(
      'event',
      'location_changed',
      expect.objectContaining({
        station_name: '서초구',
        age_group: 'elementary_high',
        condition: 'unknown',
        reliability_status: 'unknown',
        event_name: 'location_changed',
      }),
    );
  });
});
