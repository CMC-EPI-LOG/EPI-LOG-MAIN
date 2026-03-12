'use client';

import { motion } from 'framer-motion';
import { type ElementType, useState } from 'react';
import {
  ChevronDown,
  Thermometer,
  Droplets,
  Wind,
  CloudFog,
  Sun,
  Factory,
  Loader2,
  RotateCw,
  Gauge,
} from 'lucide-react';
import { trackCoreEvent } from '@/lib/analytics/ga';

type MetricGrade = 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD' | 'UNKNOWN';

interface DataGridProps {
  data: {
    pm25?: number | null;
    pm10?: number | null;
    o3?: number | null;
    temperature?: number | null;
    humidity?: number | null;
    no2?: number | null;
    co?: number | null;
    so2?: number | null;
    khai?: number | null;
    khaiGrade?: string | null;
    pm10Value24h?: number | null;
    pm25Value24h?: number | null;
    pm10Grade1h?: string | null;
    pm25Grade1h?: string | null;
  };
  reliabilityLabel?: string;
  reliabilityDescription?: string;
  reliabilityUpdatedAt?: string;
  measurementDataTime?: string;
  measurementRegion?: string;
  freshnessStatus?: 'FRESH' | 'DELAYED' | 'STALE';
  freshnessDescription?: string;
  onRefreshData?: () => void;
  isRefreshing?: boolean;
  delay?: number;
  isLoading?: boolean;
}

function normalizeMetricValue(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}

function getPM25Status(value: number | null): { grade: MetricGrade; label: string } {
  if (value == null) return { grade: 'UNKNOWN', label: '확인중' };
  if (value <= 15) return { grade: 'GOOD', label: '좋음' };
  if (value <= 35) return { grade: 'NORMAL', label: '보통' };
  if (value <= 75) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function getPM10Status(value: number | null): { grade: MetricGrade; label: string } {
  if (value == null) return { grade: 'UNKNOWN', label: '확인중' };
  if (value <= 30) return { grade: 'GOOD', label: '좋음' };
  if (value <= 80) return { grade: 'NORMAL', label: '보통' };
  if (value <= 150) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function getO3Status(value: number | null): { grade: MetricGrade; label: string } {
  if (value == null) return { grade: 'UNKNOWN', label: '확인중' };
  if (value <= 0.03) return { grade: 'GOOD', label: '좋음' };
  if (value <= 0.09) return { grade: 'NORMAL', label: '보통' };
  if (value <= 0.15) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function getNO2Status(value: number | null): { grade: MetricGrade; label: string } {
  if (value == null) return { grade: 'UNKNOWN', label: '확인중' };
  if (value <= 0.03) return { grade: 'GOOD', label: '좋음' };
  if (value <= 0.06) return { grade: 'NORMAL', label: '보통' };
  if (value <= 0.2) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function getCOStatus(value: number | null): { grade: MetricGrade; label: string } {
  if (value == null) return { grade: 'UNKNOWN', label: '확인중' };
  if (value <= 2) return { grade: 'GOOD', label: '좋음' };
  if (value <= 9) return { grade: 'NORMAL', label: '보통' };
  if (value <= 15) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function getSO2Status(value: number | null): { grade: MetricGrade; label: string } {
  if (value == null) return { grade: 'UNKNOWN', label: '확인중' };
  if (value <= 0.02) return { grade: 'GOOD', label: '좋음' };
  if (value <= 0.05) return { grade: 'NORMAL', label: '보통' };
  if (value <= 0.15) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

function statusFromGradeLabel(label?: string | null): { grade: MetricGrade; label: string } {
  const normalized = label?.replace(/\s+/g, '') || '';
  if (!normalized) return { grade: 'UNKNOWN', label: '확인중' };
  if (normalized.includes('매우나쁨')) return { grade: 'VERY_BAD', label: '매우나쁨' };
  if (normalized.includes('나쁨')) return { grade: 'BAD', label: '나쁨' };
  if (normalized.includes('보통')) return { grade: 'NORMAL', label: '보통' };
  if (normalized.includes('좋음')) return { grade: 'GOOD', label: '좋음' };
  return { grade: 'UNKNOWN', label: label || '확인중' };
}

function getKHAIStatus(value: number | null, gradeLabel?: string | null): { grade: MetricGrade; label: string } {
  const gradeFromLabel = statusFromGradeLabel(gradeLabel);
  if (gradeFromLabel.grade !== 'UNKNOWN') return gradeFromLabel;
  if (value == null) return { grade: 'UNKNOWN', label: '확인중' };
  if (value <= 50) return { grade: 'GOOD', label: '좋음' };
  if (value <= 100) return { grade: 'NORMAL', label: '보통' };
  if (value <= 250) return { grade: 'BAD', label: '나쁨' };
  return { grade: 'VERY_BAD', label: '매우나쁨' };
}

const statusStyles: Record<MetricGrade, { color: string; riskyBorder: string; textClass: string }> = {
  GOOD: { color: '#22C55E', riskyBorder: 'border-green-500', textClass: 'text-green-700' },
  NORMAL: { color: '#EAB308', riskyBorder: 'border-yellow-500', textClass: 'text-yellow-700' },
  BAD: { color: '#F97316', riskyBorder: 'border-orange-500', textClass: 'text-orange-700' },
  VERY_BAD: { color: '#EF4444', riskyBorder: 'border-red-500', textClass: 'text-red-700' },
  UNKNOWN: { color: '#9CA3AF', riskyBorder: 'border-gray-300', textClass: 'text-gray-500' },
};

function formatMetricValue(value: number | null): string {
  if (value == null) return '-';
  if (Number.isInteger(value)) return `${value}`;
  if (Math.abs(value) < 1) return value.toFixed(3).replace(/\.?0+$/, '');
  return value.toFixed(1).replace(/\.0$/, '');
}

function getGaugeColorByRatio(ratio: number, grade: MetricGrade): string {
  if (grade === 'UNKNOWN') return '#D1D5DB';
  if (ratio <= 0.25) return '#22C55E';
  if (ratio <= 0.5) return '#EAB308';
  if (ratio <= 0.75) return '#F97316';
  return '#EF4444';
}

function buildPmHelperText(
  grade1h: string | null | undefined,
  value24h: number | null | undefined,
  unit: string,
): string | undefined {
  const parts: string[] = [];
  if (grade1h) parts.push(`1시간 ${grade1h}`);
  const normalized24h = normalizeMetricValue(value24h);
  if (normalized24h != null) parts.push(`24시간 ${formatMetricValue(normalized24h)} ${unit}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function WeatherMetricCard({
  label,
  value,
  unit,
  Icon,
}: {
  label: string;
  value: number | null;
  unit: string;
  Icon: ElementType;
}) {
  return (
    <div className="rounded-xl border-2 border-black bg-gray-50 px-4 py-3">
      <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600">
        <Icon className="h-4 w-4 text-black" strokeWidth={2} />
        {label}
      </div>
      <div className="flex items-end gap-1">
        <span className="text-[1.8rem] font-black leading-none text-gray-900">{formatMetricValue(value)}</span>
        <span className="mb-0.5 text-[10px] font-semibold text-gray-500">{unit}</span>
      </div>
    </div>
  );
}

interface PollutionCardProps {
  label: string;
  value: number | null;
  unit: string;
  max: number;
  status: { grade: MetricGrade; label: string };
  Icon: ElementType;
  helperText?: string;
}

function PollutionCard({ label, value, unit, max, status, Icon, helperText }: PollutionCardProps) {
  const style = statusStyles[status.grade];
  const isRisky = status.grade === 'BAD' || status.grade === 'VERY_BAD';
  const numericValue = value ?? 0;
  const ratio = value == null ? 0 : Math.min(numericValue / max, 1);
  const fillPercent = Math.max(0, ratio * 100);
  const valueText = formatMetricValue(value);
  const gaugeColor = getGaugeColorByRatio(ratio, status.grade);

  return (
    <div
      className={`rounded-xl px-4 py-3 transition-colors ${
        isRisky ? `border-[3px] bg-white ${style.riskyBorder}` : 'border border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-black" strokeWidth={2} />
          <span className="truncate text-sm font-bold text-gray-700">{label}</span>
          <span className={`shrink-0 text-xs font-semibold ${style.textClass}`}>{status.label}</span>
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
      {helperText && <p className="mt-2 text-[10px] font-medium text-gray-500">{helperText}</p>}
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
  freshnessStatus,
  freshnessDescription,
  onRefreshData,
  isRefreshing = false,
  delay = 0,
  isLoading = false,
}: DataGridProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDataDelayed = freshnessStatus === 'DELAYED' || freshnessStatus === 'STALE';
  const freshnessBadgeClass =
    freshnessStatus === 'STALE'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  const pm25 = normalizeMetricValue(data.pm25);
  const pm10 = normalizeMetricValue(data.pm10);
  const o3 = normalizeMetricValue(data.o3);
  const no2 = normalizeMetricValue(data.no2);
  const co = normalizeMetricValue(data.co);
  const so2 = normalizeMetricValue(data.so2);
  const temp = normalizeMetricValue(data.temperature);
  const humidity = normalizeMetricValue(data.humidity);
  const khai = normalizeMetricValue(data.khai);
  const khaiStatus = getKHAIStatus(khai, data.khaiGrade);
  const hasKhaiSummary = khai != null || Boolean(data.khaiGrade);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.4 }}
        className="col-span-2 bento-card overflow-hidden"
        data-testid="datagrid-loading"
      >
        <div className="flex w-full items-center justify-between p-5 md:p-6">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📊</span>
            <h3 className="text-lg font-black md:text-xl">
              <span className="highlighter-yellow">실시간 수치 보기</span>
            </h3>
          </div>
          <div className="h-5 w-5 rounded-full skeleton-block" />
        </div>
        <div className="space-y-6 border-t border-gray-100 px-5 pb-5 pt-4 md:px-6 md:pb-6">
          <div className="h-4 w-52 rounded-full skeleton-block" />
          <section className="space-y-3">
            <p className="section-label">[날씨]</p>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((idx) => (
                <div key={idx} className="h-24 rounded-xl border-2 border-black skeleton-block" />
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <p className="section-label">[대기질]</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div key={idx} className="h-24 rounded-xl border border-gray-200 skeleton-block" />
              ))}
            </div>
          </section>
        </div>
      </motion.div>
    );
  }

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
            trackCoreEvent('datagrid_opened', { ui_section: 'realtime_widget' });
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
            {hasKhaiSummary && (
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusStyles[khaiStatus.grade].textClass} ${
                  khaiStatus.grade === 'VERY_BAD'
                    ? 'border-red-200 bg-red-50'
                    : khaiStatus.grade === 'BAD'
                      ? 'border-orange-200 bg-orange-50'
                      : khaiStatus.grade === 'NORMAL'
                        ? 'border-amber-200 bg-amber-50'
                        : khaiStatus.grade === 'GOOD'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-gray-200 bg-gray-50'
                }`}
                data-testid="datagrid-khai-badge"
              >
                <Gauge className="h-3.5 w-3.5" />
                <span>KHAI {formatMetricValue(khai)}</span>
                <span>· {khaiStatus.label}</span>
              </div>
            )}
            {isDataDelayed && (
              <div
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${freshnessBadgeClass}`}
                title={freshnessDescription}
                data-testid="datagrid-freshness-badge"
              >
                <span>지연 데이터</span>
              </div>
            )}
            {isDataDelayed && onRefreshData && (
              <button
                type="button"
                onClick={onRefreshData}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                data-testid="datagrid-refresh-button"
              >
                {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                자동 재조회
              </button>
            )}
          </div>

          <section className="space-y-3">
            <p className="section-label">[날씨]</p>
            <div className="grid grid-cols-2 gap-3">
              <WeatherMetricCard label="온도" value={temp} unit="°C" Icon={Thermometer} />
              <WeatherMetricCard label="습도" value={humidity} unit="%" Icon={Droplets} />
            </div>
          </section>

          <section className="space-y-3">
            <p className="section-label">[대기질]</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <PollutionCard
                label="통합지수"
                value={khai}
                unit=""
                max={500}
                status={khaiStatus}
                Icon={Gauge}
                helperText={data.khaiGrade ? `KHAI 등급 ${data.khaiGrade}` : '통합대기환경지수'}
              />
              <PollutionCard
                label="초미세먼지"
                value={pm25}
                unit="μg/m³"
                max={150}
                status={getPM25Status(pm25)}
                Icon={Wind}
                helperText={buildPmHelperText(data.pm25Grade1h, data.pm25Value24h, 'μg/m³')}
              />
              <PollutionCard
                label="미세먼지"
                value={pm10}
                unit="μg/m³"
                max={200}
                status={getPM10Status(pm10)}
                Icon={CloudFog}
                helperText={buildPmHelperText(data.pm10Grade1h, data.pm10Value24h, 'μg/m³')}
              />
              <PollutionCard
                label="오존"
                value={o3}
                unit="ppm"
                max={0.2}
                status={getO3Status(o3)}
                Icon={Sun}
              />
              <PollutionCard
                label="이산화질소"
                value={no2}
                unit="ppm"
                max={0.2}
                status={getNO2Status(no2)}
                Icon={Factory}
              />
              <PollutionCard
                label="일산화탄소"
                value={co}
                unit="ppm"
                max={20}
                status={getCOStatus(co)}
                Icon={Wind}
              />
              <PollutionCard
                label="아황산가스"
                value={so2}
                unit="ppm"
                max={0.2}
                status={getSO2Status(so2)}
                Icon={CloudFog}
              />
            </div>
          </section>

          <div className="space-y-2 border-t border-dashed border-gray-200 pt-3">
            <p className="text-[10px] text-gray-600">총 9개 지표를 현재 위치 기준으로 보여줍니다.</p>
            <p className="text-[10px] leading-5 text-gray-500">
              출처: 한국환경공단 에어코리아, 기상청, 공공데이터포털
              <br />
              실시간 데이터는 측정소 사정, 통신 상태, 제공기관 갱신 지연에 따라 일부 값이 지연되거나 누락될 수 있습니다.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
