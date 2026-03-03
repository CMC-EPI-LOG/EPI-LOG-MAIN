'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { type UserProfile } from '@/store/useUserStore';

type SettingsTab = 'age' | 'condition';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (profile: UserProfile) => void;
  currentProfile: UserProfile | null;
  initialTab?: SettingsTab;
}

const DEFAULT_AGE_GROUP = 'elementary_low';

const AGE_OPTIONS = [
  { value: 'infant', label: '👶 영아 (0-2세)' },
  { value: 'toddler', label: '🧒 유아 (3-6세)' },
  { value: 'elementary_low', label: '🎒 초등 저학년 (7-9세)' },
  { value: 'elementary_high', label: '🏫 초등 고학년 (10-12세)' },
  { value: 'teen_adult', label: '🧑 청소년/성인 (13세~)' },
] as const;

const CONDITION_OPTIONS = [
  { value: 'none', label: '해당 없음', icon: '✨' },
  { value: 'rhinitis', label: '알레르기 비염', icon: '🤧' },
  { value: 'asthma', label: '천식', icon: '😮‍💨' },
  { value: 'atopy', label: '아토피', icon: '🩹' },
] as const;

function dedupeValues(values: string[]): string[] {
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

function getInitialAgeGroup(profile: UserProfile | null): string {
  return profile?.ageGroup || DEFAULT_AGE_GROUP;
}

function getInitialConditions(profile: UserProfile | null): string[] {
  if (!profile) return ['none'];

  const fromProfile = [
    ...(Array.isArray(profile.conditions) ? profile.conditions : []),
    ...(typeof profile.condition === 'string' ? [profile.condition] : []),
  ];

  const knownValues = new Set(CONDITION_OPTIONS.map((option) => option.value));
  const normalized = dedupeValues(fromProfile.map((value) => value.toLowerCase())).filter((value) =>
    knownValues.has(value as (typeof CONDITION_OPTIONS)[number]['value']),
  );
  const withoutNone = normalized.filter((value) => value !== 'none');

  if (withoutNone.length > 0) return withoutNone;
  if (normalized.includes('none')) return ['none'];
  if (Array.isArray(profile.customConditions) && profile.customConditions.length > 0) return [];
  return ['none'];
}

function getInitialCustomConditions(profile: UserProfile | null): string[] {
  if (!profile || !Array.isArray(profile.customConditions)) return [];
  return dedupeValues(profile.customConditions).slice(0, 5);
}

export default function ProfileSettingsModal({
  isOpen,
  onClose,
  onSubmit,
  currentProfile,
  initialTab = 'age',
}: ProfileSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [ageGroup, setAgeGroup] = useState(getInitialAgeGroup(currentProfile));
  const [conditions, setConditions] = useState<string[]>(getInitialConditions(currentProfile));
  const [customConditions, setCustomConditions] = useState<string[]>(getInitialCustomConditions(currentProfile));
  const [customConditionInput, setCustomConditionInput] = useState('');

  const toggleCondition = (value: string) => {
    if (value === 'none') {
      setConditions(['none']);
      setCustomConditions([]);
      return;
    }

    setConditions((prev) => {
      const withoutNone = prev.filter((condition) => condition !== 'none');
      if (withoutNone.includes(value)) {
        const next = withoutNone.filter((condition) => condition !== value);
        if (next.length === 0 && customConditions.length === 0) return ['none'];
        return next;
      }
      return [...withoutNone, value];
    });
  };

  const addCustomCondition = () => {
    const next = customConditionInput.trim();
    if (!next) return;

    const isDuplicate = customConditions.some(
      (condition) => condition.toLowerCase() === next.toLowerCase(),
    );
    if (isDuplicate) {
      setCustomConditionInput('');
      return;
    }

    setCustomConditions((prev) => [...prev, next].slice(0, 5));
    setConditions((prev) => prev.filter((condition) => condition !== 'none'));
    setCustomConditionInput('');
  };

  const toggleCustomCondition = (value: string) => {
    const nextCustomConditions = customConditions.filter((condition) => condition !== value);
    setCustomConditions(nextCustomConditions);

    if (nextCustomConditions.length === 0) {
      setConditions((prev) => {
        const hasKnownCondition = prev.some((condition) => condition !== 'none');
        return hasKnownCondition ? prev : ['none'];
      });
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const knownConditions = conditions.filter((condition) => condition !== 'none');
    const normalizedConditions =
      knownConditions.length > 0
        ? knownConditions
        : customConditions.length > 0
          ? []
          : ['none'];
    const primaryCondition = normalizedConditions.find((condition) => condition !== 'none') || 'none';

    onSubmit({
      nickname: currentProfile?.nickname || '',
      ageGroup,
      condition: primaryCondition,
      conditions: normalizedConditions,
      customConditions,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="relative flex max-h-[78vh] w-full max-w-sm flex-col overflow-hidden rounded-[24px] border-[3px] border-black bg-white shadow-bento md:max-h-[700px] md:max-w-md"
            data-testid="settings-modal"
          >
            <div className="flex-shrink-0 p-6 pb-3 md:p-7 md:pb-4">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-5 top-5 z-10 rounded-full border-[3px] border-black bg-white p-2 shadow-bento-sm transition-colors hover:bg-gray-100 md:right-6 md:top-6"
                aria-label="설정 모달 닫기"
                data-testid="settings-close"
              >
                <X size={20} strokeWidth={3} />
              </button>

              <div className="text-center">
                <h2 className="mb-3 text-3xl font-black">
                  <span className="highlighter-yellow">아이 설정</span>
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('age')}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-black transition ${
                    activeTab === 'age'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-black'
                  }`}
                  data-testid="settings-tab-age"
                >
                  연령
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('condition')}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-black transition ${
                    activeTab === 'condition'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-black'
                  }`}
                  data-testid="settings-tab-condition"
                >
                  질환
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-1 md:px-7">
              <form id="settings-form" onSubmit={handleSubmit} className="space-y-6 pb-4">
                {activeTab === 'age' ? (
                  <div>
                    <label className="mb-4 block text-lg font-black">
                      <span className="highlighter-mint">나이</span>
                    </label>
                    <div className="flex flex-col gap-3">
                      {AGE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setAgeGroup(option.value)}
                          className={`flex items-center justify-between rounded-[20px] border-[3px] p-4 text-left font-bold transition-all ${
                            ageGroup === option.value
                              ? 'border-black bg-black text-white shadow-bento-sm'
                              : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-black hover:shadow-bento-sm'
                          }`}
                        >
                          <span>{option.label}</span>
                          {ageGroup === option.value && <span className="text-xl">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="mb-4 block text-lg font-black">
                      <span className="highlighter-yellow">건강 상태 (중복 선택 가능)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {CONDITION_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleCondition(option.value)}
                          className={`rounded-[20px] border-[3px] p-4 text-center font-bold transition-all ${
                            conditions.includes(option.value)
                              ? 'border-black bg-black text-white shadow-bento-sm'
                              : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-black hover:shadow-bento-sm'
                          }`}
                        >
                          <div className="mb-1 text-2xl">{option.icon}</div>
                          <div className="text-sm">{option.label}</div>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-gray-600">
                      여러 항목을 함께 선택할 수 있어요.
                    </p>

                    <div className="mt-4 rounded-[20px] border-[3px] border-gray-200 bg-gray-50 p-3">
                      <p className="mb-2 text-sm font-black text-gray-700">직접 입력</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customConditionInput}
                          onChange={(event) => setCustomConditionInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            addCustomCondition();
                          }}
                          placeholder="예: 기관지 과민증"
                          maxLength={20}
                          className="h-11 flex-1 rounded-xl border-2 border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-black"
                        />
                        <button
                          type="button"
                          onClick={addCustomCondition}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-white text-black transition hover:bg-black hover:text-white"
                          aria-label="질환 직접 입력 추가"
                        >
                          <Plus size={18} strokeWidth={3} />
                        </button>
                      </div>

                      {customConditions.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {customConditions.map((condition) => (
                            <button
                              key={condition}
                              type="button"
                              onClick={() => toggleCustomCondition(condition)}
                              className="rounded-[20px] border-[3px] border-black bg-black p-4 text-center font-bold text-white shadow-bento-sm transition-all hover:-translate-y-0.5"
                            >
                              <div className="mb-1 text-2xl">✍️</div>
                              <div className="line-clamp-2 break-words text-sm">{condition}</div>
                              <div className="mt-1 text-[11px] font-semibold text-white/80">
                                탭해서 해제
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className="flex-shrink-0 p-6 pt-3 md:p-7 md:pt-4">
              <button
                type="submit"
                form="settings-form"
                className="flex w-full items-center justify-center rounded-[24px] border-[3px] border-black bg-[#FEE500] py-5 text-xl font-black text-black shadow-bento transition-all hover:bg-[#FDD835] active:translate-y-1 active:shadow-none"
                data-testid="settings-submit"
              >
                {activeTab === 'age' ? '연령 저장' : '질환 저장'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
