"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUserStore, type UserProfile } from "@/store/useUserStore";
import HeroCard from "@/components/HeroCard";
import InsightDrawer from "@/components/InsightDrawer";
import DataGrid from "@/components/DataGrid";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";
import InstallPrompt from "@/components/InstallPrompt";
import LocationHeader from "@/components/LocationHeader";
import ShareButton from "@/components/ShareButton";
import ActionChecklistCard from "@/components/ActionChecklistCard";
import ClothingCard from "@/components/ClothingCard";
import ClothingDetailModal from "@/components/ClothingDetailModal";
import LifestyleIndexCard from "@/components/LifestyleIndexCard";
import AiNotice from "@/components/AiNotice";
import { Loader2, Settings } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import toast from "react-hot-toast";
import { getCharacterPath } from "@/lib/characterUtils";
import { getBackgroundColor } from "@/lib/colorUtils";
import { setCoreEventContext, trackCoreEvent } from "@/lib/analytics/ga";
import { useLogger } from "@/hooks/useLogger";
import { loadReportSnapshot, saveReportSnapshot } from "@/lib/reportSnapshot";
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
const REVERSE_GEOCODE_TIMEOUT_MS = 5000;
const REVERSE_GEOCODE_RETRY_COUNT = 1;
const DEFAULT_LOCATION_FALLBACK = {
  lat: 37.5172,
  lng: 127.0473,
  stationName: "강남구",
} as const;
const TEST_LOCATION_EVENT = "aisoom:test-location-select";
const LEGACY_TEST_LOCATION_EVENT = "epilog:test-location-select";
const TEST_LOCATION_MODAL_EVENT = "aisoom:test-location-modal";
const TEST_PROFILE_EVENT = "aisoom:test-profile-select";
const TEST_HOOKS_READY_FLAG = "__AISOOM_TEST_HOOKS_READY__";

type LoadErrorKind = "timeout" | "fetch" | null;
type FetchCause = "initial" | "location" | "profile" | "retry";
type SettingsModalTab = "age" | "condition";

interface DailyReportData {
  airQuality?: AirQualityView;
  aiGuide?: AiGuideView;
  decisionSignals?: DecisionSignals;
  reliability?: ReliabilityMeta;
  timestamp?: string;
}

interface ClothingRecommendationData {
  summary: string;
  recommendation: string;
  tips: string[];
  comfortLevel?: string;
  temperature: number;
  humidity: number;
  source?: string;
}

interface WeatherForecastItem {
  forecastAt: string;
  dateKst: string;
  hourKst: number;
  timeLabel: string;
  temperature: number | null;
  humidity: number | null;
  precipitation: number | string | null;
  precipitationProbability: number | null;
  precipitationType: number | null;
  sky: number | null;
}

interface AirQualityForecastItem {
  forecastDate: string;
  pm10Grade: string | null;
  pm25Grade: string | null;
  overall: string | null;
  cause: string | null;
  actionKnack: string | null;
}

interface AirQualityForecastData {
  requestedRegion: string | null;
  resolvedRegion: string | null;
  issuedAt: string | null;
  items: AirQualityForecastItem[];
}

interface LifestyleUvItem {
  forecastDate: string;
  peakValue: number | null;
  peakLabel: string | null;
  peakHourLabel: string | null;
}

interface LifestylePollenItem {
  forecastDate: string;
  overallLabel: string | null;
  pineLabel: string | null;
  oakLabel: string | null;
  weedLabel: string | null;
}

interface LifestyleIndicesData {
  requestedRegion: string | null;
  resolvedRegion: string | null;
  uvIssuedAt: string | null;
  pollenIssuedAt: string | null;
  uvItems: LifestyleUvItem[];
  pollenItems: LifestylePollenItem[];
  actionSummary: string | null;
}

interface WeatherForecastData {
  requestedStation: string;
  resolvedStation: string | null;
  items: WeatherForecastItem[];
  airQualityForecast?: AirQualityForecastData | null;
  lifestyleIndices?: LifestyleIndicesData | null;
  timestamp?: string;
}

interface ReverseGeocodeResponse {
  regionName?: string;
  stationCandidate?: string;
  fallbackApplied?: boolean;
  error?: string;
}

interface SnapshotBannerMeta {
  savedAt: string;
  stationName: string;
}

interface PersistedReportSnapshot {
  profileSignature: string;
  report: DailyReportData;
  clothingData: ClothingRecommendationData | null;
  forecastData: WeatherForecastData | null;
  displayRegion: string;
}

interface HomeProps {
  enableClothingModalPreview?: boolean;
}

const KNOWN_CONDITION_LABELS: Record<string, string> = {
  none: '해당 없음',
  rhinitis: '비염',
  asthma: '천식',
  atopy: '아토피',
};

function normalizeKnownConditions(profile: UserProfile | null | undefined): string[] {
  if (!profile) return ['none'];

  const knownConditions = [
    ...(Array.isArray(profile.conditions) ? profile.conditions : []),
    ...(typeof profile.condition === 'string' ? [profile.condition] : []),
  ]
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value in KNOWN_CONDITION_LABELS);

  const deduped = Array.from(new Set(knownConditions));
  const withoutNone = deduped.filter((value) => value !== 'none');
  if (withoutNone.length > 0) return withoutNone;

  if (Array.isArray(profile.customConditions) && profile.customConditions.length > 0) {
    return [];
  }

  return ['none'];
}

function buildConditionContextValue(profile: UserProfile | null | undefined): string {
  if (!profile) return 'none';

  const known = normalizeKnownConditions(profile).filter((condition) => condition !== 'none');
  const custom = Array.isArray(profile.customConditions) ? profile.customConditions : [];
  const merged = [...known, ...custom].filter(Boolean);

  return merged.length > 0 ? merged.join(',') : 'none';
}

function buildConditionSummary(profile: UserProfile | null | undefined): string {
  if (!profile) return '질환: 해당 없음';

  const knownLabels = normalizeKnownConditions(profile)
    .filter((condition) => condition !== 'none')
    .map((condition) => KNOWN_CONDITION_LABELS[condition] || condition);
  const custom = Array.isArray(profile.customConditions) ? profile.customConditions.filter(Boolean) : [];
  const merged = [...knownLabels, ...custom];

  if (merged.length === 0) return '질환: 해당 없음';
  return `질환: ${merged.join(', ')}`;
}

function buildSnapshotProfileSignature(profile: UserProfile | null | undefined): string {
  const conditions = normalizeKnownConditions(profile).join('|');
  const customConditions = (profile?.customConditions || []).map((item) => item.trim()).join('|');

  return [
    profile?.ageGroup || 'unknown',
    profile?.condition || 'none',
    conditions,
    customConditions,
  ].join('::');
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

export default function Home({ enableClothingModalPreview = false }: HomeProps = {}) {
  const { location, profile, isOnboarded, setLocation, setProfile } =
    useUserStore();
  const { logEvent, logAddressConsent } = useLogger();
  const [data, setData] = useState<DailyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<SettingsModalTab>("age");
  const [displayRegion, setDisplayRegion] = useState(location.stationName);
  const [loadErrorKind, setLoadErrorKind] = useState<LoadErrorKind>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotBannerMeta | null>(null);
  const [isLocationRefreshing, setIsLocationRefreshing] = useState(false);
  const [isProfileRefreshing, setIsProfileRefreshing] = useState(false);
  const [clothingData, setClothingData] = useState<ClothingRecommendationData | null>(null);
  const [isClothingLoading, setIsClothingLoading] = useState(false);
  const [isClothingModalOpen, setIsClothingModalOpen] = useState(false);
  const [forecastData, setForecastData] = useState<WeatherForecastData | null>(null);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const clothingRequestSeqRef = useRef(0);
  const forecastRequestSeqRef = useRef(0);
  const activeFetchCauseRef = useRef<FetchCause>("initial");
  const loadingStartedAtRef = useRef<number | null>(null);
  const lastFallbackExposeKeyRef = useRef<string | null>(null);
  const airLatestInFlightRef = useRef(false);

  const buildLocationFallback = useCallback(
    (coords?: { lat?: number; lng?: number }) => {
      const stationName =
        location.stationName?.trim() || DEFAULT_LOCATION_FALLBACK.stationName;

      return {
        lat:
          typeof coords?.lat === "number"
            ? coords.lat
            : Number.isFinite(location.lat)
              ? location.lat
              : DEFAULT_LOCATION_FALLBACK.lat,
        lng:
          typeof coords?.lng === "number"
            ? coords.lng
            : Number.isFinite(location.lng)
              ? location.lng
              : DEFAULT_LOCATION_FALLBACK.lng,
        stationName,
      };
    },
    [location.lat, location.lng, location.stationName],
  );

  const getFallbackRegionLabel = useCallback(
    (fallbackLocation: { stationName: string }) => {
      const fromDisplay = displayRegion?.trim();
      if (fromDisplay) return fromDisplay;
      return fallbackLocation.stationName || DEFAULT_LOCATION_FALLBACK.stationName;
    },
    [displayRegion],
  );

  const fetchReverseGeocodeByCoords = useCallback(async (
    lat: number,
    lng: number,
    fallbackStationName: string,
  ) => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= REVERSE_GEOCODE_RETRY_COUNT; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, REVERSE_GEOCODE_TIMEOUT_MS);

      try {
        const res = await fetch("/api/reverse-geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, fallbackStationName }),
          signal: controller.signal,
        });

        const payload = (await res.json().catch(() => ({}))) as ReverseGeocodeResponse;
        if (!res.ok) {
          const reason = payload.error?.trim() || `HTTP_${res.status}`;
          const geocodeError = new Error(`reverse_geocode_${reason}`);
          (geocodeError as { retriable?: boolean }).retriable =
            res.status >= 500 || res.status === 408 || res.status === 429;
          throw geocodeError;
        }

        const regionName = payload.regionName?.trim();
        const stationCandidate = payload.stationCandidate?.trim();
        if (!regionName || !stationCandidate) {
          const geocodeError = new Error("reverse_geocode_invalid_payload");
          (geocodeError as { retriable?: boolean }).retriable = true;
          throw geocodeError;
        }

        return {
          regionName,
          stationCandidate,
          fallbackApplied: payload.fallbackApplied === true,
        };
      } catch (error) {
        lastError = error;
        const isAbortError = error instanceof DOMException && error.name === "AbortError";
        const retriable =
          isAbortError ||
          ((error as { retriable?: boolean } | null)?.retriable ?? true);
        const isLastAttempt = attempt >= REVERSE_GEOCODE_RETRY_COUNT;
        if (isLastAttempt || !retriable) break;
        await new Promise((resolve) => {
          window.setTimeout(resolve, 150 * (attempt + 1));
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    throw lastError || new Error("reverse_geocode_failed");
  }, []);

  const fetchClothingRecommendation = useCallback(async (
    temperature?: number,
    humidity?: number,
  ) => {
    const requestSeq = ++clothingRequestSeqRef.current;
    const safeTemperature = typeof temperature === "number" ? temperature : 22;
    const safeHumidity = typeof humidity === "number" ? humidity : 45;

    setIsClothingLoading(true);
    try {
      const res = await fetch("/api/clothing-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temperature: safeTemperature,
          humidity: safeHumidity,
        }),
      });
      if (!res.ok) throw new Error("Failed to fetch clothing recommendation");

      const result = (await res.json()) as ClothingRecommendationData;
      if (requestSeq !== clothingRequestSeqRef.current) return;
      setClothingData(result);
    } catch (error) {
      if (requestSeq !== clothingRequestSeqRef.current) return;
      console.error("[UI] Clothing recommendation failed:", error);
      setClothingData({
        summary: "현재 날씨 기준으로 겉옷을 한 겹 준비해 주세요.",
        recommendation: "가벼운 레이어드 복장",
        tips: ["실내외 온도차에 대비해 탈착 가능한 겉옷을 추천해요."],
        comfortLevel: "UNKNOWN",
        temperature: Number(safeTemperature),
        humidity: Number(safeHumidity),
        source: "ui-fallback",
      });
    } finally {
      if (requestSeq !== clothingRequestSeqRef.current) return;
      setIsClothingLoading(false);
    }
  }, []);

  const fetchWeatherForecast = useCallback(async (stationName?: string) => {
    const requestSeq = ++forecastRequestSeqRef.current;
    const targetStation =
      typeof stationName === "string" && stationName.trim()
        ? stationName.trim()
        : location.stationName.trim();

    if (!targetStation) {
      if (requestSeq === forecastRequestSeqRef.current) {
        setForecastData(null);
        setIsForecastLoading(false);
      }
      return;
    }

    setIsForecastLoading(true);
    try {
      const res = await fetch(
        `/api/weather-forecast?stationName=${encodeURIComponent(targetStation)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to fetch weather forecast");

      const result = (await res.json()) as WeatherForecastData;
      if (requestSeq !== forecastRequestSeqRef.current) return;
      setForecastData(result);
    } catch (error) {
      if (requestSeq !== forecastRequestSeqRef.current) return;
      console.error("[UI] Weather forecast fetch failed:", error);
    } finally {
      if (requestSeq !== forecastRequestSeqRef.current) return;
      setIsForecastLoading(false);
    }
  }, [location.stationName]);

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
      setSnapshotMeta(null);
      setData(result);
      void fetchClothingRecommendation(result.airQuality?.temp, result.airQuality?.humidity);
      void fetchWeatherForecast(currentLocation.stationName);
      setLoadErrorKind(null);
    } catch (error) {
      if (requestSeq !== requestSeqRef.current) return;

      if (controller.signal.aborted && !didTimeout) {
        return;
      }

      console.error(error);
      const isTimeoutError =
        didTimeout || (error instanceof DOMException && error.name === "AbortError");

      const snapshot = loadReportSnapshot<PersistedReportSnapshot>();
      if (
        snapshot?.data?.report &&
        snapshot.data.profileSignature === buildSnapshotProfileSignature(currentProfile)
      ) {
        setData(snapshot.data.report);
        setClothingData(snapshot.data.clothingData);
        setForecastData(snapshot.data.forecastData);
        setDisplayRegion(snapshot.data.displayRegion || snapshot.stationName);
        setSnapshotMeta({
          savedAt: snapshot.savedAt,
          stationName: snapshot.stationName,
        });
        setLoadErrorKind(null);
        toast("마지막 성공 데이터를 보여주고 있어요.");
        return;
      }

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
  }, [data, fetchClothingRecommendation, fetchWeatherForecast]);

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
          summary: prev.aiGuide?.summary || "",
          csvReason: prev.aiGuide?.csvReason,
          detail: prev.aiGuide?.detail || "",
          threeReason: prev.aiGuide?.threeReason || [],
          detailAnswer: prev.aiGuide?.detailAnswer || prev.aiGuide?.detail || "",
          actionItems: prev.aiGuide?.actionItems || [],
          activityRecommendation: prev.aiGuide?.activityRecommendation || "",
          maskRecommendation: prev.aiGuide?.maskRecommendation || "",
          references: prev.aiGuide?.references || [],
        };

        const profileForDecision: ProfileInput = profile
          ? {
              ageGroup: profile.ageGroup,
              condition: profile.condition,
              conditions: profile.conditions,
              customConditions: profile.customConditions,
            }
          : { ageGroup: "elementary_low", condition: "none", conditions: ["none"], customConditions: [] };

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
      void fetchClothingRecommendation(latestAirQuality.temp, latestAirQuality.humidity);
    } catch (error) {
      console.error("[UI] Air latest refresh failed:", error);
    } finally {
      airLatestInFlightRef.current = false;
    }
  }, [fetchClothingRecommendation, location.stationName, profile]);

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
    const fallbackLocation = buildLocationFallback({ lat, lng });

    try {
      const { regionName, stationCandidate, fallbackApplied } = await fetchReverseGeocodeByCoords(
        lat,
        lng,
        fallbackLocation.stationName,
      );

      const newLocation = {
        lat,
        lng,
        stationName: stationCandidate,
      };

      setLocation(newLocation);
      setDisplayRegion(regionName);

      if (fallbackApplied) {
        toast(`현재 위치를 정확히 확인하지 못해 '${regionName}' 기준으로 보여드려요 🏢`);
      } else {
        toast.success(`현재 위치: ${regionName}`);
      }
      fetchData(newLocation, profile, "location");
    } catch (error) {
      console.error("Reverse Geocode Error:", error);
      const reason =
        error instanceof Error && error.message
          ? error.message
          : "unknown";
      void logEvent("location_reverse_geocode_failed", {
        reason,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
      });
      const fallbackRegionLabel = getFallbackRegionLabel(fallbackLocation);
      toast.error(
        `위치 정보를 불러올 수 없어 '${fallbackRegionLabel}' 기준으로 보여드려요 🏢`,
      );
      setLocation(fallbackLocation);
      setDisplayRegion(fallbackRegionLabel);
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
        const fallbackLocation = buildLocationFallback();
        const fallbackRegionLabel = getFallbackRegionLabel(fallbackLocation);
        toast.error(
          `위치 정보를 불러올 수 없어 '${fallbackRegionLabel}' 기준으로 보여드려요 🏢`,
        );
        setLocation(fallbackLocation);
        setDisplayRegion(fallbackRegionLabel);
        fetchData(fallbackLocation, profile, "initial");
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitProfileChange = useCallback((newProfile: UserProfile) => {
    setProfile(newProfile);
    // Avoid storing PII like nickname; keep only coarse settings.
    void logEvent("profile_changed", {
      age_group: newProfile.ageGroup,
      condition: newProfile.condition,
      conditions: buildConditionContextValue(newProfile),
    });
    trackCoreEvent("profile_changed", {
      age_group: newProfile.ageGroup,
      condition: newProfile.condition,
      conditions: buildConditionContextValue(newProfile),
    });
    fetchData(location, newProfile, "profile");
  }, [fetchData, location, logEvent, setProfile]);

  const openSettingsModal = useCallback((tab: SettingsModalTab = "age") => {
    setSettingsModalTab(tab);
    setIsSettingsModalOpen(true);
  }, []);

  const handleSettingsSubmit = (newProfile: UserProfile) => {
    setIsSettingsModalOpen(false);
    commitProfileChange(newProfile);
  };

  const handleLocationSelect = useCallback((address: string, stationName: string) => {
    setIsLocationModalOpen(false);
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

    const testProfileHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ profile?: UserProfile }>;
      const nextProfile = customEvent.detail?.profile;
      if (!nextProfile?.ageGroup) return;
      commitProfileChange({
        nickname: nextProfile.nickname || "",
        ageGroup: nextProfile.ageGroup,
        condition: nextProfile.condition || "none",
        conditions: nextProfile.conditions,
        customConditions: nextProfile.customConditions,
      });
    };

    const testLocationModalHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      setIsLocationModalOpen(Boolean(customEvent.detail?.open));
    };

    window.addEventListener(TEST_LOCATION_EVENT, testLocationHandler);
    window.addEventListener(LEGACY_TEST_LOCATION_EVENT, testLocationHandler);
    window.addEventListener(TEST_LOCATION_MODAL_EVENT, testLocationModalHandler);
    window.addEventListener(TEST_PROFILE_EVENT, testProfileHandler);
    (window as typeof window & { [TEST_HOOKS_READY_FLAG]?: boolean })[TEST_HOOKS_READY_FLAG] = true;
    return () => {
      window.removeEventListener(TEST_LOCATION_EVENT, testLocationHandler);
      window.removeEventListener(LEGACY_TEST_LOCATION_EVENT, testLocationHandler);
      window.removeEventListener(TEST_LOCATION_MODAL_EVENT, testLocationModalHandler);
      window.removeEventListener(TEST_PROFILE_EVENT, testProfileHandler);
      (window as typeof window & { [TEST_HOOKS_READY_FLAG]?: boolean })[TEST_HOOKS_READY_FLAG] = false;
    };
  }, [commitProfileChange, data, handleLocationSelect]);

  useEffect(() => {
    if (!data || snapshotMeta) return;

    saveReportSnapshot(
      data.airQuality?.stationName || location.stationName || DEFAULT_LOCATION_FALLBACK.stationName,
      {
        profileSignature: buildSnapshotProfileSignature(profile),
        report: data,
        clothingData,
        forecastData,
        displayRegion,
      },
    );
  }, [
    clothingData,
    data,
    displayRegion,
    forecastData,
    location.stationName,
    profile,
    snapshotMeta,
  ]);

  // Dynamic background color based on air quality
  const bgColor = data?.airQuality?.grade
    ? getBackgroundColor(data.airQuality.grade)
    : '#F5F5F5';

  // Get character path
  const characterPath = data?.airQuality?.grade && profile?.ageGroup
    ? getCharacterPath(data.airQuality.grade, profile.ageGroup)
    : '/Character/C2.svg'; // Default

  // Profile badge text
  const ageSummaryText = profile?.ageGroup === "infant" ? "연령: 영아(0~2세)" : 
    profile?.ageGroup === "toddler" ? "연령: 유아(3~6세)" :
    profile?.ageGroup === "elementary_low" ? "연령: 초등 저학년" :
    profile?.ageGroup === "elementary_high" ? "연령: 초등 고학년" : "연령: 청소년/성인";
  const conditionSummaryText = buildConditionSummary(profile);

  const isHeroError = !data && !isLoading && loadErrorKind !== null;
  const heroErrorTitle =
    loadErrorKind === "timeout" ? "응답이 지연되고 있어요" : "AI 선생님이 쉬고 있어요";
  const heroErrorMessage =
    loadErrorKind === "timeout"
      ? "네트워크 상태를 확인하고 다시 시도해주세요."
      : "잠시 후 다시 시도해주세요.";
  const hasAirQualityData = Boolean(data?.airQuality);
  const hasAiGuideData = Boolean(data?.aiGuide);
  const hasShareData = Boolean(
    data?.aiGuide?.summary || data?.aiGuide?.threeReason?.[0] || data?.aiGuide?.activityRecommendation,
  );
  const isCoreDataLoading = (isLoading && !data) || isLocationRefreshing || isProfileRefreshing;
  const isHeroLoading = isCoreDataLoading;
  const isProfileDataLoading = isCoreDataLoading;
  const isClothingCardLoading = isCoreDataLoading || isClothingLoading;
  const shouldRenderActionChecklist = isCoreDataLoading || hasAiGuideData;
  const shouldRenderInsightDrawer = isCoreDataLoading || hasAiGuideData || hasAirQualityData;
  const shouldRenderDataGrid = isCoreDataLoading || hasAirQualityData;
  const shouldRenderShareButton = isCoreDataLoading || hasShareData;
  const shouldRenderClothingCard =
    !enableClothingModalPreview && (isCoreDataLoading || hasAirQualityData || Boolean(clothingData));
  const refreshingMessage = isLocationRefreshing
    ? "새 주소 데이터로 업데이트 중..."
    : isProfileRefreshing
      ? "연령/질환 조건 반영 중..."
      : "데이터 업데이트 중...";
  const snapshotSavedAtLabel = useMemo(() => {
    if (!snapshotMeta?.savedAt) return null;

    const parsed = new Date(snapshotMeta.savedAt);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [snapshotMeta?.savedAt]);
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
  const measurementRegion = useMemo(() => {
    const resolvedStation = data?.reliability?.resolvedStation?.trim() || data?.airQuality?.stationName?.trim();
    if (!resolvedStation) return undefined;

    const resolvedLabel = [data?.airQuality?.sidoName, resolvedStation].filter(Boolean).join(" ");
    const requestedStation = data?.reliability?.requestedStation?.trim();
    const displayLocation = displayRegion?.trim() || requestedStation;

    if (requestedStation && requestedStation !== resolvedStation) {
      return `현재 위치 ${displayLocation || requestedStation} · 측정소 ${resolvedLabel}`;
    }

    return resolvedLabel;
  }, [
    data?.airQuality?.sidoName,
    data?.airQuality?.stationName,
    data?.reliability?.requestedStation,
    data?.reliability?.resolvedStation,
    displayRegion,
  ]);
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

  const handleOpenClothingModal = useCallback(() => {
    setIsClothingModalOpen(true);
    void fetchClothingRecommendation(
      clothingData?.temperature ?? data?.airQuality?.temp,
      clothingData?.humidity ?? data?.airQuality?.humidity,
    );
    void fetchWeatherForecast(location.stationName || data?.airQuality?.stationName);
  }, [
    clothingData?.humidity,
    clothingData?.temperature,
    data?.airQuality?.humidity,
    data?.airQuality?.stationName,
    data?.airQuality?.temp,
    fetchClothingRecommendation,
    fetchWeatherForecast,
    location.stationName,
  ]);

  const handleRefreshClothingModal = useCallback(() => {
    void fetchClothingRecommendation(
      clothingData?.temperature ?? data?.airQuality?.temp,
      clothingData?.humidity ?? data?.airQuality?.humidity,
    );
    void fetchWeatherForecast(location.stationName || data?.airQuality?.stationName);
  }, [
    clothingData?.humidity,
    clothingData?.temperature,
    data?.airQuality?.humidity,
    data?.airQuality?.stationName,
    data?.airQuality?.temp,
    fetchClothingRecommendation,
    fetchWeatherForecast,
    location.stationName,
  ]);

  const previewClothingButtonLabel = useMemo(() => {
    if (!enableClothingModalPreview) return undefined;
    const currentTemperature = clothingData?.temperature ?? data?.airQuality?.temp;

    if (typeof currentTemperature !== "number" || Number.isNaN(currentTemperature)) {
      return "옷차림\n(현재날씨 확인중)";
    }

    const normalized = Number.isInteger(currentTemperature)
      ? `${currentTemperature}`
      : currentTemperature.toFixed(1).replace(/\.0$/, "");

    return `옷차림\n(현재날씨 ${normalized} ℃)`;
  }, [clothingData?.temperature, data?.airQuality?.temp, enableClothingModalPreview]);

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
    const conditionContext = buildConditionContextValue(profile);
    setCoreEventContext({
      station_name: data?.airQuality?.stationName || location.stationName,
      reliability_status: data?.reliability?.status || "unknown",
      age_group: profile?.ageGroup,
      condition: conditionContext,
    });

    Sentry.setTag("station", data?.airQuality?.stationName || location.stationName);
    Sentry.setTag("reliability", data?.reliability?.status || "unknown");
    Sentry.setContext("profile", {
      ageGroup: profile?.ageGroup,
      condition: profile?.condition,
      conditions: normalizeKnownConditions(profile),
      customConditions: profile?.customConditions || [],
    });
  }, [
    data?.airQuality?.stationName,
    data?.reliability?.status,
    location.stationName,
    profile,
  ]);

  return (
    <main 
      className="min-h-screen p-3 md:p-4 transition-colors duration-500"
      style={{ backgroundColor: bgColor }}
      data-testid="home-main"
    >
      {/* Header */}
      <header className="max-w-2xl mx-auto mb-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pb-3 border-b-2 border-black">
        <div className="min-w-0 justify-self-start flex items-center gap-2 font-brand text-2xl font-black tracking-tight">
          <Image
            src="/icon.png"
            alt="아이숨 로고"
            width={28}
            height={28}
            className="h-7 w-7 rounded-md border border-black/10 bg-white object-cover"
            loading="eager"
          />
          <span>아이숨</span>
        </div>

        <LocationHeader
          currentLocation={displayRegion}
          isSearchOpen={isLocationModalOpen}
          onOpenSearch={() => setIsLocationModalOpen(true)}
          onCloseSearch={() => setIsLocationModalOpen(false)}
          onLocationSelect={handleLocationSelect}
        />
        
        <div className="justify-self-end">
          <button
            onClick={() => openSettingsModal("age")}
            className="p-2 rounded-full hover:bg-black/10 transition-all bento-card-sm bg-white"
            aria-label={isOnboarded ? "설정 변경" : "맞춤 설정 시작"}
            data-testid="settings-button"
          >
            <Settings size={24} />
          </button>
        </div>
      </header>

      <AiNotice />

      {snapshotMeta && (
        <section className="mx-auto mb-3 max-w-2xl" data-testid="stale-snapshot-banner">
          <div className="rounded-[20px] border-2 border-black bg-[#FFF1CC] px-4 py-3 shadow-bento-sm">
            <p className="text-[11px] font-black text-gray-700">복구 모드</p>
            <p className="mt-1 text-sm font-semibold text-gray-700">
              마지막 성공 데이터를 보여주고 있어요.
              {snapshotSavedAtLabel ? ` ${snapshotSavedAtLabel} 저장본` : ""}
              {snapshotMeta.stationName ? ` · ${snapshotMeta.stationName} 기준` : ""}
            </p>
            <button
              type="button"
              onClick={() => fetchData(location, profile, "retry")}
              className="mt-2 inline-flex min-h-10 items-center rounded-full border-2 border-black bg-white px-3 py-1.5 text-xs font-black text-black shadow-bento-sm transition hover:bg-gray-50"
            >
              최신 데이터 다시 시도
            </button>
          </div>
        </section>
      )}

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
          decisionText={data?.aiGuide?.summary ?? ""}
          reasonText={data?.aiGuide?.csvReason}
          maskRecommendation={data?.aiGuide?.maskRecommendation}
          grade={data?.airQuality?.grade || "NORMAL"}
          ageSummary={ageSummaryText}
          conditionSummary={conditionSummaryText}
          onOpenAgeModal={() => openSettingsModal("age")}
          isAgeButtonDisabled={isProfileRefreshing}
          onOpenConditionModal={() => openSettingsModal("condition")}
          isConditionButtonDisabled={isProfileRefreshing}
          onOpenClothingModal={enableClothingModalPreview ? handleOpenClothingModal : undefined}
          isClothingButtonDisabled={isClothingCardLoading}
          clothingButtonLabel={previewClothingButtonLabel}
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
        {shouldRenderActionChecklist && (
          <ActionChecklistCard
            actionItems={data?.aiGuide?.actionItems ?? []}
            delay={0.7}
            grade={data?.airQuality?.grade}
            isLoading={isProfileDataLoading}
          />
        )}

        {shouldRenderClothingCard && (
          <ClothingCard
            summary={clothingData?.summary}
            recommendation={clothingData?.recommendation}
            tips={clothingData?.tips}
            temperature={clothingData?.temperature ?? data?.airQuality?.temp}
            humidity={clothingData?.humidity ?? data?.airQuality?.humidity}
            delay={0.85}
            isLoading={isClothingCardLoading}
          />
        )}
        {/* Insight Drawer - Collapsible */}
        {shouldRenderInsightDrawer && (
          <InsightDrawer
            threeReason={data?.aiGuide?.threeReason}
            detailAnswer={data?.aiGuide?.detailAnswer}
            reasoning={data?.aiGuide?.detail}
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
            isLoading={isProfileDataLoading}
          />
        )}

        {/* Data Grid - Hidden by default */}
        {shouldRenderDataGrid && (
          <DataGrid
            data={{
              pm25: data?.airQuality?.pm25_value ?? null,
              pm10: data?.airQuality?.pm10_value ?? null,
              o3: data?.airQuality?.o3_value ?? null,
              temperature: data?.airQuality?.temp ?? null,
              humidity: data?.airQuality?.humidity ?? null,
              no2: data?.airQuality?.no2_value ?? null,
              co: data?.airQuality?.co_value ?? null,
              so2: data?.airQuality?.so2_value ?? null,
              khai: data?.airQuality?.khai_value ?? null,
              khaiGrade: data?.airQuality?.khai_grade ?? null,
              pm10Value24h: data?.airQuality?.pm10_value_24h ?? null,
              pm25Value24h: data?.airQuality?.pm25_value_24h ?? null,
              pm10Grade1h: data?.airQuality?.pm10_grade_1h ?? null,
              pm25Grade1h: data?.airQuality?.pm25_grade_1h ?? null,
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
            isLoading={isProfileDataLoading}
          />
        )}

        <LifestyleIndexCard
          data={forecastData?.lifestyleIndices}
          isLoading={isProfileDataLoading || isForecastLoading}
          delay={1.15}
        />
        </div>
      </div>

      {/* Sticky Share Button */}
      {shouldRenderShareButton && (
        <div className="fixed bottom-2 left-4 right-4 mx-auto max-w-2xl pb-[calc(env(safe-area-inset-bottom)+0.2rem)]">
          <ShareButton
            nickname={profile?.nickname}
            region={displayRegion}
            action={
              data?.aiGuide?.activityRecommendation?.includes("자제") ||
              data?.aiGuide?.activityRecommendation?.includes("X")
                ? "실내 놀이"
                : "신나는 외출"
            }
            summary={data?.aiGuide?.summary}
            reason={data?.aiGuide?.threeReason?.[0]}
            isLoading={isProfileDataLoading}
          />
        </div>
      )}

      <div className="max-w-2xl mx-auto mt-20 mb-20 space-y-3 text-center text-xs text-gray-600 font-medium">
        <p className="text-gray-500">
          본 서비스는 의료적 조언이 아니며 정보 제공을 목적으로 합니다.
          <br />
          증상이 있다면 반드시 전문 의료진과 상의하세요.
        </p>
      </div>

      <ProfileSettingsModal
        key={`settings-${settingsModalTab}-${profile?.ageGroup || "default"}-${profile?.condition || "none"}-${profile?.conditions?.join("_") || "none"}-${profile?.customConditions?.join("_") || "none"}-${isSettingsModalOpen ? "open" : "closed"}`}
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSubmit={handleSettingsSubmit}
        currentProfile={profile}
        initialTab={settingsModalTab}
      />

      {enableClothingModalPreview && (
        <ClothingDetailModal
          isOpen={isClothingModalOpen}
          onClose={() => setIsClothingModalOpen(false)}
          isLoading={isClothingLoading}
          summary={clothingData?.summary}
          recommendation={clothingData?.recommendation}
          tips={clothingData?.tips}
          temperature={clothingData?.temperature ?? data?.airQuality?.temp}
          humidity={clothingData?.humidity ?? data?.airQuality?.humidity}
          isForecastLoading={isForecastLoading}
          forecastItems={forecastData?.items}
          airQualityForecast={forecastData?.airQualityForecast}
          forecastStationName={
            displayRegion || forecastData?.requestedStation || data?.airQuality?.stationName || location.stationName
          }
          onRefresh={handleRefreshClothingModal}
        />
      )}

      {!isLoading && <InstallPrompt />}
    </main>
  );
}
