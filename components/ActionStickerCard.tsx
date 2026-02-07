"use client";

import { motion } from "framer-motion";
import { getStatusColor } from "@/lib/colorUtils";
import type { ElementType } from "react";

interface ActionStickerCardProps {
  icon: ElementType;
  label: string;
  statusText: string;
  isPositive: boolean;
  fixedBadgeText?: string;
  delay?: number;
}

export default function ActionStickerCard({
  icon,
  label,
  statusText,
  isPositive,
  fixedBadgeText,
  delay = 0,
}: ActionStickerCardProps) {
  const Icon = icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="relative bento-card flex min-h-[172px] flex-col items-center justify-center p-4 text-center md:min-h-[180px] md:p-5"
    >
      {fixedBadgeText && (
        <div className="absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-extrabold text-red-700 md:top-4">
          {fixedBadgeText}
        </div>
      )}
      <div className="flex w-full flex-col items-center text-center pt-2">
        <div className="mb-2 rounded-full bg-gray-50 p-2">
          <Icon className="h-7 w-7 text-black" strokeWidth={2} />
        </div>

        {/* Label */}
        <p className="mb-1 text-xs font-bold text-gray-500">{label}</p>

        {/* Status - Color-coded */}
        <p
          className={`text-xl font-black md:text-2xl ${getStatusColor(isPositive)}`}
        >
          {statusText}
        </p>
      </div>
    </motion.div>
  );
}
