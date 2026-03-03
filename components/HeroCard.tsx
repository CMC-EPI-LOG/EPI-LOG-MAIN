"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { getGradeBadgeColor, getGradeText } from "@/lib/colorUtils";

interface HeroCardProps {
  character: string;
  decisionText: string;
  reasonText?: string;
  maskRecommendation?: string;
  grade: string;
  ageSummary: string;
  conditionSummary?: string;
  onOpenAgeModal?: () => void;
  isAgeButtonDisabled?: boolean;
  onOpenConditionModal?: () => void;
  isConditionButtonDisabled?: boolean;
  onOpenClothingModal?: () => void;
  isClothingButtonDisabled?: boolean;
  isLoading?: boolean;
  loadingCaption?: string;
  isError?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;
}

const DEFAULT_LOADING_MESSAGES = [
  "아이 컨디션에 맞는 실외 활동을 계산하고 있어요.",
  "최근 1시간 측정값 기준으로 안전도를 확인 중이에요.",
  "대기질과 프로필을 함께 반영해 맞춤 가이드를 정리하고 있어요.",
];

const LOCATION_LOADING_MESSAGES = [
  "선택한 지역의 측정소 데이터를 확인하고 있어요.",
  "주소와 가장 가까운 유효 측정소를 탐색 중이에요.",
  "지역 기준으로 실측 데이터와 가이드를 동기화하고 있어요.",
];

const PROFILE_LOADING_MESSAGES = [
  "연령/질환 조건으로 위험도를 다시 계산하고 있어요.",
  "아이 상태에 맞는 행동 가이드를 새로 정리하고 있어요.",
  "개인화 규칙을 반영해 추천 문구를 업데이트하고 있어요.",
];

function getOutingStatusByGrade(grade: string): { label: string; colorClass: string } {
  const normalized = (grade || "").toUpperCase();
  if (normalized === "GOOD") {
    return { label: "외출 O", colorClass: "text-emerald-600" };
  }
  if (normalized === "NORMAL") {
    return { label: "외출 주의", colorClass: "text-amber-500" };
  }
  return { label: "외출 비권장", colorClass: "text-red-600" };
}

function shouldShowMaskRecommendation(grade: string): boolean {
  const normalized = (grade || "").toUpperCase();
  return normalized === "BAD" || normalized === "VERY_BAD";
}

function getMaskRecommendationText(maskRecommendation?: string): string {
  const normalized = maskRecommendation?.trim();
  if (!normalized || normalized === "확인 필요") return "KF80 마스크 착용 권장";
  if (normalized === "KF80 권장") return "KF80 마스크 착용 권장";
  return normalized;
}

export default function HeroCard({
  character,
  decisionText,
  reasonText,
  maskRecommendation,
  grade,
  ageSummary,
  conditionSummary,
  onOpenAgeModal,
  isAgeButtonDisabled = false,
  onOpenConditionModal,
  isConditionButtonDisabled = false,
  onOpenClothingModal,
  isClothingButtonDisabled = false,
  isLoading = false,
  loadingCaption,
  isError = false,
  errorTitle = "AI 선생님이 쉬고 있어요",
  errorMessage = "잠시 후 다시 시도해주세요",
  onRetry,
}: HeroCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const outingStatus = useMemo(() => getOutingStatusByGrade(grade), [grade]);
  const showMaskRecommendation = useMemo(() => shouldShowMaskRecommendation(grade), [grade]);
  const maskRecommendationText = useMemo(
    () => getMaskRecommendationText(maskRecommendation),
    [maskRecommendation],
  );
  const loadingMessages = useMemo(() => {
    if (loadingCaption?.includes("연령/질환")) return PROFILE_LOADING_MESSAGES;
    if (loadingCaption?.includes("기준으로 데이터 업데이트")) return LOCATION_LOADING_MESSAGES;
    return DEFAULT_LOADING_MESSAGES;
  }, [loadingCaption]);

  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    if (!isLoading || loadingMessages.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLoading, loadingMessages]);

  // Error state
  if (isError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="col-span-2 min-h-[380px] bento-card flex flex-col items-center justify-center p-7 text-center md:min-h-[440px]"
        data-testid="hero-error"
      >
        <div className="text-8xl mb-4">😎</div>
        <h2 className="mb-2 text-2xl font-black md:text-3xl">{errorTitle}</h2>
        <p className="text-base text-gray-600 md:text-lg">{errorMessage}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 rounded-xl border-2 border-black bg-[#FEE500] px-5 py-2.5 text-sm font-black text-black shadow-bento-sm transition-colors hover:bg-[#FDD835]"
          >
            다시 시도
          </button>
        )}
      </motion.div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className="col-span-2 min-h-[380px] bento-card relative overflow-hidden p-5 md:min-h-[440px] md:p-6"
        data-testid="hero-loading"
      >
        <div className="absolute inset-0 skeleton-block opacity-45" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="h-8 w-28 rounded-lg border-2 border-black skeleton-block" />
            <div className="h-10 w-16 rounded-xl border-2 border-black skeleton-block" />
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div className="relative h-52 w-52 md:h-56 md:w-56">
              <div className="absolute inset-0 rounded-full border border-gray-300 skeleton-block" />
              <div className="absolute inset-6 rounded-full border border-gray-200 bg-gray-100/70" />
            </div>
          </div>

          <div className="mx-auto h-9 w-48 rounded-md skeleton-block md:h-10 md:w-56" />
          <p
            className="mt-2 text-center text-xs font-semibold text-gray-700 md:text-sm"
            data-testid="hero-loading-message"
          >
            {loadingMessages[loadingMessageIndex % loadingMessages.length]}
          </p>
          {loadingCaption && (
            <p
              className="mt-1 text-center text-xs font-semibold text-gray-600"
              data-testid="hero-loading-caption"
            >
              {loadingCaption}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="col-span-2 min-h-[460px] bento-card relative flex flex-col items-center p-5 md:min-h-[540px] md:p-6"
    >
      <div className="absolute left-5 top-5 z-10 md:left-6 md:top-6">
        <div className="inline-grid max-w-[min(290px,calc(100vw-88px))] grid-cols-1 gap-2">
          {onOpenAgeModal && (
            <motion.button
              type="button"
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              onClick={onOpenAgeModal}
              disabled={isAgeButtonDisabled}
              className={`inline-flex w-full items-center justify-start gap-1.5 rounded-xl border-2 border-black bg-white/95 px-3 py-1.5 text-xs font-black shadow-bento-sm transition hover:bg-black hover:text-white ${
                isAgeButtonDisabled ? "cursor-not-allowed opacity-60" : ""
              }`}
              data-testid="hero-age-open"
            >
              <span aria-hidden="true">👶</span>
              <span className="min-w-0 text-left">{ageSummary}</span>
            </motion.button>
          )}

          {onOpenConditionModal && (
            <motion.button
              type="button"
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.25 }}
              onClick={onOpenConditionModal}
              disabled={isConditionButtonDisabled}
              className={`inline-flex w-full items-center justify-start gap-1.5 rounded-xl border-2 border-black bg-white/95 px-3 py-1.5 text-xs font-black shadow-bento-sm transition hover:bg-black hover:text-white ${
                isConditionButtonDisabled ? "cursor-not-allowed opacity-60" : ""
              }`}
              data-testid="hero-condition-open"
            >
              <span aria-hidden="true">🩺</span>
              <span className="min-w-0 text-left">{conditionSummary || "질환: 해당 없음"}</span>
            </motion.button>
          )}

          {onOpenClothingModal && (
            <motion.button
              type="button"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              onClick={onOpenClothingModal}
              disabled={isClothingButtonDisabled}
              className={`inline-flex w-full items-center justify-start gap-1.5 rounded-xl border-2 border-black bg-white/95 px-3 py-1.5 text-xs font-black shadow-bento-sm transition hover:bg-black hover:text-white ${
                isClothingButtonDisabled ? "cursor-not-allowed opacity-70" : ""
              }`}
              data-testid="hero-clothing-open"
            >
              <span aria-hidden="true">👕</span>
              <span className="min-w-0 text-left">옷차림 보기</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Grade Badge - Top Right, INSIDE card (stamp/price tag style) */}
      <motion.div
        initial={{ x: 50, opacity: 0, rotate: 0 }}
        animate={{ x: 0, opacity: 1, rotate: 3 }}
        transition={{ delay: 0.3 }}
        className={`absolute right-5 top-5 rounded-xl border-2 border-black px-4 py-2 text-base font-black shadow-bento-sm md:right-6 md:top-6 md:px-5 ${getGradeBadgeColor(grade)}`}
      >
        {getGradeText(grade)}
      </motion.div>

      {/* Character - Center, Large */}
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, rotate: -8, y: 14 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0, y: 0 }}
        transition={
          prefersReducedMotion
            ? { duration: 0.3, delay: 0.2 }
            : { delay: 0.35, type: "spring", stiffness: 180, damping: 14 }
        }
        className="mt-12 flex flex-1 items-center justify-center md:mt-8"
      >
        <motion.div
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  y: [-2, -10, -2, 4, -2],
                  rotate: [0, -1.2, 0, 1.2, 0],
                }
          }
          transition={
            prefersReducedMotion
              ? undefined
              : {
                  duration: 4.8,
                  delay: 0.7,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
          className="relative h-44 w-44 md:h-52 md:w-52"
        >
          <div className="relative h-44 w-44 character-glow md:h-52 md:w-52">
            <Image src={character} alt="Air quality character" fill className="relative z-10 object-contain" priority />
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-2 flex w-full flex-col items-center gap-2 text-center"
      >
        <h1
          className={`text-3xl font-black leading-tight md:text-4xl ${outingStatus.colorClass}`}
          data-testid="hero-outing-status"
        >
          {outingStatus.label}
        </h1>
        {showMaskRecommendation && (
          <p
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-red-50 px-3 py-1 text-sm font-black text-red-700 md:text-base"
            data-testid="hero-mask-recommendation"
          >
            <span aria-hidden="true">😷</span>
            <span>{maskRecommendationText}</span>
          </p>
        )}
        <p className="text-xl font-black leading-tight text-gray-900 md:text-2xl" data-testid="hero-main-text">
          {decisionText}
        </p>
        {reasonText && (
          <p
            className="max-w-[92%] whitespace-pre-line text-sm font-semibold leading-snug text-gray-700 md:text-base"
            data-testid="hero-csv-reason"
          >
            {reasonText}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
