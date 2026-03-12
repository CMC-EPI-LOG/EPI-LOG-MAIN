'use client';

import { motion } from 'framer-motion';
import { Flower2, Shield, SunMedium } from 'lucide-react';

interface LifestyleUvItem {
  forecastDate: string;
  peakValue: number | null;
  peakLabel: string | null;
  peakHourLabel: string | null;
}

interface LifestylePollenItem {
  forecastDate: string;
  overallLabel: string | null;
  pineLabel: string | null;
  oakLabel: string | null;
  weedLabel: string | null;
}

interface LifestyleIndicesData {
  requestedRegion: string | null;
  resolvedRegion: string | null;
  uvIssuedAt: string | null;
  pollenIssuedAt: string | null;
  uvItems: LifestyleUvItem[];
  pollenItems: LifestylePollenItem[];
  actionSummary: string | null;
}

interface LifestyleIndexCardProps {
  data?: LifestyleIndicesData | null;
  isLoading?: boolean;
  delay?: number;
}

function toneClasses(label: string | null | undefined) {
  const normalized = label?.replace(/\s+/g, '') || '';
  if (normalized.includes('위험') || normalized.includes('매우높음') || normalized.includes('매우나쁨')) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (normalized.includes('높음') || normalized.includes('나쁨')) {
    return 'border-orange-200 bg-orange-50 text-orange-700';
  }
  if (normalized.includes('보통')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (normalized.includes('낮음') || normalized.includes('좋음')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

function LabelChip({ label }: { label: string | null | undefined }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${toneClasses(label)}`}>
      {label || '확인 중'}
    </span>
  );
}

function PollenMiniChip({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
      <p className="text-[10px] font-black tracking-[0.08em] text-gray-400 uppercase">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-800">{value || '확인 중'}</p>
    </div>
  );
}

export default function LifestyleIndexCard({
  data,
  isLoading = false,
  delay = 0,
}: LifestyleIndexCardProps) {
  const uvToday = data?.uvItems?.[0] || null;
  const uvTomorrow = data?.uvItems?.[1] || null;
  const pollenToday = data?.pollenItems?.[0] || null;
  const pollenTomorrow = data?.pollenItems?.[1] || null;

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.4 }}
        className="col-span-2 bento-card overflow-hidden"
      >
        <div className="space-y-4 px-5 py-5 md:px-6 md:py-6">
          <div className="h-6 w-40 rounded-full skeleton-block" />
          <div className="h-12 rounded-2xl skeleton-block" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="h-40 rounded-[1.6rem] skeleton-block" />
            <div className="h-40 rounded-[1.6rem] skeleton-block" />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="col-span-2 bento-card overflow-hidden"
    >
      <div className="space-y-4 bg-[radial-gradient(circle_at_top_left,_rgba(253,224,71,0.28),_transparent_44%),linear-gradient(135deg,_#fffaf0_0%,_#ffffff_100%)] px-5 py-5 md:px-6 md:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-amber-600 uppercase">Daily Lifestyle</p>
            <h3 className="mt-1 text-xl font-black text-gray-900">자외선 · 꽃가루 생활지수</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
            <span className="rounded-full border border-gray-200 bg-white px-3 py-1">
              {data?.resolvedRegion || data?.requestedRegion || '권역 확인 중'}
            </span>
            {data?.uvIssuedAt && (
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1">
                UV {data.uvIssuedAt}
              </span>
            )}
            {data?.pollenIssuedAt && (
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1">
                꽃가루 {data.pollenIssuedAt}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-black/10 bg-white/80 px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-800" />
            <p className="text-sm font-bold text-gray-800">
              {data?.actionSummary || '자외선·꽃가루 데이터가 준비되면 생활 습관 가이드를 함께 보여드릴게요.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <article className="rounded-[1.6rem] border-2 border-black bg-[#FFF4D6] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-black tracking-[0.12em] text-amber-700 uppercase">
                  <SunMedium className="h-4 w-4" />
                  자외선
                </div>
                <p className="mt-2 text-2xl font-black text-gray-900">
                  {uvToday?.peakValue ?? '-'}
                  <span className="ml-1 text-sm font-semibold text-gray-500">지수</span>
                </p>
              </div>
              <LabelChip label={uvToday?.peakLabel} />
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <p>오늘 최고 시간: {uvToday?.peakHourLabel || '확인 중'}</p>
              <p>내일 전망: {uvTomorrow?.peakLabel || '준비 중'}</p>
            </div>
          </article>

          <article className="rounded-[1.6rem] border-2 border-black bg-[#F6F7E8] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-black tracking-[0.12em] text-emerald-700 uppercase">
                  <Flower2 className="h-4 w-4" />
                  꽃가루
                </div>
                <p className="mt-2 text-sm font-bold text-gray-700">
                  오늘 체감 위험도
                </p>
              </div>
              <LabelChip label={pollenToday?.overallLabel} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <PollenMiniChip label="소나무" value={pollenToday?.pineLabel} />
              <PollenMiniChip label="참나무" value={pollenToday?.oakLabel} />
              <PollenMiniChip label="잡초류" value={pollenToday?.weedLabel} />
            </div>
            <p className="mt-3 text-sm text-gray-700">내일 전망: {pollenTomorrow?.overallLabel || '준비 중'}</p>
          </article>
        </div>

        {!data && (
          <p className="text-[11px] font-medium text-gray-500">
            생활지수 공공데이터가 준비되는 동안 카드는 자동으로 채워집니다.
          </p>
        )}
      </div>
    </motion.section>
  );
}
