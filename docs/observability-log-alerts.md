# Logging V2 And Alert Thresholds

## Event Schema V2

Client events sent to `/api/log` use the following fields:

- `event_id`
- `schema_version`
- `session_id`
- `event_name`
- `client_ts`
- `entry_source`
- `deployment_id`
- `toss_app_version`
- `route`
- `source`
- `shared_by`
- `metadata`

Server enrichment:

- `request_id`
- `server_ts`

## Storage

- `EventLog`: one document per event (`event_id`-deduplicated)
- `SessionSummary`: session-level aggregate (`event_count`, first/last timestamps, attribution fields)

## Alert Metrics (rolling window)

Window and thresholds are configurable with env vars in `lib/log-ingestion-metrics.ts`.

Default thresholds:

- `/api/log` `5xx rate`: alert when > `1%` with at least `50` requests
- `event_drop_rate`: alert when > `2%` with at least `100` received events
- `fallback_exposed_ratio`: alert when > `20%` with at least `100` pageviews
- `share_failure_ratio`: alert when > `8%` with at least `50` share attempts

## Structured Logs

All API routes emit JSON structured logs through `withApiObservability`:

- `api.request`
- `api.response`
- `api.exception`

`/api/log` additionally emits:

- `log.ingestion.stored`
- `log.ingestion.skipped`
- `log.ingestion.failed`
- `log.ingestion.alert_threshold_exceeded`
