"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { persistUtmAttribution, trackPageview } from "@/lib/analytics/ga";

interface AnalyticsProps {
  gaId: string;
}

export default function Analytics({ gaId }: AnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString();
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    persistUtmAttribution(query || undefined);
    const pagePath = query ? `${pathname}?${query}` : pathname;
    if (!hasTrackedRef.current) {
      hasTrackedRef.current = true;
      return;
    }

    trackPageview(gaId, pagePath);
  }, [gaId, pathname, query]);

  return null;
}
