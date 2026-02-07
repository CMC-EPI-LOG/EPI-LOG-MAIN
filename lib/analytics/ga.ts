export const GA_ID =
  process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_GA4_ID || "";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: object[];
  }
}

export type GaEventParams = Record<
  string,
  string | number | boolean | null | undefined
>;

const ATTRIBUTION_STORAGE_KEY = "epilog:utm_attribution";
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

let sharedCoreContext: GaEventParams = {};

const canTrack = (gaId?: string) =>
  typeof window !== "undefined" && typeof window.gtag === "function" && !!gaId;

const sanitizeEventParams = (params?: GaEventParams): GaEventParams | undefined => {
  if (!params) return undefined;

  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (!entries.length) return undefined;

  return Object.fromEntries(entries);
};

const readStoredAttribution = (): GaEventParams => {
  if (typeof window === "undefined") return {};

  const raw =
    window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) ||
    window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);

  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as GaEventParams;
    return sanitizeEventParams(parsed) || {};
  } catch {
    return {};
  }
};

const writeAttribution = (attribution: GaEventParams) => {
  if (typeof window === "undefined") return;

  const safe = sanitizeEventParams(attribution) || {};
  const serialized = JSON.stringify(safe);
  window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, serialized);
  window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, serialized);
};

export const persistUtmAttribution = (queryString?: string) => {
  if (typeof window === "undefined") return;

  const search = queryString ?? window.location.search.slice(1);
  if (!search) return;

  const params = new URLSearchParams(search);
  const nextAttribution: GaEventParams = {};

  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) nextAttribution[key] = value;
  }

  if (!Object.keys(nextAttribution).length) return;

  const existing = readStoredAttribution();
  writeAttribution({
    ...existing,
    ...nextAttribution,
    utm_landing_path: (existing.utm_landing_path as string | undefined) || window.location.pathname,
  });
};

export const setCoreEventContext = (params?: GaEventParams) => {
  sharedCoreContext = sanitizeEventParams(params) || {};
};

export const trackPageview = (gaId: string, pagePath: string) => {
  if (!canTrack(gaId)) return;

  window.gtag?.("config", gaId, {
    page_path: pagePath,
    anonymize_ip: true,
  });
};

export const trackEvent = (
  gaId: string,
  eventName: string,
  params?: GaEventParams,
) => {
  if (!canTrack(gaId)) return;

  const safeParams = sanitizeEventParams(params);

  window.gtag?.("event", eventName, safeParams);
};

export const CORE_EVENT_NAMES = [
  "location_changed",
  "profile_changed",
  "insight_opened",
  "datagrid_opened",
  "share_clicked",
  "retry_clicked",
] as const;

export type CoreEventName = (typeof CORE_EVENT_NAMES)[number];

export const trackCoreEvent = (
  eventName: CoreEventName,
  params?: GaEventParams,
) => {
  if (!GA_ID) return;
  const mergedParams = sanitizeEventParams({
    ...readStoredAttribution(),
    ...sharedCoreContext,
    ...params,
    event_name: eventName,
  });
  trackEvent(GA_ID, eventName, mergedParams);
};
