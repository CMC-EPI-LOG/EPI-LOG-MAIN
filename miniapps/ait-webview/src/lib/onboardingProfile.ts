import type { UserProfile } from '@/store/useUserStore';

export const CONDITION_OPTIONS = [
  { value: 'none', label: '해당 없음', icon: '✨' },
  { value: 'rhinitis', label: '알레르기 비염', icon: '🤧' },
  { value: 'asthma', label: '천식', icon: '😮‍💨' },
  { value: 'atopy', label: '아토피', icon: '🩹' },
] as const;

type ConditionValue = (typeof CONDITION_OPTIONS)[number]['value'];

const KNOWN_CONDITION_SET = new Set<ConditionValue>(
  CONDITION_OPTIONS.map((option) => option.value),
);

export function dedupeValues(values: string[]): string[] {
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

export function getInitialConditions(profile: UserProfile | null): string[] {
  if (!profile) return ['none'];

  const fromProfile = [
    ...(Array.isArray(profile.conditions) ? profile.conditions : []),
    ...(typeof profile.condition === 'string' ? [profile.condition] : []),
  ];

  const normalized = dedupeValues(fromProfile.map((value) => value.toLowerCase())).filter((value) =>
    KNOWN_CONDITION_SET.has(value as ConditionValue),
  );
  const withoutNone = normalized.filter((value) => value !== 'none');

  if (withoutNone.length > 0) return withoutNone;
  if (normalized.includes('none')) return ['none'];
  if (Array.isArray(profile.customConditions) && profile.customConditions.length > 0) return [];
  return ['none'];
}

export function getInitialCustomConditions(profile: UserProfile | null): string[] {
  if (!profile || !Array.isArray(profile.customConditions)) return [];
  return dedupeValues(profile.customConditions).slice(0, 5);
}

export function toggleKnownCondition(
  currentConditions: string[],
  value: string,
  customConditionCount: number,
): { conditions: string[]; clearCustomConditions: boolean } {
  if (value === 'none') {
    return { conditions: ['none'], clearCustomConditions: true };
  }

  const withoutNone = currentConditions.filter((condition) => condition !== 'none');
  if (withoutNone.includes(value)) {
    const next = withoutNone.filter((condition) => condition !== value);
    if (next.length === 0 && customConditionCount === 0) {
      return { conditions: ['none'], clearCustomConditions: false };
    }
    return { conditions: next, clearCustomConditions: false };
  }

  return {
    conditions: [...withoutNone, value],
    clearCustomConditions: false,
  };
}

export function addCustomCondition(
  currentCustomConditions: string[],
  rawInput: string,
): { customConditions: string[]; didAdd: boolean; clearInput: boolean } {
  const next = rawInput.trim();
  if (!next) {
    return {
      customConditions: currentCustomConditions,
      didAdd: false,
      clearInput: false,
    };
  }

  const isDuplicate = currentCustomConditions.some(
    (condition) => condition.toLowerCase() === next.toLowerCase(),
  );
  if (isDuplicate) {
    return {
      customConditions: currentCustomConditions,
      didAdd: false,
      clearInput: true,
    };
  }

  return {
    customConditions: [...currentCustomConditions, next].slice(0, 5),
    didAdd: true,
    clearInput: true,
  };
}

export function removeCustomCondition(
  currentCustomConditions: string[],
  targetValue: string,
  currentConditions: string[],
): { customConditions: string[]; conditions: string[] } {
  const nextCustomConditions = currentCustomConditions.filter((condition) => condition !== targetValue);

  if (nextCustomConditions.length > 0) {
    return {
      customConditions: nextCustomConditions,
      conditions: currentConditions,
    };
  }

  const hasKnownCondition = currentConditions.some((condition) => condition !== 'none');
  return {
    customConditions: nextCustomConditions,
    conditions: hasKnownCondition ? currentConditions : ['none'],
  };
}

export function buildSubmittedProfile(
  ageGroup: string,
  conditions: string[],
  customConditions: string[],
): UserProfile {
  const knownConditions = conditions.filter((condition) => condition !== 'none');
  const normalizedConditions =
    knownConditions.length > 0
      ? knownConditions
      : customConditions.length > 0
        ? []
        : ['none'];
  const primaryCondition = normalizedConditions.find((condition) => condition !== 'none') || 'none';

  return {
    nickname: '',
    ageGroup,
    condition: primaryCondition,
    conditions: normalizedConditions,
    customConditions,
  };
}
