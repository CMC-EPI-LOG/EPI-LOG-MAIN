import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbConnect } from '@/lib/mongoose';
import { EventLog } from '@/models/EventLog';
import { SessionSummary } from '@/models/SessionSummary';
import { corsHeaders } from '@/lib/cors';
import { withApiObservability, logStructuredInfo, logStructuredWarn } from '@/lib/api-observability';
import { recordLogIngestionMetrics } from '@/lib/log-ingestion-metrics';

export const runtime = 'nodejs';

const LOG_SCHEMA_VERSION = '2.0.0';
const MAX_BATCH_SIZE = 100;

let hasWarnedMissingMongoUri = false;

const MetadataSchema = z.record(z.string(), z.unknown());

const LogEventSchema = z.object({
  event_id: z.string().min(8).max(128),
  schema_version: z.string().min(1).max(32).default(LOG_SCHEMA_VERSION),
  session_id: z.string().min(1).max(128),
  event_name: z.string().min(1).max(120),
  client_ts: z.string().datetime({ offset: true }),
  entry_source: z.string().min(1).max(64).default('unknown'),
  deployment_id: z.string().min(1).max(128).optional().nullable(),
  toss_app_version: z.string().min(1).max(64).optional().nullable(),
  route: z.string().min(1).max(512).default('/'),
  source: z.string().min(1).max(128).optional().nullable(),
  shared_by: z.string().min(1).max(128).optional().nullable(),
  metadata: MetadataSchema.default({}),
});

const LogBatchSchema = z.object({
  schema_version: z.string().min(1).max(32).optional(),
  sent_at: z.string().datetime({ offset: true }).optional(),
  events: z.array(LogEventSchema).min(1).max(MAX_BATCH_SIZE),
});

const LegacyLogBodySchema = z.object({
  session_id: z.string().min(1).max(128),
  source: z.string().min(1).max(128).optional(),
  shared_by: z.string().min(1).max(128).optional(),
  event_name: z.string().min(1).max(120),
  metadata: MetadataSchema.optional(),
});

type LogEventPayload = z.infer<typeof LogEventSchema>;

const isMongoConfigured = () => {
  const uri = process.env.MONGODB_URI;
  return typeof uri === 'string' && uri.trim().length > 0;
};

const warnMissingMongoUriOnce = () => {
  if (hasWarnedMissingMongoUri) return;
  hasWarnedMissingMongoUri = true;
  console.warn('[api/log] skip persistence: MONGODB_URI is not configured');
};

function responseHeaders(requestId: string) {
  return {
    ...corsHeaders(),
    'x-request-id': requestId,
  };
}

function errorResponse(
  requestId: string,
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json(
    {
      ok: false,
      request_id: requestId,
      error: {
        code,
        message,
        details,
      },
    },
    {
      status,
      headers: responseHeaders(requestId),
    },
  );
}

function normalizeLegacyEvent(raw: z.infer<typeof LegacyLogBodySchema>): LogEventPayload {
  const nowIso = new Date().toISOString();
  const metadata = raw.metadata || {};
  const route = typeof metadata.route === 'string' ? metadata.route : '/';
  const entrySource =
    typeof metadata.entry_source === 'string'
      ? metadata.entry_source
      : raw.source || 'legacy';
  const deploymentId =
    typeof metadata.deployment_id === 'string' ? metadata.deployment_id : null;
  const tossAppVersion =
    typeof metadata.toss_app_version === 'string'
      ? metadata.toss_app_version
      : null;
  const eventId =
    typeof metadata.event_id === 'string' ? metadata.event_id : randomUUID();

  return {
    event_id: eventId,
    schema_version: '1.legacy',
    session_id: raw.session_id,
    event_name: raw.event_name,
    client_ts: nowIso,
    entry_source: entrySource,
    deployment_id: deploymentId,
    toss_app_version: tossAppVersion,
    route,
    source: raw.source || null,
    shared_by: raw.shared_by || null,
    metadata,
  };
}

function parseLogEvents(
  body: unknown,
): { events: LogEventPayload[]; normalized_from_legacy: boolean } | { error: unknown } {
  const batch = LogBatchSchema.safeParse(body);
  if (batch.success) {
    return {
      events: batch.data.events,
      normalized_from_legacy: false,
    };
  }

  const legacy = LegacyLogBodySchema.safeParse(body);
  if (legacy.success) {
    return {
      events: [normalizeLegacyEvent(legacy.data)],
      normalized_from_legacy: true,
    };
  }

  return {
    error: {
      batch_issues: batch.error.issues,
      legacy_issues: legacy.error.issues,
    },
  };
}

function toDate(isoValue: string): Date {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function analyzeSignals(events: LogEventPayload[]) {
  let pageviews = 0;
  let fallbackExposed = 0;
  let shareAttempts = 0;
  let shareFailures = 0;

  for (const event of events) {
    if (event.event_name === 'miniapp_pageview') {
      pageviews += 1;
    }
    if (event.event_name === 'fallback_exposed') {
      fallbackExposed += 1;
    }
    if (event.event_name === 'share_result') {
      shareAttempts += 1;
      const result = event.metadata?.result;
      if (typeof result === 'string' && result === 'error') {
        shareFailures += 1;
      }
    }
  }

  return { pageviews, fallbackExposed, shareAttempts, shareFailures };
}

type SessionAggregate = {
  session_id: string;
  source: string | null;
  shared_by: string | null;
  entry_source: string;
  deployment_id: string | null;
  toss_app_version: string | null;
  first_client_ts: Date;
  last_client_ts: Date;
  first_server_ts: Date;
  last_server_ts: Date;
  last_event_name: string;
  event_count: number;
};

type EventDocument = Omit<LogEventPayload, "client_ts"> & {
  client_ts: Date;
  server_ts: Date;
  request_id: string;
  created_at: Date;
};

function buildSessionAggregates(events: EventDocument[]) {
  const grouped = new Map<string, SessionAggregate>();

  for (const event of events) {
    const clientTs = event.client_ts;
    const existing = grouped.get(event.session_id);
    if (!existing) {
      grouped.set(event.session_id, {
        session_id: event.session_id,
        source: event.source || null,
        shared_by: event.shared_by || null,
        entry_source: event.entry_source || 'unknown',
        deployment_id: event.deployment_id || null,
        toss_app_version: event.toss_app_version || null,
        first_client_ts: clientTs,
        last_client_ts: clientTs,
        first_server_ts: event.server_ts,
        last_server_ts: event.server_ts,
        last_event_name: event.event_name,
        event_count: 1,
      });
      continue;
    }

    if (clientTs < existing.first_client_ts) {
      existing.first_client_ts = clientTs;
    }
    if (clientTs >= existing.last_client_ts) {
      existing.last_client_ts = clientTs;
      existing.last_event_name = event.event_name;
    }
    if (event.server_ts < existing.first_server_ts) {
      existing.first_server_ts = event.server_ts;
    }
    if (event.server_ts > existing.last_server_ts) {
      existing.last_server_ts = event.server_ts;
    }
    existing.event_count += 1;
  }

  return Array.from(grouped.values());
}

async function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function handlePost(request: Request) {
  const requestId = request.headers.get('x-request-id') || randomUUID();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    recordLogIngestionMetrics({
      statusCode: 400,
      receivedEvents: 0,
      droppedEvents: 0,
      pageviews: 0,
      fallbackExposed: 0,
      shareAttempts: 0,
      shareFailures: 0,
    });
    return errorResponse(
      requestId,
      'INVALID_JSON',
      'Request body must be a valid JSON payload.',
      400,
    );
  }

  const parsed = parseLogEvents(body);
  if ('error' in parsed) {
    recordLogIngestionMetrics({
      statusCode: 400,
      receivedEvents: 0,
      droppedEvents: 0,
      pageviews: 0,
      fallbackExposed: 0,
      shareAttempts: 0,
      shareFailures: 0,
    });
    return errorResponse(
      requestId,
      'INVALID_PAYLOAD',
      `Payload must match either legacy schema or V2 batch schema (max ${MAX_BATCH_SIZE} events).`,
      400,
      parsed.error,
    );
  }

  const events = parsed.events;
  const signalSummary = analyzeSignals(events);

  if (!isMongoConfigured()) {
    warnMissingMongoUriOnce();
    const snapshot = recordLogIngestionMetrics({
      statusCode: 202,
      receivedEvents: events.length,
      droppedEvents: events.length,
      ...signalSummary,
    });
    logStructuredWarn('log.ingestion.skipped', {
      request_id: requestId,
      received_count: events.length,
      dropped_count: events.length,
      rates: snapshot.rates,
      alerts: snapshot.alerts,
      normalized_from_legacy: parsed.normalized_from_legacy,
      reason: 'MONGODB_URI missing',
    });

    return NextResponse.json(
      {
        ok: true,
        request_id: requestId,
        skipped: true,
        error: {
          code: 'MONGO_NOT_CONFIGURED',
          message: 'MONGODB_URI is not configured.',
        },
      },
      {
        status: 202,
        headers: responseHeaders(requestId),
      },
    );
  }

  const serverTs = new Date();
  const eventDocuments: EventDocument[] = events.map((event) => ({
    ...event,
    client_ts: toDate(event.client_ts),
    server_ts: serverTs,
    source: event.source || null,
    shared_by: event.shared_by || null,
    deployment_id: event.deployment_id || null,
    toss_app_version: event.toss_app_version || null,
    request_id: requestId,
    created_at: serverTs,
  }));

  try {
    await dbConnect();

    const eventOps = eventDocuments.map((event) => ({
      updateOne: {
        filter: { event_id: event.event_id },
        update: { $setOnInsert: event },
        upsert: true,
      },
    }));

    const eventBulkResult = await EventLog.bulkWrite(eventOps, { ordered: false });
    const upsertedIndexes = Object.keys(eventBulkResult.upsertedIds || {})
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const insertedEvents = upsertedIndexes
      .map((index) => eventDocuments[index])
      .filter((event): event is (typeof eventDocuments)[number] => Boolean(event));
    const dedupedCount = Math.max(0, eventDocuments.length - insertedEvents.length);

    const sessionAggregates = buildSessionAggregates(insertedEvents);
    if (sessionAggregates.length > 0) {
      const summaryOps = sessionAggregates.map((item) => ({
        updateOne: {
          filter: { session_id: item.session_id },
          update: {
            $setOnInsert: {
              session_id: item.session_id,
              source: item.source,
              shared_by: item.shared_by,
              entry_source: item.entry_source,
              deployment_id: item.deployment_id,
              toss_app_version: item.toss_app_version,
              first_client_ts: item.first_client_ts,
              first_server_ts: item.first_server_ts,
              created_at: serverTs,
            },
            $set: {
              last_client_ts: item.last_client_ts,
              last_server_ts: item.last_server_ts,
              last_event_name: item.last_event_name,
              updated_at: serverTs,
            },
            $inc: {
              event_count: item.event_count,
            },
          },
          upsert: true,
        },
      }));

      await SessionSummary.bulkWrite(summaryOps, { ordered: false });
    }

    const snapshot = recordLogIngestionMetrics({
      statusCode: 200,
      receivedEvents: events.length,
      droppedEvents: 0,
      ...signalSummary,
    });

    logStructuredInfo('log.ingestion.stored', {
      request_id: requestId,
      received_count: events.length,
      stored_count: insertedEvents.length,
      deduped_count: dedupedCount,
      dropped_count: 0,
      normalized_from_legacy: parsed.normalized_from_legacy,
      rates: snapshot.rates,
      alerts: snapshot.alerts,
    });

    if (snapshot.alerts.length > 0) {
      logStructuredWarn('log.ingestion.alert_threshold_exceeded', {
        request_id: requestId,
        alerts: snapshot.alerts,
        rates: snapshot.rates,
        totals: {
          total_requests: snapshot.total_requests,
          total_received_events: snapshot.total_received_events,
          total_dropped_events: snapshot.total_dropped_events,
          total_pageviews: snapshot.total_pageviews,
          total_fallback_exposed: snapshot.total_fallback_exposed,
          total_share_attempts: snapshot.total_share_attempts,
          total_share_failures: snapshot.total_share_failures,
        },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        request_id: requestId,
        schema_version: LOG_SCHEMA_VERSION,
        received_count: events.length,
        accepted_count: events.length,
        stored_count: insertedEvents.length,
        deduped_count: dedupedCount,
        dropped_count: 0,
        accepted_event_ids: events.map((event) => event.event_id),
      },
      {
        headers: responseHeaders(requestId),
      },
    );
  } catch (error) {
    const snapshot = recordLogIngestionMetrics({
      statusCode: 500,
      receivedEvents: events.length,
      droppedEvents: events.length,
      ...signalSummary,
    });

    logStructuredWarn('log.ingestion.failed', {
      request_id: requestId,
      received_count: events.length,
      dropped_count: events.length,
      rates: snapshot.rates,
      alerts: snapshot.alerts,
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(
      requestId,
      'INGESTION_FAILED',
      'Failed to persist log events.',
      500,
    );
  }
}

export const OPTIONS = withApiObservability('/api/log', 'OPTIONS', handleOptions);
export const POST = withApiObservability('/api/log', 'POST', handlePost);
