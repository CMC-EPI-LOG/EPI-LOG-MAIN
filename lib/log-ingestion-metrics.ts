type MetricsState = {
  window_started_at: number;
  total_requests: number;
  total_5xx: number;
  total_received_events: number;
  total_dropped_events: number;
  total_pageviews: number;
  total_fallback_exposed: number;
  total_share_attempts: number;
  total_share_failures: number;
};

type MetricsThresholds = {
  windowMs: number;
  minRequestsFor5xx: number;
  minEventsForDropRate: number;
  minPageviewsForFallbackRatio: number;
  minShareAttemptsForFailureRatio: number;
  max5xxRate: number;
  maxDropRate: number;
  maxFallbackExposedRatio: number;
  maxShareFailureRatio: number;
};

export type LogIngestionSample = {
  statusCode: number;
  receivedEvents: number;
  droppedEvents: number;
  pageviews: number;
  fallbackExposed: number;
  shareAttempts: number;
  shareFailures: number;
};

export type LogIngestionSnapshot = {
  total_requests: number;
  total_5xx: number;
  total_received_events: number;
  total_dropped_events: number;
  total_pageviews: number;
  total_fallback_exposed: number;
  total_share_attempts: number;
  total_share_failures: number;
  rates: {
    api_log_5xx_rate: number;
    event_drop_rate: number;
    fallback_exposed_ratio: number;
    share_failure_ratio: number;
  };
  alerts: string[];
};

const DEFAULT_THRESHOLDS: MetricsThresholds = {
  windowMs: Number(process.env.LOG_ALERT_WINDOW_MS || 15 * 60 * 1000),
  minRequestsFor5xx: Number(process.env.LOG_ALERT_MIN_REQUESTS_5XX || 50),
  minEventsForDropRate: Number(process.env.LOG_ALERT_MIN_EVENTS_DROP || 100),
  minPageviewsForFallbackRatio: Number(process.env.LOG_ALERT_MIN_PAGEVIEWS_FALLBACK || 100),
  minShareAttemptsForFailureRatio: Number(process.env.LOG_ALERT_MIN_SHARE_ATTEMPTS || 50),
  max5xxRate: Number(process.env.LOG_ALERT_MAX_5XX_RATE || 0.01),
  maxDropRate: Number(process.env.LOG_ALERT_MAX_DROP_RATE || 0.02),
  maxFallbackExposedRatio: Number(process.env.LOG_ALERT_MAX_FALLBACK_EXPOSED_RATIO || 0.2),
  maxShareFailureRatio: Number(process.env.LOG_ALERT_MAX_SHARE_FAILURE_RATIO || 0.08),
};

const globalForMetrics = globalThis as typeof globalThis & {
  __logIngestionMetricsState?: MetricsState;
};

function createInitialState(now = Date.now()): MetricsState {
  return {
    window_started_at: now,
    total_requests: 0,
    total_5xx: 0,
    total_received_events: 0,
    total_dropped_events: 0,
    total_pageviews: 0,
    total_fallback_exposed: 0,
    total_share_attempts: 0,
    total_share_failures: 0,
  };
}

function getState(now = Date.now()): MetricsState {
  const existing = globalForMetrics.__logIngestionMetricsState;
  if (!existing) {
    const created = createInitialState(now);
    globalForMetrics.__logIngestionMetricsState = created;
    return created;
  }

  if (now - existing.window_started_at > DEFAULT_THRESHOLDS.windowMs) {
    const refreshed = createInitialState(now);
    globalForMetrics.__logIngestionMetricsState = refreshed;
    return refreshed;
  }

  return existing;
}

function toRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function recordLogIngestionMetrics(sample: LogIngestionSample): LogIngestionSnapshot {
  const now = Date.now();
  const state = getState(now);

  state.total_requests += 1;
  if (sample.statusCode >= 500) {
    state.total_5xx += 1;
  }
  state.total_received_events += Math.max(0, sample.receivedEvents);
  state.total_dropped_events += Math.max(0, sample.droppedEvents);
  state.total_pageviews += Math.max(0, sample.pageviews);
  state.total_fallback_exposed += Math.max(0, sample.fallbackExposed);
  state.total_share_attempts += Math.max(0, sample.shareAttempts);
  state.total_share_failures += Math.max(0, sample.shareFailures);

  const api5xxRate = toRate(state.total_5xx, state.total_requests);
  const dropRate = toRate(state.total_dropped_events, state.total_received_events);
  const fallbackRatio = toRate(state.total_fallback_exposed, state.total_pageviews);
  const shareFailureRatio = toRate(state.total_share_failures, state.total_share_attempts);

  const alerts: string[] = [];
  if (
    state.total_requests >= DEFAULT_THRESHOLDS.minRequestsFor5xx &&
    api5xxRate > DEFAULT_THRESHOLDS.max5xxRate
  ) {
    alerts.push('api_log_5xx_rate');
  }
  if (
    state.total_received_events >= DEFAULT_THRESHOLDS.minEventsForDropRate &&
    dropRate > DEFAULT_THRESHOLDS.maxDropRate
  ) {
    alerts.push('event_drop_rate');
  }
  if (
    state.total_pageviews >= DEFAULT_THRESHOLDS.minPageviewsForFallbackRatio &&
    fallbackRatio > DEFAULT_THRESHOLDS.maxFallbackExposedRatio
  ) {
    alerts.push('fallback_exposed_ratio');
  }
  if (
    state.total_share_attempts >= DEFAULT_THRESHOLDS.minShareAttemptsForFailureRatio &&
    shareFailureRatio > DEFAULT_THRESHOLDS.maxShareFailureRatio
  ) {
    alerts.push('share_failure_ratio');
  }

  return {
    total_requests: state.total_requests,
    total_5xx: state.total_5xx,
    total_received_events: state.total_received_events,
    total_dropped_events: state.total_dropped_events,
    total_pageviews: state.total_pageviews,
    total_fallback_exposed: state.total_fallback_exposed,
    total_share_attempts: state.total_share_attempts,
    total_share_failures: state.total_share_failures,
    rates: {
      api_log_5xx_rate: api5xxRate,
      event_drop_rate: dropRate,
      fallback_exposed_ratio: fallbackRatio,
      share_failure_ratio: shareFailureRatio,
    },
    alerts,
  };
}
