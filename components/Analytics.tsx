"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface AnalyticsProps {
  gaId: string;
}

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: unknown[];
  }
}

export default function Analytics({ gaId }: AnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString();

  useEffect(() => {
    if (!gaId || typeof window === "undefined" || !window.gtag) return;

    const pagePath = query ? `${pathname}?${query}` : pathname;
    window.gtag("config", gaId, { page_path: pagePath });
  }, [gaId, pathname, query]);

  return null;
}
