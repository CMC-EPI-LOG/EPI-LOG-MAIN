import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LocationData {
  lat: number;
  lng: number;
  stationName: string;
}

export interface UserProfile {
  nickname: string;
  ageGroup: string; // 'child_low' (초등 저학년) | 'child_high' (초등 고학년) | 'infant' (영유아)
  condition: string; // 'normal' | 'sensitive' | 'asthma'
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
      storage: createJSONStorage(() => localStorage),
    }
  )
);
