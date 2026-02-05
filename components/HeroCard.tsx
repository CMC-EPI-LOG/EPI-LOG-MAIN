'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { getGradeBadgeColor, getGradeText } from '@/lib/colorUtils';

interface HeroCardProps {
  character: string;
  decisionText: string;
  grade: string;
  profileBadge: string;
  isLoading?: boolean;
  isError?: boolean;
}

export default function HeroCard({
  character,
  decisionText,
  grade,
  profileBadge,
  isLoading = false,
  isError = false
}: HeroCardProps) {
  
  // Error state
  if (isError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="col-span-2 h-[60vh] bento-card flex flex-col items-center justify-center p-8 text-center"
      >
        <div className="text-8xl mb-4">😎</div>
        <h2 className="text-3xl font-black mb-2">AI 선생님이 쉬고 있어요</h2>
        <p className="handwriting text-gray-600 text-lg">잠시 후 다시 시도해주세요</p>
      </motion.div>
    );
  }
  
  // Loading state
  if (isLoading) {
    return (
      <div className="col-span-2 h-[60vh] bento-card flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-bold">정보를 가져오는 중...</p>
        </div>
      </div>
    );
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="col-span-2 h-[60vh] bento-card relative flex flex-col items-center justify-between p-8"
    >
      {/* Profile Badge - Top Left, Overlapping */}
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="absolute -top-3 -left-3 bg-white px-4 py-2 rounded-full border-[3px] border-black shadow-bento-sm text-sm font-bold z-10"
      >
        {profileBadge}
      </motion.div>
      
      {/* Grade Badge - Top Right */}
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className={`absolute top-6 right-6 ${getGradeBadgeColor(grade)} px-6 py-3 rounded-full border-[3px] border-black shadow-bento-sm font-black text-lg`}
      >
        {getGradeText(grade)}
      </motion.div>
      
      {/* Character - Center, Large */}
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
        className="flex-1 flex items-center justify-center"
      >
        <div className="relative w-64 h-64 character-glow">
          <Image
            src={character}
            alt="Air quality character"
            fill
            className="object-contain relative z-10"
            priority
          />
        </div>
      </motion.div>
      
      {/* Decision Text - Bottom, Extra Bold */}
      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-4xl md:text-5xl font-black text-center text-extra-bold leading-tight"
      >
        {decisionText}
      </motion.h1>
    </motion.div>
  );
}
