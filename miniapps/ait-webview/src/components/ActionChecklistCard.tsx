'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Check } from 'lucide-react';

interface ActionChecklistCardProps {
  actionItems: string[];
  delay?: number;
  grade?: string; // Air quality grade for theme colors
}

export default function ActionChecklistCard({
  actionItems,
  delay = 0,
  grade
}: ActionChecklistCardProps) {
  
  // Get theme color based on air quality grade
  const getThemeColor = (grade?: string) => {
    const colors: Record<string, string> = {
      GOOD: 'bg-gradient-to-br from-green-200 to-green-300',
      NORMAL: 'bg-gradient-to-br from-yellow-200 to-yellow-300',
      BAD: 'bg-gradient-to-br from-orange-200 to-orange-300',
      VERY_BAD: 'bg-gradient-to-br from-red-200 to-red-300'
    };
    return colors[grade || 'GOOD'] || 'bg-gradient-to-br from-green-200 to-green-300';
  };
  
  const getProgressBarColor = (grade?: string) => {
    const colors: Record<string, string> = {
      GOOD: 'bg-green-400',
      NORMAL: 'bg-yellow-400',
      BAD: 'bg-orange-400',
      VERY_BAD: 'bg-red-400'
    };
    return colors[grade || 'GOOD'] || 'bg-green-400';
  };
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const toggleItem = (index: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const checkedCount = actionItems.reduce(
    (acc, _, index) => (checkedItems[index] ? acc + 1 : acc),
    0
  );
  const completionRatio =
    actionItems.length > 0
      ? checkedCount / actionItems.length
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="col-span-2 bento-card p-4 md:p-6"
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-2.5">
        <span className="rounded-md bg-green-100 px-1.5 py-1 text-base">✅</span>
        <h3 className="text-lg font-black md:text-xl">아이를 위한 오늘의 액션</h3>
      </div>

      {/* Checklist Items */}
      <div className="space-y-3">
        {actionItems.length === 0 && (
          <div className="card-muted rounded-xl border-2 border-dashed border-gray-300 p-4 text-sm font-semibold text-gray-500">
            아직 추천 액션을 준비 중이에요.
          </div>
        )}
        {actionItems.map((item, index) => (
          <motion.button
            key={index}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: delay + 0.08 + index * 0.08, duration: 0.25 }}
            whileHover={{ scale: 1.005 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => toggleItem(index)}
            className={`w-full rounded-xl border-2 border-black p-3.5 md:p-4 flex items-center gap-3 transition-all duration-200 ${
              checkedItems[index]
                ? `${getThemeColor(grade)} shadow-bento-sm`
                : 'bg-white shadow-bento-sm hover:bg-gray-50'
            }`}
          >
            {/* Custom Checkbox */}
            <div className={`h-7 w-7 rounded-md border-2 border-black flex items-center justify-center transition-all duration-200 ${
              checkedItems[index] ? 'bg-black' : 'bg-white'
            }`}>
              {checkedItems[index] && (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Check size={16} strokeWidth={3} className="text-white" />
                </motion.div>
              )}
            </div>

            {/* Item Text */}
            <span className={`text-base font-bold text-left flex-1 ${
              checkedItems[index] ? 'text-gray-800' : 'text-gray-900'
            }`}>
              {item}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.5 }}
        className="mt-4 h-2 w-full overflow-hidden rounded-full border-2 border-black bg-gray-200"
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${completionRatio * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full ${getProgressBarColor(grade)}`}
        />
      </motion.div>
    </motion.div>
  );
}
