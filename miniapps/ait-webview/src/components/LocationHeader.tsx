'use client';

import { Suspense, lazy, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Modal } from '@toss/tds-mobile';
import { normalizeLocationSelection } from '@/lib/locationSelection';

const DaumPostcode = lazy(() => import('react-daum-postcode'));

interface LocationHeaderProps {
  currentLocation: string; // e.g. "역삼동" or "강남구"
  onLocationSelect: (address: string, stationName: string) => void;
}

interface DaumPostcodeData {
  address: string;
  bname: string;
  sigungu: string;
  sido?: string;
}

export default function LocationHeader({ currentLocation, onLocationSelect }: LocationHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const portalContainer = useMemo(
    () => (typeof document !== 'undefined' ? document.body : null),
    [],
  );

  const handleComplete = (data: DaumPostcodeData) => {
    const { displayAddress, stationQuery } = normalizeLocationSelection(data);

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

      <Modal
        open={isSearchOpen}
        portalContainer={portalContainer}
        onOpenChange={(nextOpen) => setIsSearchOpen(nextOpen)}
      >
        <Modal.Overlay
          onClick={() => setIsSearchOpen(false)}
          className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        />
        <Modal.Content
          className="relative z-[10001] w-[calc(100vw_-_2rem)] max-w-md overflow-hidden rounded-xl border-2 border-black bg-white shadow-2xl"
          style={{ backgroundColor: '#fff', isolation: 'isolate', opacity: 1 }}
          aria-label="우리 동네 찾기"
          data-testid="location-modal"
        >
          <div className="flex items-center justify-between border-b-2 border-black bg-pastel-blue p-4">
            <h3 className="text-lg font-black">📍 우리 동네 찾기</h3>
            <button 
              onClick={() => setIsSearchOpen(false)}
              className="text-2xl leading-none font-bold hover:text-red-500"
              aria-label="위치 검색 닫기"
              data-testid="location-close"
            >
              &times;
            </button>
          </div>
          <div className="h-[400px] w-full">
            <Suspense fallback={<div className="p-4 text-sm font-bold">주소 검색 불러오는 중...</div>}>
              <DaumPostcode 
                onComplete={handleComplete} 
                style={{ height: '100%' }}
                autoClose={false}
              />
            </Suspense>
          </div>
        </Modal.Content>
      </Modal>
    </>
  );
}
