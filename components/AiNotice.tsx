"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "epilog:ai_notice_ack_v1";

function isTossPlatform() {
  return process.env.NEXT_PUBLIC_PLATFORM === "TOSS";
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
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setIsOpen(false);
  };

  return (
    <>
      <div className="max-w-2xl mx-auto mb-3">
        <div className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1.5 shadow-bento-sm">
          <span className="rounded-full bg-black px-2 py-0.5 text-[11px] font-black text-white">
            AI 생성
          </span>
          <span className="text-xs font-bold text-gray-700">
            이 화면의 추천/설명은 생성형 AI가 만든 결과를 포함해요.
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
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
                  <span className="rounded-full bg-black px-2 py-0.5 text-xs font-black text-white">
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
                  아래 내용은 생성형 AI가 자동으로 생성한 결과를 포함하며, 정확하지
                  않을 수 있어요.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>대기질/기상/프로필 입력에 따라 결과가 달라질 수 있어요.</li>
                  <li>의료적 조언이 아니며, 증상이 있으면 전문가 상담이 필요해요.</li>
                  <li>안전을 위해 보수적으로 판단하고, 현장 상황을 함께 고려해주세요.</li>
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

