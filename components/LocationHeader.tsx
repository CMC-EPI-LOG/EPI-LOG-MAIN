'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';

const DaumPostcode = dynamic(() => import('react-daum-postcode'), { ssr: false });

interface LocationHeaderProps {
  currentLocation: string; // e.g. "역삼동" or "강남구"
  onLocationSelect: (address: string, stationName: string) => void;
}

interface DaumPostcodeData {
  address: string;
  bname: string;
  sigungu: string;
}

export default function LocationHeader({ currentLocation, onLocationSelect }: LocationHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const portalRoot = typeof document !== 'undefined' ? document.body : null;

  const handleComplete = (data: DaumPostcodeData) => {
    const displayAddress = data.bname || data.sigungu || data.address;
    const stationQuery = [data.sigungu, data.bname].filter(Boolean).join(' ').trim();

    onLocationSelect(displayAddress, stationQuery || displayAddress);
    setIsSearchOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-1 py-0.5 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70"
          onClick={() => setIsSearchOpen(true)}
          aria-label="위치 검색 열기"
          aria-haspopup="dialog"
          data-testid="location-trigger"
        >
          <MapPin size={20} className="text-black fill-black/10" />
          <span className="text-xl font-black underline decoration-4 decoration-pastel-yellow underline-offset-4">
            {currentLocation}
          </span>
        </button>
      </div>

      {portalRoot &&
        // Use Portal to break out of the header's stacking context
        createPortal(
          <AnimatePresence>
            {isSearchOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                 <motion.div
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                   className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden border-2 border-black relative"
                   role="dialog"
                   aria-modal="true"
                   aria-label="우리 동네 찾기"
                   data-testid="location-modal"
                 >
                   <div className="p-4 flex justify-between items-center bg-pastel-blue border-b-2 border-black">
                     <h3 className="font-black text-lg">📍 우리 동네 찾기</h3>
                     <button 
                       onClick={() => setIsSearchOpen(false)}
                       className="font-bold text-2xl leading-none hover:text-red-500"
                       aria-label="위치 검색 닫기"
                       data-testid="location-close"
                     >
                       &times;
                     </button>
                   </div>
                   <div className="h-[400px] w-full">
                     <DaumPostcode 
                       onComplete={handleComplete} 
                       style={{ height: '100%' }}
                       autoClose={false}
                     />
                   </div>
                 </motion.div>
              </div>
            )}
          </AnimatePresence>,
          portalRoot
        )}
    </>
  );
}
