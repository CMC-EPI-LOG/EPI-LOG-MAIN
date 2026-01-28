import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const memoryStorage = (() => {
  let store: Record<string, string> = {};
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

const getSafeStorage = () => {
  if (typeof window === 'undefined') return memoryStorage;
  try {
    const testKey = '__epilog_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
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
  ageGroup: string; // 'child_low' | 'child_high' | 'infant' | 'adult'
  condition: string; // 'none' | 'rhinitis' | 'asthma'
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
      name: 'epilog-storage',
      storage: createJSONStorage(getSafeStorage),
    }
  )
);
