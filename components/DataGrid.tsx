'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown, Thermometer, Droplets, Wind, CloudFog, Sun, Factory } from 'lucide-react';
import { trackCoreEvent } from '@/lib/analytics/ga';

interface DataGridProps {
  data: {
    pm25: number;
    pm10: number;
    o3: number;
    temperature: number;
    humidity: number;
    no2: number;
  };
  reliabilityLabel?: string;
  reliabilityDescription?: string;
  reliabilityUpdatedAt?: string;
  measurementDataTime?: string;
  measurementRegion?: string;
  delay?: number;
}

function getPM25Status(value: number): { grade: 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD'; label: string } {
  if (value <= 15) return { grade: 'GOOD', label: '좋음' };
  if (value <= 35) return { grade: 'NORMAL', label: '보통' };
  if (value <= 75) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function getPM10Status(value: number): { grade: 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD'; label: string } {
  if (value <= 30) return { grade: 'GOOD', label: '좋음' };
  if (value <= 80) return { grade: 'NORMAL', label: '보통' };
  if (value <= 150) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function getO3Status(value: number): { grade: 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD'; label: string } {
  if (value <= 0.03) return { grade: 'GOOD', label: '좋음' };
  if (value <= 0.09) return { grade: 'NORMAL', label: '보통' };
  if (value <= 0.15) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function getNO2Status(value: number): { grade: 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD'; label: string } {
  if (value <= 0.03) return { grade: 'GOOD', label: '좋음' };
  if (value <= 0.06) return { grade: 'NORMAL', label: '보통' };
  if (value <= 0.2) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

const statusStyles = {
  GOOD: { color: '#22C55E', riskyBorder: 'border-green-500', textClass: 'text-green-700' },
  NORMAL: { color: '#EAB308', riskyBorder: 'border-yellow-500', textClass: 'text-yellow-700' },
  BAD: { color: '#F97316', riskyBorder: 'border-orange-500', textClass: 'text-orange-700' },
  VERY_BAD: { color: '#EF4444', riskyBorder: 'border-red-500', textClass: 'text-red-700' },
};

function WeatherWidget({ temp, humidity }: { temp: number; humidity: number }) {
  return (
    <div className="flex h-16 items-center rounded-xl border-2 border-black bg-gray-50 px-4">
      <div className="flex w-1/2 items-center gap-2">
        <Thermometer className="h-4 w-4 text-black" strokeWidth={2} />
        <span className="text-meta">온도</span>
        <div className="flex items-baseline gap-0.5">
          <span className="text-xl font-black leading-none text-gray-900">{temp}</span>
          <span className="text-[11px] text-gray-500">°C</span>
        </div>
      </div>
      <div className="mx-3 h-7 w-px bg-gray-300" />
      <div className="flex w-1/2 items-center gap-2">
        <Droplets className="h-4 w-4 text-black" strokeWidth={2} />
        <span className="text-meta">습도</span>
        <div className="flex items-baseline gap-0.5">
          <span className="text-xl font-black leading-none text-gray-900">{humidity}</span>
          <span className="text-[11px] text-gray-500">%</span>
        </div>
      </div>
    </div>
  );
}

interface PollutionCardProps {
  label: string;
  value: number;
  unit: string;
  max: number;
  status: { grade: 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD'; label: string };
  Icon: React.ElementType;
}

function getGaugeColorByRatio(ratio: number): string {
  if (ratio <= 0.25) return '#22C55E';
  if (ratio <= 0.5) return '#EAB308';
  if (ratio <= 0.75) return '#F97316';
  return '#EF4444';
}

function formatMetricValue(value: number): string {
  if (Number.isInteger(value)) return `${value}`;
  if (value < 1) return value.toFixed(3).replace(/\.?0+$/, '');
  return value.toFixed(1).replace(/\.0$/, '');
}

function PollutionCard({ label, value, unit, max, status, Icon }: PollutionCardProps) {
  const style = statusStyles[status.grade];
  const isRisky = status.grade === 'BAD' || status.grade === 'VERY_BAD';
  const ratio = Math.min(value / max, 1);
  const fillPercent = Math.max(0, ratio * 100);
  const valueText = formatMetricValue(value);
  const gaugeColor = getGaugeColorByRatio(ratio);

  return (
    <div
      className={`rounded-xl px-4 py-3 transition-colors ${
        isRisky ? `bg-white border-[3px] ${style.riskyBorder}` : 'bg-gray-50 border border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-black" strokeWidth={2} />
          <span className="truncate text-sm font-bold text-gray-700">{label}</span>
          <span className={`shrink-0 text-xs font-semibold ${isRisky ? style.textClass : 'text-gray-500'}`}>
            {status.label}
          </span>
        </div>
        <div className="flex items-end gap-1">
          <span className="text-kpi text-[1.8rem] text-gray-900">{valueText}</span>
          <span className="mb-0.5 text-[10px] font-semibold text-gray-500">{unit}</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fillPercent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: gaugeColor }}
        />
      </div>
    </div>
  );
}

export default function DataGrid({
  data,
  reliabilityLabel,
  reliabilityDescription,
  reliabilityUpdatedAt,
  measurementDataTime,
  measurementRegion,
  delay = 0,
}: DataGridProps) {
  const [isOpen, setIsOpen] = useState(false);

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
            trackCoreEvent('datagrid_opened', { section: 'realtime_widget' });
          }
          setIsOpen(!isOpen);
        }}
        className="flex w-full items-center justify-between p-5 transition-colors hover:bg-gray-50 md:p-6"
        aria-label="실시간 수치 펼치기"
        aria-expanded={isOpen}
        data-testid="datagrid-toggle"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">📊</span>
          <h3 className="text-lg font-black md:text-xl">
            <span className="highlighter-yellow">실시간 수치 보기</span>
          </h3>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }}>
          <ChevronDown size={20} strokeWidth={3} />
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
        <div className="space-y-6 border-t border-gray-100 px-5 pb-5 pt-4 md:px-6 md:pb-6">
          <div className="flex flex-wrap items-center gap-2">
            {reliabilityLabel && (
              <div
                className="inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600"
                title={reliabilityDescription}
                data-testid="datagrid-reliability-badge"
              >
                <span>{reliabilityLabel}</span>
                {reliabilityUpdatedAt && <span>· {reliabilityUpdatedAt} 기준</span>}
              </div>
            )}
            {(measurementDataTime || measurementRegion) && (
              <div
                className="inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600"
                data-testid="datagrid-measurement-badge"
              >
                {measurementDataTime && <span>측정 {measurementDataTime}</span>}
                {measurementRegion && <span>· {measurementRegion}</span>}
              </div>
            )}
          </div>

          <section className="space-y-3">
            <p className="section-label">[날씨]</p>
            <WeatherWidget temp={data.temperature} humidity={data.humidity} />
          </section>

          <section className="space-y-3">
            <p className="section-label">[대기질]</p>
            <div className="space-y-3">
              <PollutionCard
                label="초미세먼지"
                value={data.pm25}
                unit="μg/m³"
                max={150}
                status={getPM25Status(data.pm25)}
                Icon={Wind}
              />
              <PollutionCard
                label="미세먼지"
                value={data.pm10}
                unit="μg/m³"
                max={200}
                status={getPM10Status(data.pm10)}
                Icon={CloudFog}
              />
              <PollutionCard
                label="오존"
                value={data.o3}
                unit="ppm"
                max={0.2}
                status={getO3Status(data.o3)}
                Icon={Sun}
              />
              <PollutionCard
                label="이산화질소"
                value={data.no2}
                unit="ppm"
                max={0.2}
                status={getNO2Status(data.no2)}
                Icon={Factory}
              />
            </div>
          </section>

          <p className="text-[10px] text-gray-600">수치가 높을수록 막대와 테두리 강조가 강해집니다.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
