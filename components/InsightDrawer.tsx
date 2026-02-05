'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface InsightDrawerProps {
  reasoning: string;
  actionTip: string;
  delay?: number;
}

export default function InsightDrawer({
  reasoning,
  actionTip,
  delay = 0
}: InsightDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="col-span-2 bento-card overflow-hidden"
    >
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🤔</span>
          <h3 className="text-xl font-black">
            <span className="highlighter-yellow">왜 그런가요?</span>
          </h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ChevronDown size={24} strokeWidth={3} />
        </motion.div>
      </button>
      
      {/* Content */}
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0
        }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="px-6 pb-6 space-y-4 border-t-2 border-gray-100 pt-4">
          {/* Reasoning */}
          <div>
            <p className="handwriting text-base text-gray-700 leading-relaxed">
              {reasoning}
            </p>
          </div>
          
          {/* Action Tip */}
          {actionTip && (
            <div className="bg-yellow-50 p-4 rounded-xl border-2 border-yellow-200">
              <p className="text-sm font-bold mb-1">
                <span className="highlighter-mint">아이를 위해 지금 결정하세요</span>
              </p>
              <p className="handwriting text-sm text-gray-700">
                {actionTip}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
