const SNAPSHOT_STORAGE_KEY = 'aisoom:last-report-snapshot';
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ReportSnapshot<T> {
  savedAt: string;
  stationName: string;
  data: T;
}

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveReportSnapshot<T>(stationName: string, data: T): void {
  const storage = getStorage();
  if (!storage) return;

  const payload: ReportSnapshot<T> = {
    savedAt: new Date().toISOString(),
    stationName,
    data,
  };
  storage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(payload));
}

export function loadReportSnapshot<T>(): ReportSnapshot<T> | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ReportSnapshot<T>;
    if (!parsed?.savedAt || !parsed?.data) return null;

    const ageMs = Date.now() - Date.parse(parsed.savedAt);
    if (!Number.isFinite(ageMs) || ageMs > SNAPSHOT_MAX_AGE_MS) {
      storage.removeItem(SNAPSHOT_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearReportSnapshot(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(SNAPSHOT_STORAGE_KEY);
}
