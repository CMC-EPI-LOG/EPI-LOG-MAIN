'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '@/store/useUserStore';
import { X } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (profile: UserProfile) => void;
  currentProfile: UserProfile | null;
}

export default function OnboardingModal({ isOpen, onClose, onSubmit, currentProfile }: OnboardingModalProps) {
  // const [nickname, setNickname] = useState(''); // Removed
  const [ageGroup, setAgeGroup] = useState(currentProfile?.ageGroup || 'elementary_low');
  const [condition, setCondition] = useState(currentProfile?.condition || 'none');

  // Sync state with profile when modal opens
  useEffect(() => {
    if (isOpen && currentProfile) {
      setAgeGroup(currentProfile.ageGroup);
      setCondition(currentProfile.condition);
    }
  }, [isOpen, currentProfile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // if (!nickname.trim()) return;
    onSubmit({ nickname: '', ageGroup, condition }); // Pass empty string or undefined
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="w-full max-w-sm bg-pastel-yellow p-6 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_black] relative"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-1 hover:bg-black/10 rounded-full transition-colors"
            >
              <X size={24} />
            </button>

            <h2 className="text-2xl font-black mb-6 text-center">📝 아이 정보 입력</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nickname Input Removed */}

              <div>
                <label className="block font-bold mb-3 underline decoration-pastel-blue decoration-4 underline-offset-4">나이</label>
                <div className="flex flex-col gap-2">
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
                      className={`p-3 rounded-xl border-2 font-bold transition-all text-left flex justify-between items-center ${
                        ageGroup === option.value
                          ? 'bg-black text-white border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-black'
                      }`}
                    >
                      {option.label}
                      {ageGroup === option.value && <span>✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold mb-3 underline decoration-pastel-pink decoration-4 underline-offset-4">건강 상태</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'none', label: '해당 없음' },
                    { value: 'rhinitis', label: '알레르기 비염' },
                    { value: 'asthma', label: '천식/쌕쌕거림' },
                    { value: 'atopy', label: '아토피' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCondition(option.value)}
                      className={`p-3 rounded-xl border-2 font-bold transition-all ${
                        condition === option.value
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-black'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-6 py-4 bg-pastel-blue text-black font-black text-lg rounded-xl border-2 border-black shadow-[4px_4px_0px_0px_black] active:translate-y-1 active:shadow-none transition-all hover:bg-cyan-100"
              >
                결과 보러 가기 🚀
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
