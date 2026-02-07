"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { getGradeBadgeColor, getGradeText } from "@/lib/colorUtils";

interface HeroCardProps {
  character: string;
  decisionText: string;
  grade: string;
  profileBadge: string;
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

export default function HeroCard({
  character,
  decisionText,
  grade,
  profileBadge,
  isLoading = false,
  loadingCaption,
  isError = false,
  errorTitle = "AI 선생님이 쉬고 있어요",
  errorMessage = "잠시 후 다시 시도해주세요",
  onRetry,
}: HeroCardProps) {
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
        className="col-span-2 h-[44vh] min-h-[360px] bento-card flex flex-col items-center justify-center p-7 text-center"
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
        className="col-span-2 h-[44vh] min-h-[360px] bento-card relative overflow-hidden p-5 md:p-6"
        data-testid="hero-loading"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="h-8 w-28 rounded-lg border-2 border-black bg-gray-100 animate-pulse" />
            <div className="h-10 w-16 rounded-xl border-2 border-black bg-gray-100 animate-pulse" />
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div className="h-52 w-52 rounded-full border border-gray-300 bg-gray-100 animate-pulse md:h-56 md:w-56" />
          </div>

          <div className="mx-auto h-9 w-48 rounded-md bg-gray-200 animate-pulse md:h-10 md:w-56" />
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
      className="col-span-2 h-[44vh] min-h-[360px] bento-card relative flex flex-col items-center justify-between p-5 md:p-6"
    >
      {/* Profile Badge - Top Left, INSIDE card (diary tab style) */}
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="absolute left-5 top-5 z-10 rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-bold shadow-bento-sm md:left-6 md:top-6"
      >
        {profileBadge}
      </motion.div>

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
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
        className="flex-1 flex items-center justify-center"
      >
        <div className="relative h-56 w-56 md:h-60 md:w-60">
          {/* Character with Glow */}
          <div className="relative h-56 w-56 character-glow md:h-60 md:w-60">
            <Image
              src={character}
              alt="Air quality character"
              fill
              className="object-contain relative z-10"
              priority
            />
          </div>
        </div>
      </motion.div>

      {/* Decision Text - Bottom, Extra Bold */}
      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-3xl md:text-4xl font-black text-center text-extra-bold leading-tight"
      >
        {decisionText}
      </motion.h1>
    </motion.div>
  );
}
