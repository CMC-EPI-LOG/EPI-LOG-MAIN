"use client";

import { useEffect, useState } from "react";
import { useUserStore } from "@/store/useUserStore";
import DecisionCard from "@/components/DecisionCard";
import OnboardingModal from "@/components/OnboardingModal";
import InstallPrompt from "@/components/InstallPrompt";
import LocationHeader from "@/components/LocationHeader";
import ShareButton from "@/components/ShareButton";
import { Settings } from "lucide-react";
import toast from "react-hot-toast";

export default function Home() {
  const { location, profile, isOnboarded, setLocation, setProfile } =
    useUserStore();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Display name for the header (e.g. "역삼1동")
  const [displayRegion, setDisplayRegion] = useState(location.stationName);

  const fetchData = async (
    currentLocation: typeof location,
    currentProfile: typeof profile,
  ) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationName: currentLocation.stationName, // Used for AirKorea lookup (Gu)
          profile: currentProfile,
        }),
      });

      if (!res.ok) throw new Error("Failed to fetch");

      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error(error);
      toast.error("데이터를 불러오지 못했어요 😢");
    } finally {
      setIsLoading(false);
    }
  };

  const updateLocationByCoords = async (lat: number, lng: number) => {
    try {
      const res = await fetch("/api/reverse-geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });

      if (!res.ok) throw new Error("Geocoding Failed");

      const data = await res.json();
      const { regionName, stationCandidate } = data; // regionName=Dong, stationCandidate=Gu

      const newLocation = {
        lat,
        lng,
        stationName: stationCandidate, // Store Gu for mapping
      };

      setLocation(newLocation);
      setDisplayRegion(regionName); // Display Dong

      toast.success(`현재 위치: ${regionName}`);
      fetchData(newLocation, profile);
    } catch (error) {
      console.error("Reverse Geocode Error:", error);
      toast.error(
        "위치 정보를 불러올 수 없어 '서울 중구' 기준으로 보여드려요 🏢",
      );
      // Fallback
      const fallbackLocation = {
        lat: 37.5635,
        lng: 126.9975,
        stationName: "중구",
      };
      setLocation(fallbackLocation);
      setDisplayRegion("서울 중구");
      fetchData(fallbackLocation, profile);
    }
  };

  useEffect(() => {
    // 1. Geolocation Logic on Mount
    if (!navigator.geolocation) {
      toast.error("위치 서비스를 사용할 수 없어요");
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
        toast.error(
          "위치 정보를 불러올 수 없어 '서울 중구' 기준으로 보여드려요 🏢",
        );
        const fallbackLocation = {
          lat: 37.5635,
          lng: 126.9975,
          stationName: "중구",
        };
        setLocation(fallbackLocation);
        setDisplayRegion("서울 중구");
        fetchData(fallbackLocation, profile);
      },
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
        <header className="relative flex items-center justify-between w-full h-14 mb-2">
          {/* Left: Location */}
          <div className="z-30">
            <LocationHeader
              currentLocation={displayRegion}
              onLocationSelect={handleLocationSelect}
            />
          </div>

          {/* Center: Logo */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-center pointer-events-none">
            <div className="text-2xl tracking-tighter inline-block">
              에피로그
            </div>
          </div>

          {/* Right: Settings */}
          <div className="z-20 w-[60px] flex justify-end">
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-black p-2 rounded-full"
              aria-label={isOnboarded ? "설정 변경" : "맞춤 설정 시작"}
            >
              <Settings size={24} />
            </button>
          </div>
        </header>

        <DecisionCard
          mode={isOnboarded ? "custom" : "teaser"}
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
              data.aiGuide?.activityRecommendation?.includes("자제") ||
              data.aiGuide?.activityRecommendation?.includes("X")
                ? "실내 놀이"
                : "신나는 외출" // Simple mapping for share text
            }
          />
        )}

        <p className="text-center text-xs text-gray-400 font-medium mt-4">
          본 서비스는 의료적 조언이 아니며 정보 제공을 목적으로 합니다.
          <br />
          증상이 있다면 반드시 전문 의료진과 상의하세요.
        </p>
      </div>

      <OnboardingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleProfileSubmit}
        currentProfile={profile}
      />

      {/* PWA Install Prompt - Only show if not on onboarding/loading potentially, but component handles its own logic */}
      {!isLoading && <InstallPrompt />}
    </main>
  );
}
