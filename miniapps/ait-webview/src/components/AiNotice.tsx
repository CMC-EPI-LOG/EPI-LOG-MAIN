'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info, ShieldCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'epilog:ai_notice_ack_v1';

function isTossPlatform() {
  // Vite build defines this to a string literal; Next.js reads it normally.
  return process.env.NEXT_PUBLIC_PLATFORM === 'TOSS';
}

export default function AiNotice() {
  const enabled = useMemo(() => isTossPlatform(), []);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      setIsOpen(true);
    } catch {
      setIsOpen(true);
    }
  }, [enabled]);

  if (!enabled) return null;

  const acknowledgeAndClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setIsOpen(false);
  };

  return (
    <>
      <div className="max-w-2xl mx-auto mb-3">
        <div className="relative overflow-hidden rounded-[22px] border-2 border-black bg-white shadow-bento-sm">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-[#3182F6]" />
          <div className="flex items-center gap-3 px-3 py-2.5 pl-4">
            <div className="inline-flex items-center gap-1.5 rounded-xl border-2 border-black bg-black px-2 py-1 text-[11px] font-black text-white">
              <ShieldCheck size={12} />
              AI 생성
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black leading-4 text-gray-800">
                생성형 AI 결과 안내
              </p>
              <p className="text-[12px] font-semibold leading-4 text-gray-600">
                추천/설명은 AI 생성 결과를 포함해요.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex min-h-10 items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
            aria-haspopup="dialog"
            aria-label="AI 생성 안내 보기"
            data-testid="ai-notice-open"
          >
            <Info size={14} />
            안내
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-modal="true"
            aria-label="AI 생성 결과 안내"
            data-testid="ai-notice-modal"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              className="w-full max-w-md overflow-hidden rounded-[24px] border-[3px] border-black bg-white shadow-bento"
            >
              <div className="flex items-center justify-between border-b-2 border-black bg-[#FEE500] px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black px-2 py-0.5 text-xs font-black text-white">
                    <ShieldCheck size={12} />
                    AI 생성
                  </span>
                  <h2 className="text-base font-black">AI 결과 안내</h2>
                </div>
                <button
                  type="button"
                  onClick={acknowledgeAndClose}
                  className="rounded-full border-2 border-black bg-white p-2 shadow-bento-sm hover:bg-gray-50"
                  aria-label="닫기"
                  data-testid="ai-notice-close"
                >
                  <X size={18} strokeWidth={3} />
                </button>
              </div>

              <div className="space-y-3 px-5 py-4 text-sm leading-6 text-gray-800">
                <p className="font-bold">
                  아래 내용은 생성형 AI가 자동으로 생성한 결과를 포함하며, 정확하지 않을 수 있어요.
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-black" />
                    <span>대기질/기상/프로필 입력에 따라 결과가 달라질 수 있어요.</span>
                  </li>
                  <li className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-black" />
                    <span>의료적 조언이 아니며, 증상이 있으면 전문가 상담이 필요해요.</span>
                  </li>
                  <li className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-black" />
                    <span>안전을 위해 보수적으로 판단하고, 현장 상황을 함께 고려해주세요.</span>
                  </li>
                </ul>
              </div>

              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={acknowledgeAndClose}
                  className="w-full rounded-[20px] border-2 border-black bg-black px-4 py-3 text-sm font-black text-white shadow-bento-sm hover:bg-gray-800"
                >
                  확인했어요
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
