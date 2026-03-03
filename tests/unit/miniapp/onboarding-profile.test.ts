import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../../miniapps/ait-webview/src/store/useUserStore';
import {
  addCustomCondition,
  buildSubmittedProfile,
  getInitialConditions,
  getInitialCustomConditions,
  removeCustomCondition,
  toggleKnownCondition,
} from '../../../miniapps/ait-webview/src/lib/onboardingProfile';

describe('miniapp onboarding profile helpers', () => {
  it('known condition toggles support multi-select and none fallback', () => {
    const step1 = toggleKnownCondition(['none'], 'rhinitis', 0);
    expect(step1.conditions).toEqual(['rhinitis']);
    expect(step1.clearCustomConditions).toBe(false);

    const step2 = toggleKnownCondition(step1.conditions, 'asthma', 0);
    expect(step2.conditions).toEqual(['rhinitis', 'asthma']);

    const step3 = toggleKnownCondition(step2.conditions, 'asthma', 0);
    expect(step3.conditions).toEqual(['rhinitis']);

    const step4 = toggleKnownCondition(['rhinitis'], 'rhinitis', 0);
    expect(step4.conditions).toEqual(['none']);
  });

  it('selecting none resets known/custom selections', () => {
    const next = toggleKnownCondition(['rhinitis', 'asthma'], 'none', 2);
    expect(next.conditions).toEqual(['none']);
    expect(next.clearCustomConditions).toBe(true);
  });

  it('custom condition add enforces dedupe and max 5', () => {
    const duplicate = addCustomCondition(['기관지 과민증'], '기관지 과민증');
    expect(duplicate.didAdd).toBe(false);
    expect(duplicate.clearInput).toBe(true);
    expect(duplicate.customConditions).toEqual(['기관지 과민증']);

    const maxed = addCustomCondition(
      ['a', 'b', 'c', 'd', 'e'],
      'f',
    );
    expect(maxed.didAdd).toBe(true);
    expect(maxed.customConditions).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('removing last custom condition restores none when no known condition remains', () => {
    const next = removeCustomCondition(['기관지 과민증'], '기관지 과민증', []);
    expect(next.customConditions).toEqual([]);
    expect(next.conditions).toEqual(['none']);
  });

  it('submit payload keeps conditions/customConditions serialization stable', () => {
    const knownProfile = buildSubmittedProfile('elementary_low', ['rhinitis', 'asthma'], ['기관지 과민증']);
    expect(knownProfile).toMatchObject({
      ageGroup: 'elementary_low',
      condition: 'rhinitis',
      conditions: ['rhinitis', 'asthma'],
      customConditions: ['기관지 과민증'],
    });

    const customOnlyProfile = buildSubmittedProfile('elementary_low', ['none'], ['기관지 과민증']);
    expect(customOnlyProfile).toMatchObject({
      condition: 'none',
      conditions: [],
      customConditions: ['기관지 과민증'],
    });
  });

  it('initial values prefer known conditions and recover custom-only profile', () => {
    const knownProfile: UserProfile = {
      ageGroup: 'elementary_low',
      condition: 'asthma',
      conditions: ['none', 'rhinitis', 'asthma'],
      customConditions: ['기관지 과민증'],
    };

    expect(getInitialConditions(knownProfile)).toEqual(['rhinitis', 'asthma']);

    const customOnlyProfile: UserProfile = {
      ageGroup: 'elementary_low',
      condition: 'none',
      conditions: ['none'],
      customConditions: ['기관지 과민증', '기관지 과민증'],
    };
    expect(getInitialConditions(customOnlyProfile)).toEqual(['none']);
    expect(getInitialCustomConditions(customOnlyProfile)).toEqual(['기관지 과민증']);
  });
});
