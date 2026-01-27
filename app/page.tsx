'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/store/useUserStore';
import DecisionCard from '@/components/DecisionCard';
import OnboardingModal from '@/components/OnboardingModal';
import InstallPrompt from '@/components/InstallPrompt';
import LocationHeader from '@/components/LocationHeader';
import ShareButton from '@/components/ShareButton';
import toast from 'react-hot-toast';

export default function Home() {
  const { location, profile, isOnboarded, setLocation, setProfile } = useUserStore();
  const [data, setData] = useState<any>(null); 
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Display name for the header (e.g. "역삼1동")
  const [displayRegion, setDisplayRegion] = useState(location.stationName); 

  const fetchData = async (currentLocation: typeof location, currentProfile: typeof profile) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationName: currentLocation.stationName, // Used for AirKorea lookup (Gu)
          profile: currentProfile,
        }),
      });
      
      if (!res.ok) throw new Error('Failed to fetch');
      
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error(error);
      toast.error('데이터를 불러오지 못했어요 😢');
    } finally {
      setIsLoading(false);
    }
  };

  const updateLocationByCoords = async (lat: number, lng: number) => {
    try {
      const res = await fetch('/api/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });

      if (!res.ok) throw new Error('Geocoding Failed');

      const data = await res.json();
      const { regionName, stationCandidate } = data; // regionName=Dong, stationCandidate=Gu
      
      const newLocation = { 
        lat, 
        lng, 
        stationName: stationCandidate // Store Gu for mapping
      };

      setLocation(newLocation);
      setDisplayRegion(regionName); // Display Dong
      
      toast.success(`현재 위치: ${regionName}`);
      fetchData(newLocation, profile);

    } catch (error) {
      console.error('Reverse Geocode Error:', error);
      toast.error("위치 정보를 불러올 수 없어 '서울 중구' 기준으로 보여드려요 🏢");
      // Fallback
      fetchData(location, profile);
    }
  };

  useEffect(() => {
    // 1. Geolocation Logic on Mount
    if (!navigator.geolocation) {
      toast.error('위치 서비스를 사용할 수 없어요');
      fetchData(location, profile);
      return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          updateLocationByCoords(latitude, longitude);
        },
        (error) => {
          console.error("Location permission denied or error:", error);
          toast.error("위치 정보를 불러올 수 없어 '서울 중구' 기준으로 보여드려요 🏢");
          fetchData(location, profile);
        }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const handleProfileSubmit = (newProfile: any) => {
    setProfile(newProfile);
    setIsModalOpen(false);
    fetchData(location, newProfile);
  };

  const handleLocationSelect = (address: string, stationName: string) => {
    // address comes from Postcode (e.g. Yeoksam-dong)
    // stationName comes from Postcode (e.g. Gangnam-gu)
    setDisplayRegion(address);
    const newLocation = { ...location, stationName };
    setLocation(newLocation);
    
    toast.success(`위치가 '${address}'(으)로 변경되었어요!`);
    fetchData(newLocation, profile);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-white relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-50px] left-[-50px] w-40 h-40 bg-pastel-yellow rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute bottom-[-50px] right-[-50px] w-64 h-64 bg-pastel-blue rounded-full blur-3xl opacity-50 pointer-events-none" />

      <div className="z-10 w-full max-w-md flex flex-col gap-6">
        <header className="flex flex-col items-start mb-2 gap-2">
           {/* Location Header */}
           <LocationHeader 
             currentLocation={displayRegion} 
             onLocationSelect={handleLocationSelect}
           />
           
           <div className="flex justify-between w-full items-center">
             <div className="text-xl font-black italic tracking-tighter border-b-4 border-black inline-block">
               EPI-LOG
             </div>
             {isOnboarded && (
               <button 
                 onClick={() => setIsModalOpen(true)}
                 className="text-xs font-bold bg-black text-white px-3 py-1 rounded-full"
               >
                 설정 변경
               </button>
             )}
           </div>
        </header>

        <DecisionCard 
          mode={isOnboarded ? 'custom' : 'teaser'}
          profile={profile}
          airData={data?.airQuality}
          aiGuide={data?.aiGuide}
          onOpenOnboarding={() => setIsModalOpen(true)}
          isLoading={isLoading}
        />

        {/* Share Button */}
        {data && (
           <ShareButton 
             nickname={profile?.nickname}
             region={displayRegion}
             action={
               (data.aiGuide?.activityRecommendation?.includes('자제') || data.aiGuide?.activityRecommendation?.includes('X')) 
                 ? '실내 놀이' 
                 : '신나는 외출' // Simple mapping for share text
             }
           />
        )}

        <p className="text-center text-xs text-gray-400 font-medium mt-4">
           Data provided by AirKorea & EPI-LOG AI
        </p>
      </div>

      <OnboardingModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleProfileSubmit}
      />

      {/* PWA Install Prompt - Only show if not on onboarding/loading potentially, but component handles its own logic */}
      {!isLoading && <InstallPrompt />}
    </main>
  );
}
