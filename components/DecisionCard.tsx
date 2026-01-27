'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '@/store/useUserStore';

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
  // Add fields
}

interface DecisionCardProps {
  mode: 'teaser' | 'custom';
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
  const [showReferences, setShowReferences] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const texts = [
      "대기질 정보를 수신 중... 📡",
      "관련 의학 논문 검색 중... 📚",
      "AI가 정밀 분석 중... 🤖"
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

  const stationName = airData?.stationName || '지금 여기';
  const getGradeColor = (grade?: string) => {
    switch (grade) {
      case 'GOOD': return 'bg-pastel-blue';
      case 'NORMAL': return 'bg-pastel-green';
      case 'BAD': return 'bg-pastel-yellow';
      case 'VERY_BAD': return 'bg-pastel-pink';
      default: return 'bg-white';
    }
  };

  const bgColor = getGradeColor(airData?.grade);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      className={`w-full max-w-md ${bgColor} p-6 rounded-2xl brutal-border relative flex flex-col gap-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center`}
    >
      <div className="absolute -top-4 -right-4 bg-yellow-300 px-4 py-2 rounded-full border-2 border-black font-bold rotate-12 shadow-[2px_2px_0px_0px_black]">
        {mode === 'teaser' ? '우리 동네' : ` ${profile?.nickname} 맞춤`}
      </div>

      <h1 className="text-2xl font-black mt-4 whitespace-pre-wrap leading-tight">
        {mode === 'teaser' 
          ? `📍 ${stationName}\n아이들은 어떻게 해야 할까요?`
          : `📍 ${stationName}\n${profile?.nickname}님은 이렇게!`}
      </h1>

      <div className="bg-white/80 p-6 rounded-xl border-2 border-black text-left space-y-2">
        <h3 className="font-bold text-lg">📢 AI의 한마디</h3>
        <p className="text-gray-900 leading-loose font-medium whitespace-pre-line text-[1.05rem]">
          {aiGuide?.summary || "데이터를 불러오는 중..."}
        </p>
        
        {aiGuide?.detail && (
          <div className="pt-2">
            <button
               onClick={() => setShowDetail(!showDetail)}
               className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-1 transition-colors"
            >
              {showDetail ? '접기 ▲' : '자세히 보기 ▼'}
            </button>
            <AnimatePresence>
              {showDetail && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-sm text-gray-700 mt-2 leading-relaxed whitespace-pre-wrap border-t border-gray-200 pt-2">
                    {aiGuide.detail}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {mode === 'teaser' && (
        <div className="mt-4">
          <p className="text-sm font-bold text-gray-600 mb-2">우리 아이에게 딱 맞는 가이드가 궁금하다면?</p>
          <button
            onClick={onOpenOnboarding}
            className="w-full py-4 bg-black text-white font-bold text-lg rounded-xl shadow-[4px_4px_0px_0px_rgba(100,100,100,1)] active:translate-y-1 active:shadow-none transition-all hover:bg-gray-900"
          >
            우리 아이 맞춤 결과 보기 👉
          </button>
        </div>
      )}

      {mode === 'custom' && (
         <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="bg-white p-4 rounded-xl border-2 border-black text-sm font-bold flex flex-col items-center justify-center gap-1 shadow-sm">
               <span className="text-gray-500 text-xs">😷 마스크</span>
               <span className="text-indigo-600 text-lg">
                 {aiGuide?.maskRecommendation?.includes('필수') ? '꼭 챙겨요!' : 
                  aiGuide?.maskRecommendation?.includes('권장') ? '챙기면 좋아요' : 
                  '필요 없어요'}
               </span>
            </div>
            <div className="bg-white p-4 rounded-xl border-2 border-black text-sm font-bold flex flex-col items-center justify-center gap-1 shadow-sm">
               <span className="text-gray-500 text-xs">🏃 활동</span>
               <span className="text-orange-600 text-lg">
                 {/* Mapping Logic for Activity */}
                 {(aiGuide?.activityRecommendation?.includes('자제') || aiGuide?.activityRecommendation?.includes('X')) 
                    ? '🏠 실내 놀이' 
                    : (aiGuide?.activityRecommendation?.includes('주의') || aiGuide?.activityRecommendation?.includes('△')) 
                      ? '🙅 야외 자제' 
                      : '⚽ 맘껏 뛰어놀아요'}
               </span>
            </div>
         </div>

      )}

      {aiGuide?.references && aiGuide.references.length > 0 && (
        <div className="w-full mt-4">
            <button 
                onClick={() => setShowReferences(!showReferences)}
                className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 mx-auto font-bold mb-2 transition-colors"
                aria-label="Toggle references"
            >
                {showReferences ? '▲' : '▼'} 📚 근거 자료 보기
            </button>
            <AnimatePresence>
                {showReferences && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-gray-50 rounded-lg text-left border border-gray-200"
                    >
                        <ul className="p-3 text-xs text-gray-600 space-y-1 list-disc list-inside">
                            {aiGuide.references.map((ref, i) => (
                                <li key={i} className="leading-tight break-words">{ref}</li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
