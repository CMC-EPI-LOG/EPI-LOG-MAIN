"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserProfile } from "@/store/useUserStore";

interface AirData {
  grade?: string; // 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD'
  value?: number;
  stationName?: string;
  // Add other fields as per API response
}

interface AiGuide {
  summary?: string;
  detail?: string;
  activityRecommendation?: string;

  maskRecommendation?: string;
  references?: string[];
  actionItems?: string[];
  // Add fields
}

interface DecisionCardProps {
  mode: "teaser" | "custom";
  profile: UserProfile | null;
  airData: AirData | null;
  aiGuide: AiGuide | null;
  onOpenOnboarding: () => void;
  isLoading: boolean;
}

export default function DecisionCard({
  mode,
  profile,
  airData,
  aiGuide,
  onOpenOnboarding,
  isLoading,
}: DecisionCardProps) {
  const [loadingText, setLoadingText] = useState("대기질 정보를 수신 중... 📡");
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const texts = [
      "대기질 정보를 수신 중... 📡",
      "관련 의학 논문 검색 중... 📚",
      "AI가 정밀 분석 중... 🤖",
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % texts.length;
      setLoadingText(texts[i]);
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="w-full max-w-md bg-white p-6 rounded-2xl brutal-border relative flex flex-col gap-4 shadow-[8px_8px_0px_0px_rgba(200,200,200,1)] animate-pulse">
        <div className="absolute -top-4 -right-4 bg-gray-200 px-4 py-2 rounded-full border-2 border-gray-300 w-24 h-8"></div>
        <div className="h-8 bg-gray-200 rounded w-3/4 mt-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>

        <div className="bg-gray-100 p-6 rounded-xl border-2 border-gray-200 space-y-2 mt-2 h-40">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>

        <div className="text-center font-bold text-gray-500 mt-2 min-h-[1.5rem] transition-all duration-300">
          {loadingText}
        </div>
      </div>
    );
  }

  const stationName = airData?.stationName || "지금 여기";
  const getGradeColor = (decision?: string) => {
    if (!decision) return "bg-white";
    if (decision.includes("안전") || decision.includes("좋아요")) return "bg-[#E3F2FD]"; // Soft Blue
    if (decision.includes("추천") || decision.includes("주의")) return "bg-[#FFFDE7]"; // Soft Yellow
    if (decision.includes("금지") || decision.includes("제한") || decision.includes("위험")) return "bg-[#FFEBEE]"; // Soft Red
    return "bg-white";
  };

  const bgColor = getGradeColor(aiGuide?.summary || aiGuide?.detail);

  // Check for infant age group
  const isInfant = profile?.ageGroup === "infant";

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      className={`w-full max-w-md ${bgColor} p-6 rounded-2xl brutal-border relative flex flex-col gap-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center transition-colors duration-500`}
    >
      {/* Age Group & Condition Badge */}
      <div className="absolute -top-4 -left-4 bg-white px-3 py-1 rounded-full border-2 border-black text-xs font-bold shadow-[2px_2px_0px_0px_black]">
        {profile?.ageGroup === "infant" ? "👶 영아(0~2세)" : 
         profile?.ageGroup === "toddler" ? "🧒 유아(3~6세)" :
         profile?.ageGroup === "elementary_low" ? "🎒 초등 저학년" :
         profile?.ageGroup === "elementary_high" ? "🏫 초등 고학년" : "🧑 청소년/성인"} 
        {profile?.condition === "asthma" ? " · 천식" : 
         profile?.condition === "rhinitis" ? " · 비염" : 
         profile?.condition === "atopy" ? " · 아토피" : ""}
      </div>

      <div className="absolute -top-4 -right-4 bg-yellow-300 px-4 py-2 rounded-full border-2 border-black font-bold rotate-12 shadow-[2px_2px_0px_0px_black]">
        {mode === "teaser"
          ? "우리 동네"
          : profile?.nickname
            ? ` ${profile.nickname} 맞춤`
            : "우리 아이 맞춤"}
      </div>

      {/* Infant Warning Badge */}
      {isInfant && (
        <div className="mt-6 bg-red-600 text-white text-xs font-black py-2 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_black] animate-bounce">
          ※ 주의: 마스크 착용 금지 (질식 위험)
        </div>
      )}

      <h1 className="text-3xl font-black mt-4 whitespace-pre-wrap leading-tight underline decoration-yellow-400 decoration-4 underline-offset-4">
        {aiGuide?.summary || "오늘 실외 활동은 짧게!"}
      </h1>

      <div className="bg-white/80 p-6 rounded-xl border-2 border-black text-left space-y-4">
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-gray-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-black rounded-full"></span> 왜 그런가요?
          </h3>
          <p className="text-gray-900 leading-relaxed font-bold text-[1.05rem]">
            {aiGuide?.detail || "데이터를 분석 중입니다..."}
          </p>
        </div>

        {/* Action Items with Checkboxes */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-gray-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-black rounded-full"></span> 아이를 위해 지금 결정하세요
          </h3>
          {aiGuide?.actionItems && aiGuide.actionItems.length > 0 ? (
            <div className="space-y-2">
              {aiGuide.actionItems.map((item, idx) => (
                <label
                  key={idx}
                  className="bg-white p-3 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_black] flex gap-3 items-center cursor-pointer hover:bg-gray-50 transition-colors active:translate-y-0.5 active:shadow-none"
                >
                  <input type="checkbox" className="w-5 h-5 accent-black border-2 border-black rounded" />
                  <span className="text-gray-900 text-sm font-bold">
                    {item}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">행동 지침을 불러오는 중입니다.</p>
          )}
        </div>

        {/* Scientific Basis Section */}
        <div className="pt-4 mt-2 border-t-2 border-black border-dashed">
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] text-gray-500 leading-tight flex-1">
              ⓘ 이 결정은 소아 폐 발달 관련 논문(Gauderman et al., 2015 등)을 기반으로 환경 변수(온도, 습도)를 보정하여 산출되었습니다.
            </p>
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="text-[10px] font-bold text-black underline underline-offset-2 ml-2 whitespace-nowrap"
            >
              {showDetail ? "수치 접기" : "실시간 수치"}
            </button>
          </div>

          <AnimatePresence>
            {showDetail && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-2"
              >
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded-lg border border-black/10">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-[10px] text-gray-500">초미세먼지</span>
                    <span className="text-xs font-bold">{airData?.pm25_value || 25} <small className="font-normal text-[10px]">µg/m³</small></span>
                  </div>
                  <div className="flex justify-between items-center px-2 border-l border-gray-200">
                    <span className="text-[10px] text-gray-500">오존</span>
                    <span className="text-xs font-bold">{airData?.o3_value || 0.091} <small className="font-normal text-[10px]">ppm</small></span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {aiGuide?.references && aiGuide.references.length > 0 && (
             <div className="flex flex-wrap gap-1">
               {aiGuide.references.map((ref, i) => (
                 <span key={i} className="text-[9px] bg-gray-100 px-2 py-0.5 rounded border border-gray-300 text-gray-600">
                   {ref}
                 </span>
               ))}
             </div>
          )}
        </div>
      </div>

      {mode === "teaser" && (
        <div className="mt-4">
          <p className="text-sm font-bold text-gray-600 mb-2">
            우리 아이에게 딱 맞는 가이드가 궁금하다면?
          </p>
          <button
            onClick={onOpenOnboarding}
            className="w-full py-4 bg-black text-white font-bold text-lg rounded-xl shadow-[4px_4px_0px_0px_rgba(100,100,100,1)] active:translate-y-1 active:shadow-none transition-all hover:bg-gray-900"
          >
            우리 아이 맞춤 결과 보기 👉
          </button>
        </div>
      )}

      {mode === "custom" && (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-white p-4 rounded-xl border-2 border-black text-sm font-bold flex flex-col items-center justify-center gap-1 shadow-sm">
            <span className="text-gray-500 text-xs">😷 마스크</span>
            <span className="text-indigo-600 text-lg">
              {aiGuide?.maskRecommendation?.includes("필수")
                ? "꼭 챙겨요!"
                : aiGuide?.maskRecommendation?.includes("권장")
                  ? "챙기면 좋아요"
                  : "필요 없어요"}
            </span>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-black text-sm font-bold flex flex-col items-center justify-center gap-1 shadow-sm">
            <span className="text-gray-500 text-xs">🏃 활동</span>
            <span className="text-orange-600 text-lg">
              {/* Mapping Logic for Activity */}
              {aiGuide?.activityRecommendation?.includes("자제") ||
              aiGuide?.activityRecommendation?.includes("X")
                ? "🏠 실내 놀이"
                : aiGuide?.activityRecommendation?.includes("주의") ||
                    aiGuide?.activityRecommendation?.includes("△")
                  ? "🙅 야외 자제"
                  : "⚽ 맘껏 뛰어놀아요"}
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
