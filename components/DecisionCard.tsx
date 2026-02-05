"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserProfile } from "@/store/useUserStore";
import { getCharacterPath, getGradeBackgroundColor } from "@/lib/characterUtils";
import Image from "next/image";

interface AirData {
  grade?: string; // 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD'
  value?: number;
  stationName?: string;
  pm25_value?: number;
  pm10_value?: number;
  o3_value?: number;
  no2_value?: number;
  co_value?: number;
  so2_value?: number;
  temp?: number;
  humidity?: number;
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
  const [showDetail, setShowDetail] = useState(true);

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
  
  // Get character path and background color using utility functions
  const characterPath = getCharacterPath(airData?.grade, profile?.ageGroup);
  const bgColor = getGradeBackgroundColor(airData?.grade);

  // Check for infant age group
  const isInfant = profile?.ageGroup === "infant";

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0, y: 50, rotate: -5 }}
      animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
      transition={{ 
        type: "spring", 
        stiffness: 260, 
        damping: 20,
        duration: 0.6 
      }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className={`w-full max-w-md ${bgColor} p-6 rounded-2xl brutal-border relative flex flex-col gap-4 text-center transition-colors duration-500`}
    >
      {/* Age Group & Condition Badge */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="absolute -top-4 -left-4 bg-white px-4 py-2 rounded-full brutal-border-sm text-sm font-bold"
      >
        {profile?.ageGroup === "infant" ? "👶 영아(0~2세)" : 
         profile?.ageGroup === "toddler" ? "🧒 유아(3~6세)" :
         profile?.ageGroup === "elementary_low" ? "🎒 초등 저학년" :
         profile?.ageGroup === "elementary_high" ? "🏫 초등 고학년" : "🧑 청소년/성인"} 
        {profile?.condition === "asthma" ? " · 천식" : 
         profile?.condition === "rhinitis" ? " · 비염" : 
         profile?.condition === "atopy" ? " · 아토피" : ""}
      </motion.div>

      <motion.div 
        initial={{ x: 100, opacity: 0, rotate: 0 }}
        animate={{ x: 0, opacity: 1, rotate: 12 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
        whileHover={{ rotate: -5, scale: 1.1 }}
        className="absolute -top-4 -right-4 bg-yellow-300 px-5 py-2 rounded-full brutal-border-sm text-base font-bold"
      >
        {mode === "teaser" ? (
          "우리 동네"
        ) : (
          <>
            {profile?.ageGroup === "infant" ? "👶 " : 
             profile?.ageGroup === "toddler" ? "🧒 " :
             profile?.ageGroup === "elementary_low" ? "🎒 " :
             profile?.ageGroup === "elementary_high" ? "🏫 " : "🧑 "}
            {profile?.nickname || "우리 아이"} 맞춤
          </>
        )}
      </motion.div>

      {/* Character Display Section */}
      <motion.div
        initial={{ scale: 0, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
        className="relative w-full flex justify-center items-center my-4"
      >
        
        {/* Character Image with Glow Effect */}
        <div className="relative w-48 h-48 character-glow">
          <Image
            src={characterPath}
            alt="캐릭터"
            width={192}
            height={192}
            className="w-full h-full object-contain relative z-10"
            priority
          />
        </div>
      </motion.div>

      {/* Infant Warning Badge */}
      {isInfant && (
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 15 }}
          className="bg-red-600 text-white text-base font-black py-3 rounded-lg brutal-border-sm animate-bounce"
        >
          ※ 주의: 마스크 착용 금지 (질식 위험)
        </motion.div>
      )}

      <motion.h1 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
        className="text-4xl text-extra-bold mt-2 whitespace-pre-wrap leading-tight"
      >
        <span className="crayon-underline">
          {aiGuide?.summary || "오늘 실외 활동은 짧게!"}
        </span>
      </motion.h1>

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="bg-white/90 p-6 rounded-xl brutal-border text-left space-y-4"
      >
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="space-y-2"
        >
          <h3 className="font-bold text-base text-gray-800 flex items-center gap-1">
            <span className="w-2 h-2 bg-black rounded-full"></span> <span className="highlighter-yellow">왜 그런가요?</span>
          </h3>
          <p className="text-gray-900 leading-relaxed font-bold text-lg handwriting">
            {aiGuide?.detail || "데이터를 분석 중입니다..."}
          </p>
        </motion.div>

        {/* Action Items with Checkboxes */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="space-y-3"
        >
          <h3 className="font-bold text-base text-gray-800 flex items-center gap-1">
            <span className="w-2 h-2 bg-black rounded-full"></span> <span className="highlighter-mint">아이를 위해 지금 결정하세요</span>
          </h3>
          {aiGuide?.actionItems && aiGuide.actionItems.length > 0 ? (
            <div className="space-y-2">
              {aiGuide.actionItems.map((item, idx) => (
                <motion.label
                  key={idx}
                  initial={{ x: -30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.7 + idx * 0.1, type: "spring", stiffness: 200 }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-white p-3 rounded-lg brutal-border-sm flex gap-3 items-center cursor-pointer hover:bg-yellow-50 btn-press"
                >
                  <input type="checkbox" className="w-6 h-6 accent-black border-2 border-black rounded" />
                  <span className="text-gray-900 text-base font-bold">
                    {item}
                  </span>
                </motion.label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">행동 지침을 불러오는 중입니다.</p>
          )}
        </motion.div>

        {/* Scientific Basis Section */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="pt-4 mt-2 border-t-2 border-black border-dashed"
        >
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] text-gray-500 leading-tight flex-1">
              ⓘ 이 결정은 소아 폐 발달 관련 논문(Gauderman et al., 2015 등)을 기반으로 환경 변수(온도, 습도)를 보정하여 산출되었습니다.
            </p>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowDetail(!showDetail)}
              className="text-[10px] font-bold text-black underline underline-offset-2 ml-2 whitespace-nowrap"
            >
              {showDetail ? "수치 접기" : "실시간 수치"}
            </motion.button>
          </div>

          <AnimatePresence>
            {showDetail && (
              <motion.div
                initial={{ height: 0, opacity: 0, scale: 0.95 }}
                animate={{ height: "auto", opacity: 1, scale: 1 }}
                exit={{ height: 0, opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="overflow-hidden mb-2"
              >
                <motion.div 
                  initial={{ y: -10 }}
                  animate={{ y: 0 }}
                  className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-lg border border-black/10"
                >
                  {/* PM2.5 */}
                  <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex justify-between items-center px-2 py-1"
                  >
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>💨</span> 초미세먼지
                    </span>
                    <span className="text-xs font-bold">{airData?.pm25_value || 25} <small className="font-normal text-[10px]">µg/m³</small></span>
                  </motion.div>

                  {/* PM10 */}
                  <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="flex justify-between items-center px-2 py-1 border-l border-gray-200"
                  >
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>🌫️</span> 미세먼지
                    </span>
                    <span className="text-xs font-bold">{airData?.pm10_value || 50} <small className="font-normal text-[10px]">µg/m³</small></span>
                  </motion.div>

                  {/* O3 */}
                  <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex justify-between items-center px-2 py-1 border-t border-gray-200"
                  >
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>☀️</span> 오존
                    </span>
                    <span className="text-xs font-bold">{airData?.o3_value || 0.05} <small className="font-normal text-[10px]">ppm</small></span>
                  </motion.div>

                  {/* NO2 */}
                  <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="flex justify-between items-center px-2 py-1 border-l border-t border-gray-200"
                  >
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>🚗</span> 이산화질소
                    </span>
                    <span className="text-xs font-bold">{airData?.no2_value || 0.03} <small className="font-normal text-[10px]">ppm</small></span>
                  </motion.div>

                  {/* Temperature */}
                  <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex justify-between items-center px-2 py-1 border-t border-gray-200 bg-blue-50/50"
                  >
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>🌡️</span> 온도
                    </span>
                    <span className="text-xs font-bold text-blue-600">{airData?.temp || 22} <small className="font-normal text-[10px]">°C</small></span>
                  </motion.div>

                  {/* Humidity */}
                  <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.35 }}
                    className="flex justify-between items-center px-2 py-1 border-l border-t border-gray-200 bg-cyan-50/50"
                  >
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>💧</span> 습도
                    </span>
                    <span className="text-xs font-bold text-cyan-600">{airData?.humidity || 45} <small className="font-normal text-[10px]">%</small></span>
                  </motion.div>

                  {/* CO */}
                  <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex justify-between items-center px-2 py-1 border-t border-gray-200"
                  >
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>🏭</span> 일산화탄소
                    </span>
                    <span className="text-xs font-bold">{airData?.co_value || 0.5} <small className="font-normal text-[10px]">ppm</small></span>
                  </motion.div>

                  {/* SO2 */}
                  <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.45 }}
                    className="flex justify-between items-center px-2 py-1 border-l border-t border-gray-200"
                  >
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>⚗️</span> 아황산가스
                    </span>
                    <span className="text-xs font-bold">{airData?.so2_value || 0.003} <small className="font-normal text-[10px]">ppm</small></span>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {aiGuide?.references && aiGuide.references.length > 0 && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 1.2 }}
               className="flex flex-wrap gap-1"
             >
               {aiGuide.references.map((ref, i) => (
                 <motion.span 
                   key={i}
                   initial={{ scale: 0 }}
                   animate={{ scale: 1 }}
                   transition={{ delay: 1.3 + i * 0.05, type: "spring" }}
                   className="text-[9px] bg-gray-100 px-2 py-0.5 rounded border border-gray-300 text-gray-600"
                 >
                   {ref}
                 </motion.span>
               ))}
             </motion.div>
          )}
        </motion.div>
      </motion.div>

      {mode === "teaser" && (
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="mt-4"
        >
          <p className="text-sm font-bold text-gray-600 mb-2">
            우리 아이에게 딱 맞는 가이드가 궁금하다면?
          </p>
          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97, y: 1 }}
            onClick={onOpenOnboarding}
            className="w-full py-4 bg-black text-white font-bold text-lg rounded-xl shadow-[4px_4px_0px_0px_rgba(100,100,100,1)] active:translate-y-1 active:shadow-none transition-all hover:bg-gray-900"
          >
            우리 아이 맞춤 결과 보기 👉
          </motion.button>
        </motion.div>
      )}

      {mode === "custom" && (
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="grid grid-cols-2 gap-3 mt-2"
        >
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.5, type: "spring", stiffness: 200 }}
            whileHover={{ scale: 1.05, rotate: 2 }}
            className="bg-white p-4 rounded-xl brutal-border-sm text-sm font-bold flex flex-col items-center justify-center gap-1 btn-press"
          >
            <span className="text-gray-500 text-xs">😷 마스크</span>
            <span className="text-indigo-600 text-lg">
              {aiGuide?.maskRecommendation?.includes("필수")
                ? "꼭 챙겨요!"
                : aiGuide?.maskRecommendation?.includes("권장")
                  ? "챙기면 좋아요"
                  : "필요 없어요"}
            </span>
          </motion.div>
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.6, type: "spring", stiffness: 200 }}
            whileHover={{ scale: 1.05, rotate: -2 }}
            className="bg-white p-4 rounded-xl brutal-border-sm text-sm font-bold flex flex-col items-center justify-center gap-1 btn-press"
          >
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
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
