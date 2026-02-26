import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const STORAGE_KEY = 'aisoom-storage';
const LEGACY_STORAGE_KEY = 'epilog-storage';
const STORAGE_TEST_KEY = '__aisoom_storage_test__';

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
  condition: string; // 'none' | 'rhinitis' | 'asthma' | 'atopy'
}

interface UserState {
  location: LocationData;
  profile: UserProfile | null;
  isOnboarded: boolean;
  setLocation: (loc: LocationData) => void;
  setProfile: (profile: UserProfile) => void;
  resetProfile: () => void;
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
      setProfile: (profile) => set({ profile, isOnboarded: true }),
      resetProfile: () => set({ profile: null, isOnboarded: false }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(getSafeStorage),
    }
  )
);
