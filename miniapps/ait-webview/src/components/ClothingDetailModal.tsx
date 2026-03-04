'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { type PointerEvent, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Loader2,
  Moon,
  RefreshCw,
  Shirt,
  Sparkles,
  Sun,
  Thermometer,
  X,
} from 'lucide-react';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface ForecastItem {
  forecastAt: string;
  dateKst: string;
  hourKst: number;
  temperature: number | null;
  humidity: number | null;
  precipitation: number | string | null;
  precipitationProbability: number | null;
  precipitationType: number | null;
  sky: number | null;
}

interface ClothingDetailModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  isForecastLoading?: boolean;
  summary?: string;
  recommendation?: string;
  tips?: string[];
  temperature?: number;
  humidity?: number;
  forecastItems?: ForecastItem[];
  forecastStationName?: string;
  onRefresh?: () => void;
  onClose: () => void;
}

function formatMetric(value: number | undefined, unit: string): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return `- ${unit}`;
  const normalized = Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
  return `${normalized}${unit}`;
}

function normalizeHour(hour: number): number {
  const rounded = Math.floor(hour);
  const normalized = rounded % 24;
  return normalized >= 0 ? normalized : normalized + 24;
}

function formatHourLabel(hour: number): string {
  const normalized = normalizeHour(hour);
  const period = normalized < 12 ? '오전' : '오후';
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${period} ${hour12}시`;
}

function formatDateBadge(dateKst: string): string {
  const matched = dateKst.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return dateKst;
  const [, year, month, day] = matched;
  const dayIndex = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
  return `${Number(month)}월 ${Number(day)}일(${WEEKDAY_LABELS[dayIndex]})`;
}

function formatTemperature(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  const normalized = Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
  return `${normalized}°`;
}

function formatProbability(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return `${Math.round(value)}%`;
}

function formatPrecipitation(value: number | string | null | undefined): string | null {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return `${value.toFixed(1).replace(/\.0$/, '')}mm`;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  return null;
}

function toPrecipitationType(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.round(value);
}

function ForecastWeatherIcon({ item }: { item: ForecastItem }) {
  const precipitationType = toPrecipitationType(item.precipitationType);
  const isNight = item.hourKst < 6 || item.hourKst >= 18;

  if (precipitationType === 1 || precipitationType === 4) {
    return <CloudRain className="h-7 w-7 text-blue-500" />;
  }

  if (precipitationType === 2 || precipitationType === 3) {
    return <CloudSnow className="h-7 w-7 text-cyan-500" />;
  }

  if (item.sky !== null && item.sky >= 4) {
    return <Cloud className="h-7 w-7 text-slate-500" />;
  }

  if (item.sky === 3) {
    if (isNight) {
      return <CloudMoon className="h-7 w-7 text-slate-500" />;
    }

    return <CloudSun className="h-7 w-7 text-slate-500" />;
  }

  if (isNight) {
    return <Moon className="h-7 w-7 text-slate-500" />;
  }

  return <Sun className="h-7 w-7 text-amber-500" />;
}

export default function ClothingDetailModal({
  isOpen,
  isLoading = false,
  isForecastLoading = false,
  summary,
  recommendation,
  tips,
  temperature,
  humidity,
  forecastItems,
  forecastStationName,
  onRefresh,
  onClose,
}: ClothingDetailModalProps) {
  const forecastScrollRef = useRef<HTMLDivElement>(null);
  const isDragActiveRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const displaySummary = summary || '현재 온습도를 바탕으로 옷차림을 정리하고 있어요.';
  const displayRecommendation = recommendation || '얇은 겉옷을 한 겹 챙겨 주세요.';
  const displayTips =
    Array.isArray(tips) && tips.length > 0
      ? tips.slice(0, 3)
      : ['실내외 온도차를 고려해 탈착 가능한 레이어드를 권장해요.'];
  const displayForecastItems = Array.isArray(forecastItems) ? forecastItems.slice(0, 48) : [];

  const handleSlide = (direction: 1 | -1) => {
    const container = forecastScrollRef.current;
    if (!container) return;
    const moveBy = Math.max(Math.round(container.clientWidth * 0.75), 180);
    container.scrollBy({ left: direction * moveBy, behavior: 'smooth' });
  };

  const handleForecastPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const container = forecastScrollRef.current;
    if (!container) return;

    isDragActiveRef.current = true;
    activePointerIdRef.current = event.pointerId;
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = container.scrollLeft;
    container.style.scrollBehavior = 'auto';
    container.classList.remove('cursor-grab');
    container.classList.add('cursor-grabbing');

    if (container.setPointerCapture) {
      container.setPointerCapture(event.pointerId);
    }
  };

  const handleForecastPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragActiveRef.current) return;
    const container = forecastScrollRef.current;
    if (!container) return;

    const deltaX = event.clientX - dragStartXRef.current;
    container.scrollLeft = dragStartScrollLeftRef.current - deltaX;
    event.preventDefault();
  };

  const handleForecastPointerEnd = () => {
    if (!isDragActiveRef.current) return;
    const container = forecastScrollRef.current;
    isDragActiveRef.current = false;

    if (!container) return;
    const pointerId = activePointerIdRef.current;
    if (pointerId !== null && container.releasePointerCapture && container.hasPointerCapture?.(pointerId)) {
      container.releasePointerCapture(pointerId);
    }
    activePointerIdRef.current = null;
    container.style.scrollBehavior = '';
    container.classList.remove('cursor-grabbing');
    container.classList.add('cursor-grab');
  };

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

              <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 text-gray-900">
                  <p className="text-xs font-black">날씨 예보</p>
                  <p className="max-w-[40%] truncate text-[11px] font-semibold text-gray-500">
                    {forecastStationName || '예보 지역 확인 중'}
                  </p>
                </div>

                <div className="relative bg-white px-2 py-2.5">
                  {isForecastLoading ? (
                    <div className="flex gap-2 overflow-hidden">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={`forecast-skeleton-${index}`}
                          className="h-[132px] w-[86px] shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-2"
                        >
                          <div className="skeleton-block mb-2 h-3 w-16 rounded" />
                          <div className="skeleton-block mb-2 h-3 w-12 rounded" />
                          <div className="skeleton-block mb-3 h-7 w-7 rounded-full" />
                          <div className="skeleton-block mb-2 h-5 w-10 rounded" />
                          <div className="skeleton-block h-3 w-14 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : displayForecastItems.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-semibold text-gray-600">
                      표시할 예보 데이터가 아직 없어요.
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSlide(-1)}
                        className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-gray-300 bg-white p-1 text-gray-500"
                        aria-label="이전 예보 보기"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSlide(1)}
                        className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-gray-300 bg-white p-1 text-gray-500"
                        aria-label="다음 예보 보기"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>

                      <div
                        ref={forecastScrollRef}
                        onPointerDown={handleForecastPointerDown}
                        onPointerMove={handleForecastPointerMove}
                        onPointerUp={handleForecastPointerEnd}
                        onPointerCancel={handleForecastPointerEnd}
                        className="cursor-grab overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        <div className="flex min-w-max gap-2 px-7">
                          {displayForecastItems.map((item, index) => {
                            const previous = displayForecastItems[index - 1];
                            const showDateBadge = index === 0 || previous.dateKst !== item.dateKst;
                            const probability = formatProbability(item.precipitationProbability);
                            const precipitation = formatPrecipitation(item.precipitation);
                            return (
                              <div
                                key={`${item.forecastAt}-${index}`}
                                className="w-[86px] shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-gray-900"
                              >
                                <p className="min-h-[14px] text-[10px] font-semibold text-gray-500">
                                  {showDateBadge ? formatDateBadge(item.dateKst) : '\u00A0'}
                                </p>
                                <p className="text-[11px] font-semibold text-gray-500">
                                  {formatHourLabel(item.hourKst)}
                                </p>
                                <div className="mt-1 flex justify-start">
                                  <ForecastWeatherIcon item={item} />
                                </div>
                                <p className="mt-1 text-2xl font-black leading-none">
                                  {formatTemperature(item.temperature)}
                                </p>
                                <p className="mt-1 min-h-[14px] text-[11px] font-semibold text-gray-500">
                                  {probability || '\u00A0'}
                                </p>
                                <p className="min-h-[14px] text-[11px] font-semibold text-gray-500">
                                  {precipitation || '\u00A0'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
