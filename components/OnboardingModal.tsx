'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '@/store/useUserStore';
import { Plus, X } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (profile: UserProfile) => void;
  currentProfile: UserProfile | null;
}

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

export default function OnboardingModal({ isOpen, onClose, onSubmit, currentProfile }: OnboardingModalProps) {
  const [ageGroup, setAgeGroup] = useState(currentProfile?.ageGroup || 'elementary_low');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const knownConditions = conditions.filter((condition) => condition !== 'none');
    const normalizedConditions =
      knownConditions.length > 0
        ? knownConditions
        : customConditions.length > 0
          ? []
          : ['none'];
    const primaryCondition = normalizedConditions.find((condition) => condition !== 'none') || 'none';

    onSubmit({
      nickname: '',
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="relative flex w-full max-w-md flex-col overflow-hidden rounded-[24px] border-[3px] border-black bg-white shadow-bento max-h-[min(90vh,800px)]"
            data-testid="onboarding-modal"
          >
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-8 pb-4">
              {/* Close Button */}
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors border-[3px] border-black bg-white shadow-bento-sm z-10"
                aria-label="온보딩 닫기"
                data-testid="onboarding-close"
              >
                <X size={20} strokeWidth={3} />
              </button>

              {/* Header */}
              <div className="text-center">
                <h2 className="text-3xl font-black mb-2">
                  <span className="highlighter-yellow">아이 정보 입력</span>
                </h2>
                <p className="text-sm text-gray-600">
                  맞춤 공기질 정보를 위해 알려주세요
                </p>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-8">
              <form id="onboarding-form" onSubmit={handleSubmit} className="space-y-6 pb-4">
                {/* Age Group Section */}
                <div>
                  <label className="block font-black text-lg mb-4">
                    <span className="highlighter-mint">나이</span>
                  </label>
                  <div className="flex flex-col gap-3">
                    {[
                      { value: 'infant', label: '👶 영아 (0-2세)' },
                      { value: 'toddler', label: '🧒 유아 (3-6세)' },
                      { value: 'elementary_low', label: '🎒 초등 저학년 (7-9세)' },
                      { value: 'elementary_high', label: '🏫 초등 고학년 (10-12세)' },
                      { value: 'teen_adult', label: '🧑 청소년/성인 (13세~)' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAgeGroup(option.value)}
                        className={`p-4 rounded-[20px] border-[3px] font-bold transition-all text-left flex justify-between items-center ${
                          ageGroup === option.value
                            ? 'bg-black text-white border-black shadow-bento-sm'
                            : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-black hover:shadow-bento-sm'
                        }`}
                      >
                        <span>{option.label}</span>
                        {ageGroup === option.value && <span className="text-xl">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Health Condition Section */}
                <div>
                  <label className="block font-black text-lg mb-4">
                    <span className="highlighter-yellow">건강 상태 (중복 선택 가능)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {CONDITION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleCondition(option.value)}
                        className={`p-4 rounded-[20px] border-[3px] font-bold transition-all text-center ${
                          conditions.includes(option.value)
                            ? 'bg-black text-white border-black shadow-bento-sm'
                            : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-black hover:shadow-bento-sm'
                        }`}
                      >
                        <div className="text-2xl mb-1">{option.icon}</div>
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
                        className="h-11 w-11 shrink-0 rounded-xl border-2 border-black bg-white text-black transition hover:bg-black hover:text-white flex items-center justify-center"
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
              </form>
            </div>

            {/* Fixed Submit Button */}
            <div className="flex-shrink-0 p-8 pt-4">
              <button
                type="submit"
                form="onboarding-form"
                className="w-full py-5 bg-[#FEE500] text-black font-black text-xl rounded-[24px] border-[3px] border-black shadow-bento hover:bg-[#FDD835] transition-all active:translate-y-1 active:shadow-none flex items-center justify-center gap-2"
                data-testid="onboarding-submit"
              >
                결과 보러 가기
                <span className="text-2xl">🚀</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
