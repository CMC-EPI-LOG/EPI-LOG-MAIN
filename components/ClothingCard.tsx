'use client';

import { motion } from 'framer-motion';
import { Thermometer, Droplets, Shirt, Sparkles } from 'lucide-react';

interface ClothingCardProps {
  summary?: string;
  recommendation?: string;
  tips?: string[];
  temperature?: number;
  humidity?: number;
  delay?: number;
  isLoading?: boolean;
}

function formatMetric(value: number | undefined, unit: string): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return `- ${unit}`;
  const normalized = Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
  return `${normalized}${unit}`;
}

export default function ClothingCard({
  summary,
  recommendation,
  tips,
  temperature,
  humidity,
  delay = 0,
  isLoading = false,
}: ClothingCardProps) {
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.4 }}
        className="col-span-2 bento-card p-4 md:p-6"
        data-testid="clothing-card-loading"
      >
        <div className="mb-4 flex items-center gap-2.5">
          <span className="rounded-md bg-sky-100 px-1.5 py-1 text-base">👕</span>
          <h3 className="text-lg font-black md:text-xl">오늘의 옷차림</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="h-14 rounded-xl border-2 border-black skeleton-block" />
          <div className="h-14 rounded-xl border-2 border-black skeleton-block" />
        </div>

        <div className="mt-4 space-y-3">
          <div className="h-6 w-4/5 rounded-md skeleton-block" />
          <div className="h-5 w-full rounded-md skeleton-block" />
          {[0, 1].map((idx) => (
            <div key={idx} className="h-4 w-full rounded-md skeleton-block" />
          ))}
        </div>
      </motion.div>
    );
  }

  const displaySummary = summary || '현재 온습도를 기반으로 옷차림을 준비했어요.';
  const displayRecommendation = recommendation || '얇은 겉옷을 함께 챙겨 체온 변화를 조절해 주세요.';
  const displayTips = Array.isArray(tips) && tips.length > 0
    ? tips.slice(0, 3)
    : ['실내외 온도차를 고려해 레이어드 착용을 권장해요.'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="col-span-2 bento-card p-4 md:p-6"
      data-testid="clothing-card"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-sky-100 px-1.5 py-1 text-base">👕</span>
          <h3 className="text-lg font-black md:text-xl">오늘의 옷차림</h3>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
          <Sparkles className="h-3.5 w-3.5" />
          <span>온습도 맞춤</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-black bg-white px-3 py-2.5 shadow-bento-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <Thermometer className="h-3.5 w-3.5" />
            <span>현재 온도</span>
          </div>
          <p className="text-xl font-black text-gray-900">{formatMetric(temperature, '°C')}</p>
        </div>
        <div className="rounded-xl border-2 border-black bg-white px-3 py-2.5 shadow-bento-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <Droplets className="h-3.5 w-3.5" />
            <span>현재 습도</span>
          </div>
          <p className="text-xl font-black text-gray-900">{formatMetric(humidity, '%')}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-semibold text-gray-700">{displaySummary}</p>
        <p className="rounded-xl border-2 border-black bg-sky-50 px-3 py-2 text-sm font-black text-gray-900">
          <Shirt className="mr-1 inline-block h-4 w-4" />
          {displayRecommendation}
        </p>
      </div>

      <ul className="mt-3 space-y-1.5">
        {displayTips.map((tip, index) => (
          <li key={`${tip}-${index}`} className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
            • {tip}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
