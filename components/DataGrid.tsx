'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface DataGridProps {
  data: {
    pm25: number;
    pm10: number;
    o3: number;
    temperature: number;
    humidity: number;
    no2: number;
    co: number;
    so2: number;
  };
  delay?: number;
}

// Helper function to get status color based on PM2.5 levels
function getPM25Status(value: number): { color: string; label: string } {
  if (value <= 15) return { color: 'bg-green-100 border-green-400 text-green-700', label: '좋음' };
  if (value <= 35) return { color: 'bg-yellow-100 border-yellow-400 text-yellow-700', label: '보통' };
  if (value <= 75) return { color: 'bg-orange-100 border-orange-400 text-orange-700', label: '나쁨' };
  return { color: 'bg-red-100 border-red-400 text-red-700', label: '매우나쁨' };
}

// Helper function to get status color based on PM10 levels
function getPM10Status(value: number): { color: string; label: string } {
  if (value <= 30) return { color: 'bg-green-100 border-green-400 text-green-700', label: '좋음' };
  if (value <= 80) return { color: 'bg-yellow-100 border-yellow-400 text-yellow-700', label: '보통' };
  if (value <= 150) return { color: 'bg-orange-100 border-orange-400 text-orange-700', label: '나쁨' };
  return { color: 'bg-red-100 border-red-400 text-red-700', label: '매우나쁨' };
}

// Helper function to get status color based on O3 levels
function getO3Status(value: number): { color: string; label: string } {
  if (value <= 0.03) return { color: 'bg-green-100 border-green-400 text-green-700', label: '좋음' };
  if (value <= 0.09) return { color: 'bg-yellow-100 border-yellow-400 text-yellow-700', label: '보통' };
  if (value <= 0.15) return { color: 'bg-orange-100 border-orange-400 text-orange-700', label: '나쁨' };
  return { color: 'bg-red-100 border-red-400 text-red-700', label: '매우나쁨' };
}

export default function DataGrid({ data, delay = 0 }: DataGridProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const pm25Status = getPM25Status(data.pm25);
  const pm10Status = getPM10Status(data.pm10);
  const o3Status = getO3Status(data.o3);
  
  const dataItems = [
    { 
      label: '초미세먼지', 
      shortLabel: 'PM2.5',
      value: data.pm25, 
      unit: 'μg/m³', 
      icon: '🔬',
      status: pm25Status,
      isPrimary: true
    },
    { 
      label: '미세먼지', 
      shortLabel: 'PM10',
      value: data.pm10, 
      unit: 'μg/m³', 
      icon: '💨',
      status: pm10Status,
      isPrimary: true
    },
    { 
      label: '오존', 
      shortLabel: 'O₃',
      value: data.o3, 
      unit: 'ppm', 
      icon: '☀️',
      status: o3Status,
      isPrimary: true
    },
    { 
      label: '온도', 
      shortLabel: '온도',
      value: data.temperature, 
      unit: '°C', 
      icon: '🌡️',
      status: { color: 'bg-blue-50 border-blue-200 text-blue-700', label: '' },
      isPrimary: false
    },
    { 
      label: '습도', 
      shortLabel: '습도',
      value: data.humidity, 
      unit: '%', 
      icon: '💧',
      status: { color: 'bg-cyan-50 border-cyan-200 text-cyan-700', label: '' },
      isPrimary: false
    },
    { 
      label: '이산화질소', 
      shortLabel: 'NO₂',
      value: data.no2, 
      unit: 'ppm', 
      icon: '🏭',
      status: { color: 'bg-gray-50 border-gray-200 text-gray-700', label: '' },
      isPrimary: false
    },
  ];
  
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
        className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <h3 className="text-lg font-black">
            <span className="highlighter-mint">실시간 수치 보기</span>
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
        <div className="p-5 border-t-2 border-gray-100 space-y-3">
          {/* Primary Metrics (PM2.5, PM10, O3) - Larger cards with status */}
          <div className="grid grid-cols-3 gap-3">
            {dataItems.filter(item => item.isPrimary).map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: isOpen ? index * 0.08 : 0 }}
                className={`${item.status.color} p-4 rounded-[16px] border-[3px] text-center relative overflow-hidden`}
              >
                {/* Status Badge */}
                {item.status.label && (
                  <div className="absolute top-2 right-2 text-[10px] font-black px-2 py-1 bg-white/80 rounded-full">
                    {item.status.label}
                  </div>
                )}
                
                <div className="text-3xl mb-2">{item.icon}</div>
                <p className="text-xs font-bold mb-1 opacity-70">{item.shortLabel}</p>
                <p className="text-2xl font-black leading-none">
                  {item.value}
                </p>
                <p className="text-[10px] font-bold mt-1 opacity-60">{item.unit}</p>
              </motion.div>
            ))}
          </div>
          
          {/* Secondary Metrics (Temperature, Humidity, NO2) - Smaller cards */}
          <div className="grid grid-cols-3 gap-3">
            {dataItems.filter(item => !item.isPrimary).map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: isOpen ? (index + 3) * 0.08 : 0 }}
                className={`${item.status.color} p-3 rounded-[16px] border-[2px] text-center`}
              >
                <div className="text-2xl mb-1">{item.icon}</div>
                <p className="text-[10px] font-bold mb-1 opacity-70">{item.shortLabel}</p>
                <p className="text-lg font-black leading-none">
                  {item.value}
                  <span className="text-[10px] font-normal ml-1">{item.unit}</span>
                </p>
              </motion.div>
            ))}
          </div>
          
          {/* Info Note */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: isOpen ? 0.5 : 0 }}
            className="bg-gray-50 p-3 rounded-xl border-2 border-gray-200 text-center"
          >
            <p className="text-xs text-gray-600 handwriting">
              💡 색상이 진할수록 주의가 필요해요
            </p>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
