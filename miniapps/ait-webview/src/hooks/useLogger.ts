"use client";

import { useCallback, useEffect, useRef } from "react";
import { getTossAppVersion } from "@apps-in-toss/web-framework";
import { apiUrl } from "@/lib/apiBase";

const SESSION_KEY = "session_id";
const SOURCE_KEY = "source";
const SHARED_BY_KEY = "shared_by";
const ADDRESS_CONSENT_KEY = "address_consent";
const INIT_KEY = "__aisoom_log_logger_init_v1";
const SESSION_START_KEY = "__aisoom_log_session_start_ts_v1";
const EXIT_SENT_KEY = "__aisoom_log_session_exit_sent_v1";
const DEPLOYMENT_ID_KEY = "__aisoom_log_deployment_id_v1";
const TOSS_APP_VERSION_KEY = "__aisoom_log_toss_app_version_v1";
const QUEUE_KEY = "__aisoom_log_queue_v2";
const SEEN_EVENT_IDS_KEY = "__aisoom_log_seen_event_ids_v2";
const LEGACY_INIT_KEY = "__epi_log_logger_init_v1";
const LEGACY_SESSION_START_KEY = "__epi_log_session_start_ts_v1";
const LEGACY_EXIT_SENT_KEY = "__epi_log_session_exit_sent_v1";

const LOG_SCHEMA_VERSION = "2.0.0";
const MAX_QUEUE_SIZE = 400;
const MAX_BATCH_SIZE = 30;
const MAX_RETRY_COUNT = 5;
const MAX_SEEN_EVENT_IDS = 2000;
const FLUSH_INTERVAL_MS = 5000;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;

type LogEventPayload = {
  event_id: string;
  schema_version: string;
  session_id: string;
  event_name: string;
  client_ts: string;
  entry_source: string;
  deployment_id: string | null;
  toss_app_version: string | null;
  route: string;
  source: string | null;
  shared_by: string | null;
  metadata: Record<string, unknown>;
};

type QueuedLogEvent = {
  event: LogEventPayload;
  retries: number;
  enqueued_at: string;
};

type FlushMode = "default" | "beacon";

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function readSharedByFromUrl() {
  try {
    const url = new URL(window.location.href);
    const sharedBy = url.searchParams.get("shared_by");
    return sharedBy?.trim() ? sharedBy.trim() : null;
  } catch {
    return null;
  }
}

function resolveEntrySource() {
  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    return (
      params.get("utm_source") ||
      params.get("ref") ||
      params.get("source") ||
      (params.get("shared_by") ? "share" : localStorage.getItem(SOURCE_KEY) || "direct")
    );
  } catch {
    return localStorage.getItem(SOURCE_KEY) || "direct";
  }
}

function resolveRoute() {
  return `${window.location.pathname}${window.location.search}`;
}

function resolveDeploymentId() {
  const stored = sessionStorage.getItem(DEPLOYMENT_ID_KEY) || localStorage.getItem(DEPLOYMENT_ID_KEY);
  if (stored) return stored;

  try {
    const url = new URL(window.location.href);
    const deploymentId = url.searchParams.get("_deploymentId")?.trim();
    if (!deploymentId) return null;
    sessionStorage.setItem(DEPLOYMENT_ID_KEY, deploymentId);
    localStorage.setItem(DEPLOYMENT_ID_KEY, deploymentId);
    return deploymentId;
  } catch {
    return null;
  }
}

function resolveTossVersion() {
  const stored = sessionStorage.getItem(TOSS_APP_VERSION_KEY) || localStorage.getItem(TOSS_APP_VERSION_KEY);
  if (stored) return stored;

  try {
    const version = getTossAppVersion();
    if (!version || !version.trim()) return null;
    sessionStorage.setItem(TOSS_APP_VERSION_KEY, version);
    localStorage.setItem(TOSS_APP_VERSION_KEY, version);
    return version;
  } catch {
    return null;
  }
}

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {};

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

function buildLogEvent(eventName: string, metadata?: Record<string, unknown>): LogEventPayload {
  const session_id = getOrCreateSessionId();
  const source = localStorage.getItem(SOURCE_KEY) || null;
  const shared_by = localStorage.getItem(SHARED_BY_KEY) || null;

  return {
    event_id: createEventId(),
    schema_version: LOG_SCHEMA_VERSION,
    session_id,
    event_name: eventName,
    client_ts: new Date().toISOString(),
    entry_source: resolveEntrySource(),
    deployment_id: resolveDeploymentId(),
    toss_app_version: resolveTossVersion(),
    route: resolveRoute(),
    source,
    shared_by,
    metadata: sanitizeMetadata(metadata),
  };
}

function readSessionValue(key: string, legacyKey: string) {
  const current = sessionStorage.getItem(key);
  if (current !== null) return current;

  const legacy = sessionStorage.getItem(legacyKey);
  if (legacy !== null) {
    sessionStorage.setItem(key, legacy);
    sessionStorage.removeItem(legacyKey);
  }
  return legacy;
}

function writeSessionValue(key: string, value: string, legacyKey: string) {
  sessionStorage.setItem(key, value);
  sessionStorage.removeItem(legacyKey);
}

function readQueueFromStorage(): QueuedLogEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as Partial<QueuedLogEvent>;
        if (!candidate.event || typeof candidate.event !== "object") return null;

        const event = candidate.event as Partial<LogEventPayload>;
        if (!event.event_id || !event.event_name || !event.session_id || !event.client_ts) return null;

        return {
          event: {
            event_id: event.event_id,
            schema_version: event.schema_version || LOG_SCHEMA_VERSION,
            session_id: event.session_id,
            event_name: event.event_name,
            client_ts: event.client_ts,
            entry_source: event.entry_source || "unknown",
            deployment_id: event.deployment_id || null,
            toss_app_version: event.toss_app_version || null,
            route: event.route || "/",
            source: event.source || null,
            shared_by: event.shared_by || null,
            metadata: sanitizeMetadata(event.metadata as Record<string, unknown> | undefined),
          },
          retries:
            typeof candidate.retries === "number" && Number.isFinite(candidate.retries)
              ? Math.max(0, Math.floor(candidate.retries))
              : 0,
          enqueued_at:
            typeof candidate.enqueued_at === "string"
              ? candidate.enqueued_at
              : new Date().toISOString(),
        } satisfies QueuedLogEvent;
      })
      .filter((value): value is QueuedLogEvent => value !== null)
      .slice(-MAX_QUEUE_SIZE);
  } catch {
    return [];
  }
}

function writeQueueToStorage(queue: QueuedLogEvent[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
  } catch {
    // ignore
  }
}

function readSeenEventIds() {
  try {
    const raw = sessionStorage.getItem(SEEN_EVENT_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((value): value is string => typeof value === "string")
      .slice(-MAX_SEEN_EVENT_IDS);
  } catch {
    return [];
  }
}

function writeSeenEventIds(ids: string[]) {
  try {
    sessionStorage.setItem(SEEN_EVENT_IDS_KEY, JSON.stringify(ids.slice(-MAX_SEEN_EVENT_IDS)));
  } catch {
    // ignore
  }
}

function buildBatchPayload(events: LogEventPayload[]) {
  return {
    schema_version: LOG_SCHEMA_VERSION,
    sent_at: new Date().toISOString(),
    events,
  };
}

export function useLogger() {
  const queueRef = useRef<QueuedLogEvent[]>([]);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const flushInFlightRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const flushIntervalRef = useRef<number | null>(null);

  const persistState = useCallback(() => {
    writeQueueToStorage(queueRef.current);
    writeSeenEventIds(Array.from(seenEventIdsRef.current));
  }, []);

  const markEventSeen = useCallback((eventId: string) => {
    seenEventIdsRef.current.add(eventId);
    if (seenEventIdsRef.current.size <= MAX_SEEN_EVENT_IDS) return;

    while (seenEventIdsRef.current.size > MAX_SEEN_EVENT_IDS) {
      const oldest = seenEventIdsRef.current.values().next().value;
      if (!oldest) break;
      seenEventIdsRef.current.delete(oldest);
    }
  }, []);

  const scheduleRetryFlush = useCallback((maxRetryCount: number, triggerFlush: () => void) => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const delay = Math.min(
      RETRY_MAX_DELAY_MS,
      RETRY_BASE_DELAY_MS * 2 ** Math.max(0, Math.min(maxRetryCount, MAX_RETRY_COUNT)),
    );

    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      triggerFlush();
    }, delay);
  }, []);

  const flushQueue = useCallback(async (mode: FlushMode = "default") => {
    if (flushInFlightRef.current) return;
    if (queueRef.current.length === 0) return;

    const batch = queueRef.current.slice(0, MAX_BATCH_SIZE);
    const payload = buildBatchPayload(batch.map((item) => item.event));
    const endpoint = apiUrl("/api/log");

    if (mode === "beacon" && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        const queued = navigator.sendBeacon(endpoint, blob);
        if (queued) {
          const acceptedIds = new Set(batch.map((item) => item.event.event_id));
          queueRef.current = queueRef.current.filter((item) => !acceptedIds.has(item.event.event_id));
          batch.forEach((item) => markEventSeen(item.event.event_id));
          persistState();
        }
        return;
      } catch {
        // continue to fetch fallback
      }
    }

    flushInFlightRef.current = true;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });

      if (!response.ok) {
        throw new Error(`log_ingestion_http_${response.status}`);
      }

      const parsed = (await response.json().catch(() => ({}))) as {
        accepted_event_ids?: string[];
      };
      const acceptedIds = new Set(
        Array.isArray(parsed.accepted_event_ids)
          ? parsed.accepted_event_ids
          : batch.map((item) => item.event.event_id),
      );

      queueRef.current = queueRef.current.filter((item) => {
        if (!acceptedIds.has(item.event.event_id)) return true;
        markEventSeen(item.event.event_id);
        return false;
      });
      persistState();
    } catch (err) {
      const batchedIds = new Set(batch.map((item) => item.event.event_id));
      let maxRetry = 0;

      queueRef.current = queueRef.current.flatMap((item) => {
        if (!batchedIds.has(item.event.event_id)) return [item];

        const retries = item.retries + 1;
        maxRetry = Math.max(maxRetry, retries);
        if (retries > MAX_RETRY_COUNT) {
          console.warn("[useLogger] dropping log event after max retries", {
            event_id: item.event.event_id,
            event_name: item.event.event_name,
          });
          markEventSeen(item.event.event_id);
          return [];
        }
        return [{ ...item, retries }];
      });

      persistState();
      scheduleRetryFlush(maxRetry, () => {
        void flushQueue();
      });
      console.error("[useLogger] flushQueue failed:", err);
    } finally {
      flushInFlightRef.current = false;
    }
  }, [markEventSeen, persistState, scheduleRetryFlush]);

  const enqueueEvent = useCallback((event: LogEventPayload) => {
    if (seenEventIdsRef.current.has(event.event_id)) return;
    if (queueRef.current.some((item) => item.event.event_id === event.event_id)) return;

    queueRef.current.push({
      event,
      retries: 0,
      enqueued_at: new Date().toISOString(),
    });

    if (queueRef.current.length > MAX_QUEUE_SIZE) {
      const overflow = queueRef.current.length - MAX_QUEUE_SIZE;
      const dropped = queueRef.current.splice(0, overflow);
      dropped.forEach((item) => markEventSeen(item.event.event_id));
      console.warn("[useLogger] queue overflow, dropped oldest events", {
        dropped_count: dropped.length,
      });
    }

    persistState();
  }, [markEventSeen, persistState]);

  const logEvent = useCallback(async (event_name: string, metadata?: Record<string, unknown>) => {
    try {
      const event = buildLogEvent(event_name, metadata);
      enqueueEvent(event);
      void flushQueue();
    } catch (err) {
      console.error("[useLogger] logEvent failed:", err);
    }
  }, [enqueueEvent, flushQueue]);

  const logAddressConsent = useCallback(
    async (agreed: boolean) => {
      try {
        const next = agreed ? "true" : "false";
        const prev = localStorage.getItem(ADDRESS_CONSENT_KEY);
        if (prev === next) return;

        localStorage.setItem(ADDRESS_CONSENT_KEY, next);
        await logEvent("address_consent", { agreed });
      } catch (err) {
        console.error("[useLogger] logAddressConsent failed:", err);
      }
    },
    [logEvent],
  );

  useEffect(() => {
    queueRef.current = readQueueFromStorage();
    seenEventIdsRef.current = new Set(readSeenEventIds());

    if (flushIntervalRef.current !== null) {
      window.clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
    flushIntervalRef.current = window.setInterval(() => {
      void flushQueue();
    }, FLUSH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushQueue("beacon");
      } else {
        void flushQueue();
      }
    };
    const onPageHide = () => {
      void flushQueue("beacon");
    };
    const onOnline = () => {
      void flushQueue();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);

    void flushQueue();

    return () => {
      if (flushIntervalRef.current !== null) {
        window.clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
    };
  }, [flushQueue]);

  useEffect(() => {
    try {
      if (readSessionValue(INIT_KEY, LEGACY_INIT_KEY)) return;
      writeSessionValue(INIT_KEY, "1", LEGACY_INIT_KEY);

      getOrCreateSessionId();

      const ref = readRefFromUrl();
      if (ref) localStorage.setItem(SOURCE_KEY, ref);

      const sharedBy = readSharedByFromUrl();
      if (sharedBy && !localStorage.getItem(SHARED_BY_KEY)) {
        localStorage.setItem(SHARED_BY_KEY, sharedBy);
      }

      void logEvent("landing_view");
    } catch (err) {
      console.error("[useLogger] init failed:", err);
    }
  }, [logEvent]);

  useEffect(() => {
    try {
      const startRaw = readSessionValue(SESSION_START_KEY, LEGACY_SESSION_START_KEY);
      const startTs = startRaw ? Number(startRaw) : Date.now();
      if (!startRaw) writeSessionValue(SESSION_START_KEY, String(startTs), LEGACY_SESSION_START_KEY);

      const sendExit = (reason: "pagehide" | "hidden") => {
        try {
          if (readSessionValue(EXIT_SENT_KEY, LEGACY_EXIT_SENT_KEY)) return;
          writeSessionValue(EXIT_SENT_KEY, "1", LEGACY_EXIT_SENT_KEY);

          const duration_ms = Math.max(0, Date.now() - startTs);
          void logEvent("session_end", {
            duration_ms,
            reason,
            path: window.location.pathname,
          });
          void flushQueue("beacon");
        } catch (err) {
          console.error("[useLogger] exit log failed:", err);
        }
      };

      const onPageHide = () => sendExit("pagehide");
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") sendExit("hidden");
      };

      window.addEventListener("pagehide", onPageHide);
      document.addEventListener("visibilitychange", onVisibilityChange);

      return () => {
        window.removeEventListener("pagehide", onPageHide);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    } catch (err) {
      console.error("[useLogger] exit tracking init failed:", err);
      return;
    }
  }, [flushQueue, logEvent]);

  return { logEvent, logAddressConsent };
}
