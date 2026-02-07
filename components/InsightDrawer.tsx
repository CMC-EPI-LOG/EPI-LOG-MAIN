'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { parseHighlightedText } from '@/lib/textUtils';
import { trackCoreEvent } from '@/lib/analytics/ga';

interface InsightDrawerProps {
  threeReason?: string[];
  detailAnswer?: string;
  reasoning?: string;
  reliabilityLabel?: string;
  reliabilityDescription?: string;
  reliabilityUpdatedAt?: string;
  measurementDataTime?: string;
  measurementRegion?: string;
  delay?: number;
}

export default function InsightDrawer({
  threeReason,
  detailAnswer,
  reasoning,
  reliabilityLabel,
  reliabilityDescription,
  reliabilityUpdatedAt,
  measurementDataTime,
  measurementRegion,
  delay = 0,
}: InsightDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDetailExpanded, setIsDetailExpanded] = useState(false);

  const hasSummary = Boolean(threeReason && threeReason.length > 0);
  const displayDetail = detailAnswer || reasoning || 'AI 선생님이 잠시 쉬고 있어요.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="col-span-2 bento-card overflow-hidden"
    >
      <button
        onClick={() => {
          if (!isOpen) {
            trackCoreEvent('insight_opened', { section: 'insight_drawer' });
          }
          setIsOpen(!isOpen);
        }}
        className="flex w-full items-center justify-between p-5 transition-colors hover:bg-gray-50 md:p-6"
        aria-expanded={isOpen}
        data-testid="insight-toggle"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🤔</span>
          <h3 className="text-lg font-black md:text-xl">왜 그런가요?</h3>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }}>
          <ChevronDown size={20} strokeWidth={2.5} />
        </motion.div>
      </button>

      <motion.div
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="space-y-4 border-t border-gray-100 px-5 pb-5 pt-4 md:px-6 md:pb-6">
          <div className="flex flex-wrap items-center gap-2">
            {reliabilityLabel && (
              <div
                className="inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600"
                title={reliabilityDescription}
                data-testid="insight-reliability-badge"
              >
                <span>{reliabilityLabel}</span>
                {reliabilityUpdatedAt && <span>· {reliabilityUpdatedAt} 기준</span>}
              </div>
            )}
            {(measurementDataTime || measurementRegion) && (
              <div
                className="inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600"
                data-testid="insight-measurement-badge"
              >
                {measurementDataTime && <span>측정 {measurementDataTime}</span>}
                {measurementRegion && <span>· {measurementRegion}</span>}
              </div>
            )}
          </div>

          {hasSummary && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="card-muted p-4"
            >
              <h4 className="mb-2 flex items-center gap-2 text-sm font-black text-gray-700">
                <span>💡</span>
                <span>AI 선생님의 3줄 요약</span>
              </h4>
              <ul className="space-y-2" data-testid="insight-summary-list">
                {threeReason?.map((reason, index) => (
                  <li key={index} className="flex gap-2 text-sm leading-6">
                    <span className="mt-0.5 font-black text-black">•</span>
                    <p className="flex-1 text-gray-800">{parseHighlightedText(reason)}</p>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {displayDetail && (
            <div className="flex justify-end">
              <button
                onClick={() => setIsDetailExpanded(!isDetailExpanded)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
                aria-expanded={isDetailExpanded}
                data-testid="insight-detail-toggle"
              >
                자세히 보기
                <span className="text-[10px]">{isDetailExpanded ? '▲' : '▽'}</span>
              </button>
            </div>
          )}

          <motion.div
            initial={false}
            animate={{
              height: isDetailExpanded ? 'auto' : 0,
              opacity: isDetailExpanded ? 1 : 0,
            }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-7 text-gray-700"
              data-testid="insight-detail-content"
            >
              {parseHighlightedText(displayDetail)}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
