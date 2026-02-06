"use client";

import { motion } from "framer-motion";
import { getStatusColor } from "@/lib/colorUtils";
import type { ElementType } from "react";

interface ActionStickerCardProps {
  icon: ElementType;
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
  delay = 0,
}: ActionStickerCardProps) {
  const Icon = icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="bento-card p-4 md:p-5 flex flex-col items-center text-center"
    >
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
    </motion.div>
  );
}
