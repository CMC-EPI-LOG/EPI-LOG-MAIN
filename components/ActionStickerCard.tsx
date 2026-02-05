'use client';

import { motion } from 'framer-motion';
import { getStatusColor } from '@/lib/colorUtils';

interface ActionStickerCardProps {
  icon: string;
  label: string;
  statusText: string;
  isPositive: boolean;
  delay?: number;
}

export default function ActionStickerCard({
  icon,
  label,
  statusText,
  isPositive,
  delay = 0
}: ActionStickerCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ scale: 1.05 }}
      className="bento-card p-6 flex flex-col items-center text-center cursor-pointer btn-press"
    >
      {/* Icon - Large */}
      <div className="text-5xl mb-3">{icon}</div>
      
      {/* Label */}
      <p className="text-sm font-bold text-gray-600 mb-2">{label}</p>
      
      {/* Status - Color-coded */}
      <p className={`text-2xl font-black ${getStatusColor(isPositive)}`}>
        {statusText}
      </p>
    </motion.div>
  );
}
