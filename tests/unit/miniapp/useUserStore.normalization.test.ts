import { beforeEach, describe, expect, it } from 'vitest';
import { useUserStore, type UserProfile } from '../../../miniapps/ait-webview/src/store/useUserStore';

const INITIAL_LOCATION = {
  lat: 37.5172,
  lng: 127.0473,
  stationName: '강남구',
};

function resetStore() {
  useUserStore.setState({
    location: INITIAL_LOCATION,
    profile: null,
    isOnboarded: false,
  });
}

describe('miniapp useUserStore profile normalization', () => {
  beforeEach(() => {
    resetStore();
  });

  it('removes none when known condition is selected and dedupes known values', () => {
    const input: UserProfile = {
      ageGroup: 'elementary_low',
      condition: 'none',
      conditions: ['none', 'rhinitis', 'RHINITIS', 'asthma'],
      customConditions: [],
    };

    useUserStore.getState().setProfile(input);
    const profile = useUserStore.getState().profile;

    expect(profile).not.toBeNull();
    expect(profile?.condition).toBe('rhinitis');
    expect(profile?.conditions).toEqual(['rhinitis', 'asthma']);
  });

  it('keeps custom conditions while normalizing duplicates and limit', () => {
    const input: UserProfile = {
      ageGroup: 'elementary_low',
      condition: 'none',
      conditions: ['none'],
      customConditions: ['기관지 과민증', '기관지 과민증', '피부 건조', 'a', 'b', 'c', 'd'],
    };

    useUserStore.getState().setProfile(input);
    const profile = useUserStore.getState().profile;

    expect(profile).not.toBeNull();
    expect(profile?.condition).toBe('none');
    expect(profile?.conditions).toEqual([]);
    expect(profile?.customConditions).toEqual(['기관지 과민증', '피부 건조', 'a', 'b', 'c']);
  });

  it('falls back to none when no valid condition exists', () => {
    const input: UserProfile = {
      ageGroup: 'elementary_low',
      condition: 'unknown' as UserProfile['condition'],
      conditions: ['unknown'],
      customConditions: [],
    };

    useUserStore.getState().setProfile(input);
    const profile = useUserStore.getState().profile;

    expect(profile).not.toBeNull();
    expect(profile?.condition).toBe('none');
    expect(profile?.conditions).toEqual(['none']);
    expect(profile?.customConditions).toEqual([]);
  });
});
