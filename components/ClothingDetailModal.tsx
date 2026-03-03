'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Droplets, Loader2, RefreshCw, Shirt, Sparkles, Thermometer, X } from 'lucide-react';

interface ClothingDetailModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  summary?: string;
  recommendation?: string;
  tips?: string[];
  temperature?: number;
  humidity?: number;
  onRefresh?: () => void;
  onClose: () => void;
}

function formatMetric(value: number | undefined, unit: string): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return `- ${unit}`;
  const normalized = Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
  return `${normalized}${unit}`;
}

export default function ClothingDetailModal({
  isOpen,
  isLoading = false,
  summary,
  recommendation,
  tips,
  temperature,
  humidity,
  onRefresh,
  onClose,
}: ClothingDetailModalProps) {
  const displaySummary = summary || '현재 온습도를 바탕으로 옷차림을 정리하고 있어요.';
  const displayRecommendation = recommendation || '얇은 겉옷을 한 겹 챙겨 주세요.';
  const displayTips =
    Array.isArray(tips) && tips.length > 0
      ? tips.slice(0, 3)
      : ['실내외 온도차를 고려해 탈착 가능한 레이어드를 권장해요.'];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="relative max-h-[82vh] w-full max-w-md overflow-hidden rounded-[24px] border-[3px] border-black bg-white shadow-bento"
            role="dialog"
            aria-modal="true"
            aria-label="오늘의 옷차림"
            data-testid="clothing-detail-modal"
          >
            <div className="flex items-center justify-between border-b-2 border-black bg-[#FEE500] px-5 py-4">
              <div>
                <p className="text-xs font-black tracking-wide text-gray-700">캐릭터 카드 확장</p>
                <h3 className="text-xl font-black">오늘의 옷차림</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border-2 border-black bg-white p-1.5"
                aria-label="옷차림 모달 닫기"
                data-testid="clothing-modal-close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(82vh-72px)] overflow-y-auto p-5">
              <div className="mb-4 flex items-center justify-between rounded-xl border-2 border-black bg-sky-50 px-3 py-2">
                <div className="inline-flex items-center gap-1 text-xs font-black text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  온습도 맞춤
                </div>
                {onRefresh && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isLoading}
                    className={`inline-flex items-center gap-1 rounded-full border border-black bg-white px-2.5 py-1 text-xs font-black ${
                      isLoading ? 'cursor-not-allowed opacity-70' : ''
                    }`}
                    data-testid="clothing-modal-refresh"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    새로고침
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border-2 border-black bg-white px-3 py-2.5">
                  <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
                    <Thermometer className="h-3.5 w-3.5" />
                    현재 온도
                  </div>
                  <p className="text-xl font-black">{formatMetric(temperature, '°C')}</p>
                </div>
                <div className="rounded-xl border-2 border-black bg-white px-3 py-2.5">
                  <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
                    <Droplets className="h-3.5 w-3.5" />
                    현재 습도
                  </div>
                  <p className="text-xl font-black">{formatMetric(humidity, '%')}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    <div className="h-6 w-4/5 rounded-md skeleton-block" />
                    <div className="h-12 w-full rounded-xl skeleton-block" />
                    <div className="h-4 w-full rounded-md skeleton-block" />
                    <div className="h-4 w-[90%] rounded-md skeleton-block" />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-gray-700">{displaySummary}</p>
                    <p className="rounded-xl border-2 border-black bg-sky-50 px-3 py-2 text-sm font-black text-gray-900">
                      <Shirt className="mr-1 inline-block h-4 w-4" />
                      {displayRecommendation}
                    </p>
                    <ul className="space-y-1.5">
                      {displayTips.map((tip, index) => (
                        <li
                          key={`${tip}-${index}`}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700"
                        >
                          • {tip}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
