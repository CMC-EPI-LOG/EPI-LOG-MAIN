"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUserStore, type UserProfile } from "@/store/useUserStore";
import HeroCard from "@/components/HeroCard";
import ActionStickerCard from "@/components/ActionStickerCard";
import InsightDrawer from "@/components/InsightDrawer";
import DataGrid from "@/components/DataGrid";
import OnboardingModal from "@/components/OnboardingModal";
import InstallPrompt from "@/components/InstallPrompt";
import LocationHeader from "@/components/LocationHeader";
import ShareButton from "@/components/ShareButton";
import ActionChecklistCard from "@/components/ActionChecklistCard";
import { Activity, Loader2, Settings, Shield } from "lucide-react";
import toast from "react-hot-toast";
import { getCharacterPath } from "@/lib/characterUtils";
import { getBackgroundColor } from "@/lib/colorUtils";
import { trackCoreEvent } from "@/lib/analytics/ga";

const REPORT_TIMEOUT_MS = 25000;

type LoadErrorKind = "timeout" | "fetch" | null;
type FetchCause = "initial" | "location" | "profile" | "retry";

interface DailyReportData {
  airQuality?: {
    grade?: string;
    pm25_value?: number;
    pm10_value?: number;
    o3_value?: number;
    temp?: number;
    humidity?: number;
    no2_value?: number;
  };
  aiGuide?: {
    summary?: string;
    detail?: string;
    threeReason?: string[];
    detailAnswer?: string;
    actionItems?: string[];
    maskRecommendation?: string;
    activityRecommendation?: string;
  };
  reliability?: {
    status?: "LIVE" | "STATION_FALLBACK" | "DEGRADED";
    label?: string;
    description?: string;
    requestedStation?: string;
    resolvedStation?: string;
    triedStations?: string[];
    updatedAt?: string;
    aiStatus?: "ok" | "failed";
  };
}

export default function Home() {
  const { location, profile, isOnboarded, setLocation, setProfile } =
    useUserStore();
  const [data, setData] = useState<DailyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [displayRegion, setDisplayRegion] = useState(location.stationName);
  const [loadErrorKind, setLoadErrorKind] = useState<LoadErrorKind>(null);
  const [isLocationRefreshing, setIsLocationRefreshing] = useState(false);
  const [isProfileRefreshing, setIsProfileRefreshing] = useState(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const fetchData = useCallback(async (
    currentLocation: typeof location,
    currentProfile: typeof profile,
    cause: FetchCause = "initial",
  ) => {
    const requestSeq = ++requestSeqRef.current;
    activeControllerRef.current?.abort(
      new DOMException("Superseded by newer request", "AbortError"),
    );

    let didTimeout = false;
    setLoadErrorKind(null);
    if (data) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setIsLocationRefreshing(cause === "location" && Boolean(data));
    setIsProfileRefreshing(cause === "profile" && Boolean(data));
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort(new DOMException("Request timeout", "TimeoutError"));
    }, REPORT_TIMEOUT_MS);

    try {
      const res = await fetch("/api/daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationName: currentLocation.stationName,
          profile: currentProfile,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Failed to fetch");

      const result = (await res.json()) as DailyReportData;
      if (requestSeq !== requestSeqRef.current) return;
      setData(result);
      setLoadErrorKind(null);
    } catch (error) {
      if (requestSeq !== requestSeqRef.current) return;

      if (controller.signal.aborted && !didTimeout) {
        return;
      }

      console.error(error);
      const isTimeoutError =
        didTimeout || (error instanceof DOMException && error.name === "AbortError");

      if (isTimeoutError) {
        setLoadErrorKind("timeout");
        toast.error("응답이 지연되고 있어요. 다시 시도해주세요.");
      } else {
        setLoadErrorKind("fetch");
        toast.error("데이터를 불러오지 못했어요 😢");
      }
    } finally {
      clearTimeout(timeoutId);
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
      if (requestSeq !== requestSeqRef.current) return;
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLocationRefreshing(false);
      setIsProfileRefreshing(false);
    }
  }, [data]);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort(
        new DOMException("Component unmounted", "AbortError"),
      );
    };
  }, []);

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
      fetchData(newLocation, profile, "location");
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
      fetchData(fallbackLocation, profile, "location");
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      toast.error("위치 서비스를 사용할 수 없어요");
      fetchData(location, profile, "initial");
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
        fetchData(fallbackLocation, profile, "initial");
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProfileSubmit = (newProfile: UserProfile) => {
    setProfile(newProfile);
    setIsModalOpen(false);
    trackCoreEvent("profile_changed", {
      age_group: newProfile.ageGroup,
      condition: newProfile.condition,
    });
    fetchData(location, newProfile, "profile");
  };

  const handleLocationSelect = useCallback((address: string, stationName: string) => {
    setDisplayRegion(address);
    const newLocation = { ...location, stationName };
    setLocation(newLocation);

    toast.success(`위치가 '${address}'(으)로 변경되었어요!`);
    trackCoreEvent("location_changed", {
      display_region: address,
      station_name: stationName,
    });
    fetchData(newLocation, profile, "location");
  }, [fetchData, location, profile, setLocation]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const testLocationHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ address?: string; stationName?: string }>;
      const address = customEvent.detail?.address;
      const stationName = customEvent.detail?.stationName;
      if (!address || !stationName) return;
      handleLocationSelect(address, stationName);
    };

    window.addEventListener("epilog:test-location-select", testLocationHandler);
    return () => {
      window.removeEventListener("epilog:test-location-select", testLocationHandler);
    };
  }, [data, handleLocationSelect]);

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

  const isHeroError = !data && !isLoading && loadErrorKind !== null;
  const heroErrorTitle =
    loadErrorKind === "timeout" ? "응답이 지연되고 있어요" : "AI 선생님이 쉬고 있어요";
  const heroErrorMessage =
    loadErrorKind === "timeout"
      ? "네트워크 상태를 확인하고 다시 시도해주세요."
      : "잠시 후 다시 시도해주세요.";
  const isHeroLoading = isLoading || isLocationRefreshing || isProfileRefreshing;
  const refreshingMessage = isLocationRefreshing
    ? "새 주소 데이터로 업데이트 중..."
    : isProfileRefreshing
      ? "연령/질환 조건 반영 중..."
      : "데이터 업데이트 중...";
  const heroLoadingCaption = isLocationRefreshing
    ? `${displayRegion} 기준으로 데이터 업데이트 중`
    : isProfileRefreshing
      ? "선택한 연령/질환 기준으로 맞춤 가이드를 다시 계산 중"
      : undefined;
  const reliabilityUpdatedAt = data?.reliability?.updatedAt
    ? new Date(data.reliability.updatedAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : undefined;

  return (
    <main 
      className="min-h-screen p-3 md:p-4 transition-colors duration-500"
      style={{ backgroundColor: bgColor }}
      data-testid="home-main"
    >
      {/* Header */}
      <header className="max-w-2xl mx-auto flex items-center justify-between mb-4 pb-3 border-b-2 border-black">
        <LocationHeader
          currentLocation={displayRegion}
          onLocationSelect={handleLocationSelect}
        />
        
        <div className="font-brand text-2xl font-black tracking-tight">
          에피로그
        </div>
        
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-2 rounded-full hover:bg-black/10 transition-all bento-card-sm bg-white"
          aria-label={isOnboarded ? "설정 변경" : "맞춤 설정 시작"}
          data-testid="settings-button"
        >
          <Settings size={24} />
        </button>
      </header>

      {isRefreshing && (
        <div className="max-w-2xl mx-auto mb-3">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1.5 shadow-bento-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-bold text-gray-700">
              {refreshingMessage}
            </span>
          </div>
        </div>
      )}

      {/* Bento Box Grid */}
      <div className="max-w-2xl mx-auto relative">
        <div className="grid grid-cols-2 gap-3 md:gap-4">
        {/* Hero Card - 60% height, spans 2 columns */}
        <HeroCard
          character={characterPath}
          decisionText={data?.aiGuide?.summary || "지금은 정보를 가져올 수 없어요 😢"}
          grade={data?.airQuality?.grade || "NORMAL"}
          profileBadge={profileBadge}
          isLoading={isHeroLoading}
          loadingCaption={heroLoadingCaption}
          isError={isHeroError}
          errorTitle={heroErrorTitle}
          errorMessage={heroErrorMessage}
          onRetry={() => {
            trackCoreEvent("retry_clicked", { source: "hero_error" });
            fetchData(location, profile, "retry");
          }}
        />

        {/* Interactive Checklist - High Priority */}
        <ActionChecklistCard
          actionItems={data?.aiGuide?.actionItems || []}
          delay={0.7}
          grade={data?.airQuality?.grade}
        />

        {/* Action Stickers - 2 column grid */}
        <ActionStickerCard
          icon={Shield}
          label="마스크"
          statusText={data?.aiGuide?.maskRecommendation || "확인 중..."}
          isPositive={data?.aiGuide?.maskRecommendation?.includes("필요 없어요") || false}
          delay={0.8}
        />
        
        <ActionStickerCard
          icon={Activity}
          label="활동"
          statusText={data?.aiGuide?.activityRecommendation || "확인 중..."}
          isPositive={data?.aiGuide?.activityRecommendation?.includes("맘껏") || false}
          delay={0.9}
        />

        {/* Insight Drawer - Collapsible */}
        <InsightDrawer
          threeReason={data?.aiGuide?.threeReason}
          detailAnswer={data?.aiGuide?.detailAnswer}
          reasoning={data?.aiGuide?.detail}  // Fallback for backward compatibility
          reliabilityLabel={data?.reliability?.label}
          reliabilityDescription={data?.reliability?.description}
          reliabilityUpdatedAt={reliabilityUpdatedAt}
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
            }}
            reliabilityLabel={data?.reliability?.label}
            reliabilityDescription={data?.reliability?.description}
            reliabilityUpdatedAt={reliabilityUpdatedAt}
            delay={1.1}
          />
        )}
        </div>
      </div>

      {/* Sticky Share Button */}
      {data && (
        <div className="fixed bottom-2 left-4 right-4 mx-auto max-w-2xl pb-[calc(env(safe-area-inset-bottom)+0.2rem)]">
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
        key={`onboarding-${profile?.ageGroup || "default"}-${profile?.condition || "default"}-${isModalOpen ? "open" : "closed"}`}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleProfileSubmit}
        currentProfile={profile}
      />

      {!isLoading && <InstallPrompt />}
    </main>
  );
}
