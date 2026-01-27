'use client';

import { useEffect, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';

const DaumPostcode = dynamic(() => import('react-daum-postcode'), { ssr: false });

interface LocationHeaderProps {
  currentLocation: string; // e.g. "역삼동" or "강남구"
  onLocationSelect: (address: string, stationName: string) => void;
}

export default function LocationHeader({ currentLocation, onLocationSelect }: LocationHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalRoot(document.body);
    }
  }, []);

  const handleComplete = (data: any) => {
    // data.bname -> '역삼동' (Legal Dong)
    // data.sigungu -> '강남구'
    // We want to use 'bname' (Dong) for display and 'sigungu' (Gu) for station matching if possible.
    
    let fullAddress = data.address;
    let extraAddress = '';

    if (data.addressType === 'R') {
      if (data.bname !== '') {
        extraAddress += data.bname;
      }
      if (data.buildingName !== '') {
        extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
      }
      fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
    }
    
    // We prefer 'sigungu' for station mapping usually, and 'bname' for display.
    // If 'sigungu' is empty (rare), fallback to bname.
    // Let's pass: Display: bname, Station: sigungu
    
    onLocationSelect(data.bname || data.sigungu, data.sigungu || data.bname);
    setIsSearchOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <div 
          className="flex items-center gap-1 cursor-pointer hover:opacity-70 transition-opacity" 
          onClick={() => {
            console.log('Location Clicked!');
            setIsSearchOpen(true);
          }}
        >
          <MapPin size={20} className="text-black fill-black/10" />
          <span className="text-xl font-black underline decoration-4 decoration-pastel-yellow underline-offset-4">
            {currentLocation}
          </span>
        </div>
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
                 >
                   <div className="p-4 flex justify-between items-center bg-pastel-blue border-b-2 border-black">
                     <h3 className="font-black text-lg">📍 우리 동네 찾기</h3>
                     <button 
                       onClick={() => setIsSearchOpen(false)}
                       className="font-bold text-2xl leading-none hover:text-red-500"
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
