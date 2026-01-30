"use client";

import { useCallback } from "react";
import { GA_ID, trackEvent, type GaEventParams } from "@/lib/analytics/ga";

export const useTrackEvent = (gaId: string = GA_ID) =>
  useCallback(
    (eventName: string, params?: GaEventParams) => {
      if (!gaId) return;
      trackEvent(gaId, eventName, params);
    },
    [gaId],
  );
