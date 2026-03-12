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

function setupWindow() {
  const localStorage = new MemoryStorage();
  (globalThis as { window?: { localStorage: Storage } }).window = { localStorage };
  return localStorage;
}

describe('miniapp report snapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it('stores and restores the last snapshot payload', async () => {
    setupWindow();
    const { loadReportSnapshot, saveReportSnapshot } = await import(
      '../../../miniapps/ait-webview/src/lib/reportSnapshot'
    );

    saveReportSnapshot('강남구', {
      profileSignature: 'elementary_low::none::none::',
      report: { timestamp: '2026-03-12T00:00:00.000Z' },
      clothingData: null,
      forecastData: null,
      displayRegion: '서울 강남구',
    });

    expect(loadReportSnapshot()).toMatchObject({
      stationName: '강남구',
      data: {
        profileSignature: 'elementary_low::none::none::',
        displayRegion: '서울 강남구',
      },
    });
  });

  it('expires snapshots older than 24 hours', async () => {
    const storage = setupWindow();
    const { loadReportSnapshot, saveReportSnapshot } = await import(
      '../../../miniapps/ait-webview/src/lib/reportSnapshot'
    );

    saveReportSnapshot('강남구', { report: { timestamp: '2026-03-12T00:00:00.000Z' } });
    vi.setSystemTime(new Date('2026-03-13T00:00:01.000Z'));

    expect(loadReportSnapshot()).toBeNull();
    expect(storage.length).toBe(0);
  });
});
