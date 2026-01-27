'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '@/store/useUserStore';
import { X } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (profile: UserProfile) => void;
}

export default function OnboardingModal({ isOpen, onClose, onSubmit }: OnboardingModalProps) {
  const [nickname, setNickname] = useState('');
  const [ageGroup, setAgeGroup] = useState('child_low');
  const [condition, setCondition] = useState('normal');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    onSubmit({ nickname, ageGroup, condition });
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
              <div>
                <label className="block font-bold mb-1">닉네임</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="예: 튼튼이"
                  className="w-full p-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                  required
                />
              </div>

              <div>
                <label className="block font-bold mb-3">나이</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'infant', label: '영유아 (0-5세)' },
                    { value: 'child_low', label: '초등 저학년 (6-9세)' },
                    { value: 'child_high', label: '초등 고학년 (10-13세)' },
                    { value: 'teen', label: '청소년 (14세 이상)' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAgeGroup(option.value)}
                      className={`p-3 rounded-xl border-2 font-bold transition-all ${
                        ageGroup === option.value
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-black'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold mb-3">건강 상태</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'normal', label: '건강함 💪' },
                    { value: 'sensitive', label: '예민 🤧' },
                    { value: 'asthma', label: '천식 🏥' }
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
