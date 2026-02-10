"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import * as Sentry from "@sentry/nextjs";
import toast from "react-hot-toast";
import { getCharacterPath } from "@/lib/characterUtils";
import { getBackgroundColor } from "@/lib/colorUtils";
import { setCoreEventContext, trackCoreEvent } from "@/lib/analytics/ga";
import { useLogger } from "@/hooks/useLogger";
import {
  deriveDecisionSignals,
  type AirQualityView,
  type AiGuideView,
  type DecisionSignals,
  type ProfileInput,
  type ReliabilityMeta,
} from "@/lib/dailyReportDecision";

const REPORT_TIMEOUT_MS = 25000;
const FRESHNESS_DELAYED_MINUTES = 60;
const FRESHNESS_STALE_MINUTES = 90;
const AIR_LATEST_POLL_INTERVAL_MS = 60_000;

type LoadErrorKind = "timeout" | "fetch" | null;
type FetchCause = "initial" | "location" | "profile" | "retry";

interface DailyReportData {
  airQuality?: AirQualityView;
  aiGuide?: AiGuideView;
  decisionSignals?: DecisionSignals;
  reliability?: ReliabilityMeta;
  timestamp?: string;
}

function parseKstDataTimeToEpoch(raw?: string | null): number | null {
  if (!raw) return null;
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!matched) return null;

  const [, year, month, day, hour, minute] = matched;
  const utcMillis = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 9,
    Number(minute),
  );

  return Number.isNaN(utcMillis) ? null : utcMillis;
}

export default function Home() {
  const { location, profile, isOnboarded, setLocation, setProfile } =
    useUserStore();
  const { logEvent, logAddressConsent } = useLogger();
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
  const activeFetchCauseRef = useRef<FetchCause>("initial");
  const loadingStartedAtRef = useRef<number | null>(null);
  const lastFallbackExposeKeyRef = useRef<string | null>(null);
  const airLatestInFlightRef = useRef(false);

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
    activeFetchCauseRef.current = cause;
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

  const refreshAirLatest = useCallback(async () => {
    const stationName = location.stationName?.trim();
    if (!stationName) return;
    if (airLatestInFlightRef.current) return;
    if (activeControllerRef.current) return; // Avoid overlapping with full daily-report fetch.

    airLatestInFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/air-quality-latest?stationName=${encodeURIComponent(stationName)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;

      const latest = (await res.json()) as {
        airQuality?: AirQualityView;
        reliability?: ReliabilityMeta;
        timestamp?: string;
      };
      const latestAirQuality = latest.airQuality;
      if (!latestAirQuality) return;

      setData((prev) => {
        if (!prev) return prev;

        // Preserve existing AI payload but re-derive the decision signals
        // so that temp/humidity and new pollutant values are reflected in the UI.
        const baseGuide: AiGuideView = {
          summary: prev.aiGuide?.summary || "확인 중...",
          detail: prev.aiGuide?.detail || "",
          threeReason: prev.aiGuide?.threeReason || [],
          detailAnswer: prev.aiGuide?.detailAnswer || prev.aiGuide?.detail || "",
          actionItems: prev.aiGuide?.actionItems || [],
          activityRecommendation: prev.aiGuide?.activityRecommendation || "확인 필요",
          maskRecommendation: prev.aiGuide?.maskRecommendation || "확인 필요",
          references: prev.aiGuide?.references || [],
        };

        const profileForDecision: ProfileInput = profile
          ? { ageGroup: profile.ageGroup, condition: profile.condition }
          : { ageGroup: "elementary_low", condition: "none" };

        const derived = deriveDecisionSignals(
          latestAirQuality,
          baseGuide,
          profileForDecision,
        );

        return {
          ...prev,
          airQuality: derived.airData,
          aiGuide: {
            ...prev.aiGuide,
            ...derived.aiGuide,
          },
          decisionSignals: derived.decisionSignals,
          reliability: latest.reliability || prev.reliability,
          timestamp: latest.timestamp || prev.timestamp,
        };
      });
    } catch (error) {
      console.error("[UI] Air latest refresh failed:", error);
    } finally {
      airLatestInFlightRef.current = false;
    }
  }, [location.stationName, profile]);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort(
        new DOMException("Component unmounted", "AbortError"),
      );
    };
  }, []);

  useEffect(() => {
    if (!location.stationName) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshAirLatest();
    }, AIR_LATEST_POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshAirLatest();
      }
    };

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [location.stationName, refreshAirLatest]);

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
        void logAddressConsent(true);
        const { latitude, longitude } = position.coords;
        updateLocationByCoords(latitude, longitude);
      },
      (error) => {
        console.error("Location permission denied or error:", error);
        if (error?.code === 1) {
          void logAddressConsent(false);
        }
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
    // Avoid storing PII like nickname; keep only coarse settings.
    void logEvent("profile_changed", {
      age_group: newProfile.ageGroup,
      condition: newProfile.condition,
    });
    trackCoreEvent("profile_changed", {
      age_group: newProfile.ageGroup,
      condition: newProfile.condition,
    });
    fetchData(location, newProfile, "profile");
  };

  const handleLocationSelect = useCallback((address: string, stationName: string) => {
    setDisplayRegion(address);
    void logAddressConsent(true);
    const newLocation = { ...location, stationName };
    setLocation(newLocation);

    toast.success(`위치가 '${address}'(으)로 변경되었어요!`);
    trackCoreEvent("location_changed", {
      display_region: address,
      station_name: stationName,
    });
    fetchData(newLocation, profile, "location");
  }, [fetchData, location, logAddressConsent, profile, setLocation]);

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
  const measurementRegion = data?.airQuality?.stationName
    ? [data.airQuality.sidoName, data.airQuality.stationName].filter(Boolean).join(" ")
    : undefined;
  const measurementDataTime = data?.airQuality?.dataTime ?? undefined;
  const freshnessMeta = useMemo(() => {
    const measuredAtMillis = parseKstDataTimeToEpoch(data?.airQuality?.dataTime);
    if (!measuredAtMillis) {
      return {
        status: "UNKNOWN" as const,
        ageMinutes: null as number | null,
        description: undefined as string | undefined,
        needsRefresh: false,
      };
    }

    const ageMinutes = Math.max(
      0,
      Math.floor((Date.now() - measuredAtMillis) / 60000),
    );

    if (ageMinutes >= FRESHNESS_STALE_MINUTES) {
      return {
        status: "STALE" as const,
        ageMinutes,
        description: `측정 시각 기준 ${ageMinutes}분 경과로 최신값 자동 재조회가 필요해요.`,
        needsRefresh: true,
      };
    }

    if (ageMinutes >= FRESHNESS_DELAYED_MINUTES) {
      return {
        status: "DELAYED" as const,
        ageMinutes,
        description: `측정 시각 기준 ${ageMinutes}분 경과로 데이터가 지연됐을 수 있어요.`,
        needsRefresh: true,
      };
    }

    return {
      status: "FRESH" as const,
      ageMinutes,
      description: undefined as string | undefined,
      needsRefresh: false,
    };
  }, [data?.airQuality?.dataTime]);

  const decisionSignalChips = useMemo(() => {
    const chips: string[] = [];
    if (!data?.decisionSignals) return chips;

    if (data.decisionSignals.o3OutingBanForced) {
      chips.push("오존 시간대 규칙 적용");
    }

    if (data.decisionSignals.infantMaskBanApplied) {
      chips.push("영아 마스크 금지 적용");
    }

    if (data.decisionSignals.weatherAdjusted) {
      chips.push("질환/온습도 보정 적용");
    }

    if (data.decisionSignals.finalGrade) {
      const finalGradeText =
        data.decisionSignals.finalGrade === "GOOD"
          ? "좋음"
          : data.decisionSignals.finalGrade === "NORMAL"
            ? "보통"
            : data.decisionSignals.finalGrade === "BAD"
              ? "나쁨"
              : "매우나쁨";
      chips.push(`최종 위험도 ${finalGradeText}`);
    }

    return chips;
  }, [data?.decisionSignals]);

  const handleFreshnessRefresh = useCallback(() => {
    trackCoreEvent("retry_clicked", { trigger_source: "freshness_badge" });
    fetchData(location, profile, "retry");
  }, [fetchData, location, profile]);

  useEffect(() => {
    if (isHeroLoading) {
      if (loadingStartedAtRef.current === null) {
        loadingStartedAtRef.current = Date.now();
        trackCoreEvent("loading_shown", {
          loading_cause: activeFetchCauseRef.current,
          has_cached_data: Boolean(data),
        });
      }
      return;
    }

    if (loadingStartedAtRef.current === null) return;

    const durationMs = Date.now() - loadingStartedAtRef.current;
    loadingStartedAtRef.current = null;
    trackCoreEvent("loading_duration_ms", {
      loading_cause: activeFetchCauseRef.current,
      loading_duration_ms: durationMs,
      loading_outcome: loadErrorKind ? "error" : "success",
    });
  }, [isHeroLoading, loadErrorKind, data]);

  useEffect(() => {
    const status = data?.reliability?.status;
    if (!status || status === "LIVE") return;

    const key = [
      status,
      data?.timestamp || "",
      data?.reliability?.resolvedStation || "",
      data?.airQuality?.stationName || "",
    ].join(":");

    if (lastFallbackExposeKeyRef.current === key) return;
    lastFallbackExposeKeyRef.current = key;

    trackCoreEvent("fallback_exposed", {
      reliability_status: status,
      requested_station: data?.reliability?.requestedStation || "unknown",
      resolved_station: data?.reliability?.resolvedStation || "unknown",
      ai_status: data?.reliability?.aiStatus || "unknown",
    });
  }, [
    data?.airQuality?.stationName,
    data?.reliability?.aiStatus,
    data?.reliability?.requestedStation,
    data?.reliability?.resolvedStation,
    data?.reliability?.status,
    data?.timestamp,
  ]);

  useEffect(() => {
    setCoreEventContext({
      station_name: data?.airQuality?.stationName || location.stationName,
      reliability_status: data?.reliability?.status || "unknown",
      age_group: profile?.ageGroup,
      condition: profile?.condition,
    });

    Sentry.setTag("station", data?.airQuality?.stationName || location.stationName);
    Sentry.setTag("reliability", data?.reliability?.status || "unknown");
    Sentry.setContext("profile", {
      ageGroup: profile?.ageGroup,
      condition: profile?.condition,
    });
  }, [
    data?.airQuality?.stationName,
    data?.reliability?.status,
    location.stationName,
    profile?.ageGroup,
    profile?.condition,
  ]);

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
            trackCoreEvent("retry_clicked", { trigger_source: "hero_error" });
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
          fixedBadgeText={profile?.ageGroup === "infant" ? "영아 마스크 금지" : undefined}
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
          measurementDataTime={measurementDataTime}
          measurementRegion={measurementRegion}
          decisionSignalChips={decisionSignalChips}
          freshnessStatus={freshnessMeta.status === "UNKNOWN" ? undefined : freshnessMeta.status}
          freshnessDescription={freshnessMeta.description}
          onRefreshData={freshnessMeta.needsRefresh ? handleFreshnessRefresh : undefined}
          isRefreshing={isRefreshing}
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
            measurementDataTime={measurementDataTime}
            measurementRegion={measurementRegion}
            freshnessStatus={freshnessMeta.status === "UNKNOWN" ? undefined : freshnessMeta.status}
            freshnessDescription={freshnessMeta.description}
            onRefreshData={freshnessMeta.needsRefresh ? handleFreshnessRefresh : undefined}
            isRefreshing={isRefreshing}
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
            summary={data.aiGuide?.summary}
            reason={data.aiGuide?.threeReason?.[0]}
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
