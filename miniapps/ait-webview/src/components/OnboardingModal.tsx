'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserProfile } from '@/store/useUserStore';
import { X } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (profile: UserProfile) => void;
  currentProfile: UserProfile | null;
}

export default function OnboardingModal({ isOpen, onClose, onSubmit, currentProfile }: OnboardingModalProps) {
  const [ageGroup, setAgeGroup] = useState(currentProfile?.ageGroup || 'elementary_low');
  const [condition, setCondition] = useState(currentProfile?.condition || 'none');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ nickname: '', ageGroup, condition });
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
                        className={`p-4 rounded-[20px] border-[3px] font-bold transition-all text-center ${
                          condition === option.value
                            ? 'bg-black text-white border-black shadow-bento-sm'
                            : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-black hover:shadow-bento-sm'
                        }`}
                      >
                        <div className="text-2xl mb-1">{option.icon}</div>
                        <div className="text-sm">{option.label}</div>
                      </button>
                    ))}
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
