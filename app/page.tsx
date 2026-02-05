"use client";

import { useEffect, useState } from "react";
import { useUserStore } from "@/store/useUserStore";
import HeroCard from "@/components/HeroCard";
import ActionStickerCard from "@/components/ActionStickerCard";
import InsightDrawer from "@/components/InsightDrawer";
import DataGrid from "@/components/DataGrid";
import OnboardingModal from "@/components/OnboardingModal";
import InstallPrompt from "@/components/InstallPrompt";
import LocationHeader from "@/components/LocationHeader";
import ShareButton from "@/components/ShareButton";
import { Settings } from "lucide-react";
import toast from "react-hot-toast";
import { getCharacterPath } from "@/lib/characterUtils";
import { getBackgroundColor } from "@/lib/colorUtils";

export default function Home() {
  const { location, profile, isOnboarded, setLocation, setProfile } =
    useUserStore();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
          stationName: currentLocation.stationName,
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
      const { regionName, stationCandidate } = data;

      const newLocation = {
        lat,
        lng,
        stationName: stationCandidate,
      };

      setLocation(newLocation);
      setDisplayRegion(regionName);

      toast.success(`현재 위치: ${regionName}`);
      fetchData(newLocation, profile);
    } catch (error) {
      console.error("Reverse Geocode Error:", error);
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
    }
  };

  useEffect(() => {
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
    setDisplayRegion(address);
    const newLocation = { ...location, stationName };
    setLocation(newLocation);

    toast.success(`위치가 '${address}'(으)로 변경되었어요!`);
    fetchData(newLocation, profile);
  };

  // Dynamic background color based on air quality
  const bgColor = data?.airQuality?.grade
    ? getBackgroundColor(data.airQuality.grade)
    : '#F5F5F5';

  // Get character path
  const characterPath = data?.airQuality?.grade && profile?.ageGroup
    ? getCharacterPath(data.airQuality.grade, profile.ageGroup)
    : '/Character/C2.svg'; // Default

  // Profile badge text
  const profileBadge = profile?.ageGroup === "infant" ? "👶 영아(0~2세)" : 
    profile?.ageGroup === "toddler" ? "🧒 유아(3~6세)" :
    profile?.ageGroup === "elementary_low" ? "🎒 초등 저학년" :
    profile?.ageGroup === "elementary_high" ? "🏫 초등 고학년" : "🧑 청소년/성인";

  return (
    <main 
      className="min-h-screen p-4 transition-colors duration-500"
      style={{ backgroundColor: bgColor }}
    >
      {/* Header */}
      <header className="max-w-2xl mx-auto flex items-center justify-between mb-6 pb-4 border-b-2 border-black">
        <LocationHeader
          currentLocation={displayRegion}
          onLocationSelect={handleLocationSelect}
        />
        
        <div className="text-2xl font-black tracking-tight">
          에피로그
        </div>
        
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-2 rounded-full hover:bg-black/10 transition-all bento-card-sm bg-white"
          aria-label={isOnboarded ? "설정 변경" : "맞춤 설정 시작"}
        >
          <Settings size={24} />
        </button>
      </header>

      {/* Bento Box Grid */}
      <div className="max-w-2xl mx-auto grid grid-cols-2 gap-4">
        {/* Hero Card - 60% height, spans 2 columns */}
        <HeroCard
          character={characterPath}
          decisionText={data?.aiGuide?.summary || "지금은 정보를 가져올 수 없어요 😢"}
          grade={data?.airQuality?.grade || "NORMAL"}
          profileBadge={profileBadge}
          isLoading={isLoading}
          isError={!data && !isLoading}
        />

        {/* Action Stickers - 2 column grid */}
        <ActionStickerCard
          icon="😷"
          label="마스크"
          statusText={data?.aiGuide?.maskRecommendation || "확인 중..."}
          isPositive={data?.aiGuide?.maskRecommendation?.includes("필요 없어요") || false}
          delay={0.8}
        />
        
        <ActionStickerCard
          icon="⚽"
          label="활동"
          statusText={data?.aiGuide?.activityRecommendation || "확인 중..."}
          isPositive={data?.aiGuide?.activityRecommendation?.includes("맘껏") || false}
          delay={0.9}
        />

        {/* Insight Drawer - Collapsible */}
        <InsightDrawer
          reasoning={data?.aiGuide?.detail || "AI 선생님이 잠시 쉬고 있어요."}
          actionTip={data?.aiGuide?.actionItems?.join(", ") || ""}
          delay={1.0}
        />

        {/* Data Grid - Hidden by default */}
        {data?.airQuality && (
          <DataGrid
            data={{
              pm25: data.airQuality.pm25_value || 0,
              pm10: data.airQuality.pm10_value || 0,
              o3: data.airQuality.o3_value || 0,
              temperature: data.airQuality.temp || 0,
              humidity: data.airQuality.humidity || 0,
              no2: data.airQuality.no2_value || 0,
              co: data.airQuality.co_value || 0,
              so2: data.airQuality.so2_value || 0,
            }}
            delay={1.1}
          />
        )}
      </div>

      {/* Sticky Share Button */}
      {data && (
        <div className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto">
          <ShareButton
            nickname={profile?.nickname}
            region={displayRegion}
            action={
              data.aiGuide?.activityRecommendation?.includes("자제") ||
              data.aiGuide?.activityRecommendation?.includes("X")
                ? "실내 놀이"
                : "신나는 외출"
            }
          />
        </div>
      )}

      {/* Disclaimer */}
      <p className="max-w-2xl mx-auto text-center text-xs text-gray-600 font-medium mt-20 mb-20">
        본 서비스는 의료적 조언이 아니며 정보 제공을 목적으로 합니다.
        <br />
        증상이 있다면 반드시 전문 의료진과 상의하세요.
      </p>

      <OnboardingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleProfileSubmit}
        currentProfile={profile}
      />

      {!isLoading && <InstallPrompt />}
    </main>
  );
}
