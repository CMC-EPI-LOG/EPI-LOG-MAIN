export const GA_ID =
  process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_GA4_ID || "";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: Object[];
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
