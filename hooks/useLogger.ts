"use client";

import { useCallback, useEffect } from "react";

const SESSION_KEY = "session_id";
const SOURCE_KEY = "source";

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // Modern browsers
    return crypto.randomUUID();
  }
  // Fallback: good enough for MVP attribution
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getOrCreateSessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = createSessionId();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

function readRefFromUrl() {
  try {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    return ref?.trim() ? ref.trim() : null;
  } catch {
    return null;
  }
}

export function useLogger() {
  const logEvent = useCallback(async (event_name: string, metadata?: Record<string, unknown>) => {
    try {
      const session_id = getOrCreateSessionId();
      const source = localStorage.getItem(SOURCE_KEY) || undefined;

      await fetch("/api/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, source, event_name, metadata }),
      });
    } catch (err) {
      console.error("[useLogger] logEvent failed:", err);
    }
  }, []);

  useEffect(() => {
    try {
      getOrCreateSessionId();

      const ref = readRefFromUrl();
      if (ref) localStorage.setItem(SOURCE_KEY, ref);

      void logEvent("landing_view");
    } catch (err) {
      console.error("[useLogger] init failed:", err);
    }
  }, [logEvent]);

  return { logEvent };
}

