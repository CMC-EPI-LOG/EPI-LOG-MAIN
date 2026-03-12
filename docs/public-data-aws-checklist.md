# Public Data AWS Deployment Checklist

This checklist covers the manual setup required before the AirKorea and KMA ingestion stack can run in AWS.

## 1. Prerequisites

- Install AWS CLI v2 and configure credentials for the target AWS account.
- Install Node.js 20+ and npm.
- Confirm access to MongoDB Atlas or the MongoDB cluster used by the app.
- Confirm that valid service keys exist for:
  - `AIRKOREA_SERVICE_KEY`
  - `KMA_SERVICE_KEY`

## 2. CDK Bootstrap

Run this once per AWS account and region:

```bash
cd /Users/lux/Documents/EPI-LOG-MAIN/infra/public-data-cdk
npm run bootstrap
```

## 3. MongoDB Network Access

- Decide how Lambda will reach MongoDB.
- If using MongoDB Atlas with IP allowlist:
  - Do not rely on default Lambda public egress. Its outbound IP is not stable.
  - Put Lambda in a VPC and route outbound traffic through a NAT gateway with an Elastic IP.
  - Add that NAT Elastic IP to the Atlas allowlist.
- If using a VPC-based design:
  - Put Lambda in subnets with outbound internet or private connectivity to MongoDB.
  - Add security group, NAT, routing, and DNS settings before deploy.

The current CDK scaffold can attach Lambda to an existing VPC if these deploy-time environment variables are set:

- `PUBLIC_DATA_VPC_ID`
- `PUBLIC_DATA_SUBNET_IDS`
- `PUBLIC_DATA_SECURITY_GROUP_IDS`

It still does not create the NAT gateway, Elastic IP, or Atlas allowlist entry for you.

## 4. Secrets and Environment Variables

Set these values for the Lambda functions before production traffic. The stack supports three injection modes:

- direct deploy-time environment variable
- AWS Secrets Manager via `*_SECRET_NAME`
- AWS Systems Manager Parameter Store via `*_PARAMETER_NAME`

Base variables:

- `MONGODB_URI`
- `AIRKOREA_SERVICE_KEY`
- `KMA_SERVICE_KEY`
- `AIRKOREA_DB_NAME`
- `WEATHER_FORECAST_DB_NAME`

Optional collection variables:

- `AIRKOREA_RAW_COLLECTION`
- `AIRKOREA_HISTORY_COLLECTION`
- `AIRKOREA_LATEST_COLLECTION`
- `AIRKOREA_RUNS_COLLECTION`
- `WEATHER_FORECAST_WRITER_COLLECTION`
- `WEATHER_FORECAST_RUNS_COLLECTION`
- `WEATHER_FORECAST_READER_COLLECTION`

TTL retention defaults:

- `AIRKOREA_RAW_TTL_DAYS=7`
- `AIRKOREA_HISTORY_TTL_DAYS=30`
- `AIRKOREA_RUNS_TTL_DAYS=30`
- `WEATHER_FORECAST_WRITER_TTL_DAYS=14`
- `WEATHER_FORECAST_RUNS_TTL_DAYS=30`

Recommended values:

- `AIRKOREA_DB_NAME=air_quality`
- `WEATHER_FORECAST_DB_NAME=weather_forecast`

Recommended storage:

- AWS Systems Manager Parameter Store or AWS Secrets Manager

Examples:

```bash
export MONGODB_URI_SECRET_NAME='prod/public-data/mongodb-uri'
export AIRKOREA_SERVICE_KEY_SECRET_NAME='prod/public-data/airkorea-service-key'
export KMA_SERVICE_KEY_SECRET_NAME='prod/public-data/kma-service-key'
export AIRKOREA_DB_NAME='air_quality'
export WEATHER_FORECAST_DB_NAME='weather_forecast'
export WEATHER_FORECAST_WRITER_COLLECTION='weather_forecast_data_shadow'
export WEATHER_FORECAST_RUNS_COLLECTION='ingest_runs_shadow'
export WEATHER_FORECAST_READER_COLLECTION='weather_forecast_data_shadow'
```

If using SSM SecureString, also set `*_PARAMETER_VERSION`.

## 5. MongoDB Index Creation

Run this before enabling production schedules:

```bash
cd /Users/lux/Documents/EPI-LOG-MAIN/workers/public-data
MONGODB_URI='your-mongodb-uri' \
AIRKOREA_DB_NAME='air_quality' \
WEATHER_FORECAST_DB_NAME='weather_forecast' \
npm run create-indexes
```

Expected collections:

- `air_quality.airkorea_realtime_raw`
- `air_quality.air_quality_history`
- `air_quality.air_quality_latest`
- `air_quality.ingest_runs`
- `weather_forecast.weather_forecast_data_shadow`
- `weather_forecast.ingest_runs_shadow`

## 6. Deploy the CDK Stack

```bash
cd /Users/lux/Documents/EPI-LOG-MAIN/infra/public-data-cdk
npm run build
npm run deploy
```

After deploy, verify these resources exist:

- Lambda functions:
  - `airkorea-realtime-ingest`
  - `kma-short-forecast-ingest`
  - `public-data-backfill`
- EventBridge Scheduler schedules:
  - AirKorea at KST `07,27,47`
  - KMA short forecast at KST `12,42`
- SQS DLQs
- CloudWatch alarms

## 7. Post-Deploy Lambda Configuration

Check these Lambda settings in AWS:

- Reserved concurrency is `1` for each ingest Lambda.
- Timeout and memory match the expected payload size.
- The execution role can write logs, emit metrics, and read secrets if secrets are stored in AWS.

If secret delivery is handled outside CDK, apply it now.

## 8. Smoke Tests

Run the Lambda functions manually once before trusting the schedules.

Verify MongoDB results:

- `air_quality_latest` has recent AirKorea documents.
- `weather_forecast_data` has current forecast documents.
- `ingest_runs` has `success` or `partial_failed` entries with counts.

Verify app paths:

- `/api/air-quality-latest?stationName=<station>`
- `/api/daily-report` for a station that should resolve through Mongo
- `/api/weather-forecast?stationName=<station>`

## 9. Monitoring

Before production rollout, connect alarm targets.

Supported by the current CDK scaffold:

- existing SNS topic via `ALARM_SNS_TOPIC_ARN`
- a new email subscription topic via `ALARM_EMAIL_ADDRESS`

Examples:

```bash
export ALARM_EMAIL_ADDRESS='alerts@example.com'
```

or

```bash
export ALARM_SNS_TOPIC_ARN='arn:aws:sns:ap-northeast-2:123456789012:shared-alerts'
```

Slack and PagerDuty can still be connected behind SNS, but that wiring is external to this stack unless you already have a target topic.

Common targets:

- SNS email
- Slack
- PagerDuty
- Another on-call channel

At minimum, alert on:

- Lambda errors
- DLQ messages
- stale `air_quality_latest`
- stale `weather_forecast_data`
- repeated partial failures in `ingest_runs`

## 10. Production Cutover

- Deploy ingestion first.
- Let data accumulate for at least one scheduler cycle.
- Keep the app reader on the current production collection first.
- Verify shadow collections such as `weather_forecast_data_shadow` and `ingest_runs_shadow`.
- After validation, switch the app reader by setting `WEATHER_FORECAST_READER_COLLECTION=weather_forecast_data_shadow`.
- Verify Mongo-backed responses from `/api/air-quality-latest`.
- Verify Mongo-backed responses from `/api/daily-report`.
- Only then rely on the new ingestion path as primary.

## 11. What Still Requires Manual AWS Setup

Yes, there is still AWS-side work. Code changes alone are not enough.

You still need to provide:

- AWS account and region bootstrap
- secret values or secret names
- MongoDB network connectivity and Atlas allowlist
- alarm delivery targets
- actual `cdk deploy`
