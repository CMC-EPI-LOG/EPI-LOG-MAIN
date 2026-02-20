'use client';

import { useMemo, useState } from 'react';
import type { UserProfile } from '@/store/useUserStore';
import { X } from 'lucide-react';
import { Modal } from '@toss/tds-mobile';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (profile: UserProfile) => void;
  currentProfile: UserProfile | null;
}

export default function OnboardingModal({ isOpen, onClose, onSubmit, currentProfile }: OnboardingModalProps) {
  const [ageGroup, setAgeGroup] = useState(currentProfile?.ageGroup || 'elementary_low');
  const [condition, setCondition] = useState(currentProfile?.condition || 'none');
  const portalContainer = useMemo(
    () => (typeof document !== 'undefined' ? document.body : null),
    [],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ nickname: '', ageGroup, condition });
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
                <span className="highlighter-yellow">건강 상태</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'none', label: '해당 없음', icon: '✨' },
                  { value: 'rhinitis', label: '알레르기 비염', icon: '🤧' },
                  { value: 'asthma', label: '천식', icon: '😮‍💨' },
                  { value: 'atopy', label: '아토피', icon: '🩹' }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCondition(option.value)}
                    className={`rounded-[20px] border-[3px] p-4 text-center font-bold transition-all ${
                      condition === option.value
                        ? 'border-black bg-black text-white shadow-bento-sm'
                        : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-black hover:shadow-bento-sm'
                    }`}
                  >
                    <div className="mb-1 text-2xl">{option.icon}</div>
                    <div className="text-sm">{option.label}</div>
                  </button>
                ))}
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
