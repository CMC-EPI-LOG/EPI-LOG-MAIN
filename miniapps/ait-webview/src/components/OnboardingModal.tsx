'use client';

import { useMemo, useState } from 'react';
import type { UserProfile } from '@/store/useUserStore';
import { X } from 'lucide-react';
import { Modal } from '@toss/tds-mobile';
import {
  CONDITION_OPTIONS,
  addCustomCondition,
  buildSubmittedProfile,
  getInitialConditions,
  getInitialCustomConditions,
  removeCustomCondition,
  toggleKnownCondition,
} from '@/lib/onboardingProfile';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (profile: UserProfile) => void;
  currentProfile: UserProfile | null;
}

export default function OnboardingModal({ isOpen, onClose, onSubmit, currentProfile }: OnboardingModalProps) {
  const [ageGroup, setAgeGroup] = useState(currentProfile?.ageGroup || 'elementary_low');
  const [conditions, setConditions] = useState<string[]>(getInitialConditions(currentProfile));
  const [customConditions, setCustomConditions] = useState<string[]>(getInitialCustomConditions(currentProfile));
  const [customConditionInput, setCustomConditionInput] = useState('');
  const portalContainer = useMemo(
    () => (typeof document !== 'undefined' ? document.body : null),
    [],
  );

  const toggleCondition = (value: string) => {
    const nextState = toggleKnownCondition(conditions, value, customConditions.length);
    setConditions(nextState.conditions);
    if (nextState.clearCustomConditions) {
      setCustomConditions([]);
    }
  };

  const handleAddCustomCondition = () => {
    const nextState = addCustomCondition(customConditions, customConditionInput);
    if (nextState.clearInput) {
      setCustomConditionInput('');
    }
    if (!nextState.didAdd) return;
    setCustomConditions(nextState.customConditions);
    setConditions((prev) => prev.filter((condition) => condition !== 'none'));
  };

  const toggleCustomCondition = (value: string) => {
    const nextState = removeCustomCondition(customConditions, value, conditions);
    setCustomConditions(nextState.customConditions);
    setConditions(nextState.conditions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSubmit(buildSubmittedProfile(ageGroup, conditions, customConditions));
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      portalContainer={portalContainer}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Modal.Overlay
        onClick={onClose}
        className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      />
      <Modal.Content
        className="relative z-[10001] flex max-h-[min(90vh,800px)] w-[calc(100vw_-_2rem)] max-w-md flex-col overflow-hidden rounded-[24px] border-[3px] border-black bg-white shadow-bento"
        style={{ backgroundColor: '#fff', isolation: 'isolate', opacity: 1 }}
        data-testid="onboarding-modal"
      >
        {/* Fixed Header */}
        <div className="flex-shrink-0 bg-white p-8 pb-4">
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 z-10 rounded-full border-[3px] border-black bg-white p-2 shadow-bento-sm transition-colors hover:bg-gray-100"
            aria-label="온보딩 닫기"
            data-testid="onboarding-close"
          >
            <X size={20} strokeWidth={3} />
          </button>

          {/* Header */}
          <div className="text-center">
            <h2 className="mb-2 text-3xl font-black">
              <span className="highlighter-yellow">아이 정보 입력</span>
            </h2>
            <p className="text-sm text-gray-600">
              맞춤 공기질 정보를 위해 알려주세요
            </p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto bg-white px-8">
          <form id="onboarding-form" onSubmit={handleSubmit} className="space-y-6 pb-4">
            {/* Age Group Section */}
            <div>
              <label className="mb-4 block text-lg font-black">
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

            {/* Health Condition Section */}
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
                      handleAddCustomCondition();
                    }}
                    placeholder="예: 기관지 과민증"
                    maxLength={20}
                    className="h-11 flex-1 rounded-xl border-2 border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-black"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCondition}
                    className="h-11 rounded-xl border-2 border-black bg-white px-3 text-sm font-black text-black transition hover:bg-black hover:text-white"
                  >
                    추가
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
        <div className="flex-shrink-0 bg-white p-8 pt-4">
          <button
            type="submit"
            form="onboarding-form"
            className="flex w-full items-center justify-center gap-2 rounded-[24px] border-[3px] border-black bg-[#FEE500] py-5 text-xl font-black text-black shadow-bento transition-all hover:bg-[#FDD835] active:translate-y-1 active:shadow-none"
            data-testid="onboarding-submit"
          >
            결과 보러 가기
            <span className="text-2xl">🚀</span>
          </button>
        </div>
      </Modal.Content>
    </Modal>
  );
}
