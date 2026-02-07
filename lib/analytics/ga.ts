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

const canTrack = (gaId?: string) =>
  typeof window !== "undefined" && typeof window.gtag === "function" && !!gaId;

export const sanitizeEventParams = (params?: GaEventParams) => params;

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
  trackEvent(GA_ID, eventName, params);
};
