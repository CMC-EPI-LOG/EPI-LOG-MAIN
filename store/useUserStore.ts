import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const STORAGE_KEY = 'aisoom-storage';
const LEGACY_STORAGE_KEY = 'epilog-storage';
const STORAGE_TEST_KEY = '__aisoom_storage_test__';
const PROFILE_SCHEMA_VERSION = 2;
const KNOWN_CONDITIONS = ['none', 'rhinitis', 'asthma', 'atopy'] as const;
const KNOWN_CONDITION_SET = new Set<string>(KNOWN_CONDITIONS);

type KnownCondition = (typeof KNOWN_CONDITIONS)[number];

const memoryStorage = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (name: string) => (name in store ? store[name] : null),
    setItem: (name: string, value: string) => {
      store[name] = value;
    },
    removeItem: (name: string) => {
      delete store[name];
    },
  };
})();

const migrateLegacyPersistState = (storage: Storage) => {
  try {
    if (storage.getItem(STORAGE_KEY) !== null) return;
    const legacyState = storage.getItem(LEGACY_STORAGE_KEY);
    if (legacyState === null) return;
    storage.setItem(STORAGE_KEY, legacyState);
    storage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore migration failures and continue with default initialization.
  }
};

const getSafeStorage = () => {
  if (typeof window === 'undefined') return memoryStorage;
  try {
    window.localStorage.setItem(STORAGE_TEST_KEY, '1');
    window.localStorage.removeItem(STORAGE_TEST_KEY);
    migrateLegacyPersistState(window.localStorage);
    return window.localStorage;
  } catch {
    return memoryStorage;
  }
};

export interface LocationData {
  lat: number;
  lng: number;
  stationName: string;
}

export interface UserProfile {
  nickname?: string;
  ageGroup: string; // 'infant' | 'toddler' | 'elementary_low' | 'elementary_high' | 'teen_adult'
  condition: string; // primary condition (legacy compatible)
  conditions?: string[]; // multi-select known conditions
  customConditions?: string[]; // user-defined conditions
}

interface UserState {
  location: LocationData;
  profile: UserProfile | null;
  isOnboarded: boolean;
  setLocation: (loc: LocationData) => void;
  setProfile: (profile: UserProfile) => void;
  resetProfile: () => void;
}

interface PersistedUserState {
  location?: LocationData;
  profile?: UserProfile | null;
  isOnboarded?: boolean;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

function normalizeKnownConditions(values: string[]): KnownCondition[] {
  const normalized = dedupeStrings(values.map((value) => value.toLowerCase())).filter((value) =>
    KNOWN_CONDITION_SET.has(value),
  ) as KnownCondition[];

  const withoutNone = normalized.filter((value) => value !== 'none');
  return withoutNone.length > 0 ? withoutNone : normalized;
}

function normalizeCustomConditions(values: string[] | undefined): string[] {
  if (!values) return [];
  return dedupeStrings(values).slice(0, 5);
}

function getPrimaryCondition(conditions: KnownCondition[]): KnownCondition {
  return conditions.find((condition) => condition !== 'none') || 'none';
}

function normalizeProfile(profile: UserProfile): UserProfile {
  const knownSource: string[] = [];
  if (Array.isArray(profile.conditions)) {
    knownSource.push(...profile.conditions);
  }
  if (typeof profile.condition === 'string') {
    knownSource.push(profile.condition);
  }

  let normalizedKnown = normalizeKnownConditions(knownSource);
  const normalizedCustom = normalizeCustomConditions(profile.customConditions);

  if (normalizedCustom.length > 0) {
    normalizedKnown = normalizedKnown.filter((condition) => condition !== 'none');
  }

  if (normalizedKnown.length === 0 && normalizedCustom.length === 0) {
    normalizedKnown = ['none'];
  }

  const primaryCondition = getPrimaryCondition(normalizedKnown);

  return {
    ...profile,
    condition: primaryCondition,
    conditions: normalizedKnown,
    customConditions: normalizedCustom,
  };
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      location: {
        lat: 37.5172, // Default: Gangnam-gu Office approx
        lng: 127.0473,
        stationName: '강남구',
      },
      profile: null,
      isOnboarded: false,
      setLocation: (loc) => set({ location: loc }),
      setProfile: (profile) => set({ profile: normalizeProfile(profile), isOnboarded: true }),
      resetProfile: () => set({ profile: null, isOnboarded: false }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(getSafeStorage),
      version: PROFILE_SCHEMA_VERSION,
      migrate: (persistedState: unknown) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as PersistedUserState;
        }

        const casted = persistedState as PersistedUserState;
        if (!casted.profile) return casted;

        return {
          ...casted,
          profile: normalizeProfile(casted.profile),
        };
      },
    }
  )
);
