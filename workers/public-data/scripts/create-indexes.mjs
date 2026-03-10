import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const airQualityDbName = process.env.AIRKOREA_DB_NAME || 'air_quality';
const weatherForecastDbName = process.env.WEATHER_FORECAST_DB_NAME || 'weather_forecast';
const airKoreaRawCollection = process.env.AIRKOREA_RAW_COLLECTION || 'airkorea_realtime_raw';
const airKoreaHistoryCollection = process.env.AIRKOREA_HISTORY_COLLECTION || 'air_quality_history';
const airKoreaLatestCollection = process.env.AIRKOREA_LATEST_COLLECTION || 'air_quality_latest';
const airKoreaRunsCollection = process.env.AIRKOREA_RUNS_COLLECTION || 'ingest_runs';
const airKoreaForecastRawCollection =
  process.env.AIRKOREA_FORECAST_RAW_COLLECTION || 'airkorea_forecast_raw';
const airKoreaForecastLatestCollection =
  process.env.AIRKOREA_FORECAST_LATEST_COLLECTION || 'air_quality_forecast_daily';
const airKoreaForecastRunsCollection =
  process.env.AIRKOREA_FORECAST_RUNS_COLLECTION || 'ingest_runs_forecast';
const weatherForecastWriterCollection =
  process.env.WEATHER_FORECAST_WRITER_COLLECTION || 'weather_forecast_data_shadow';
const weatherForecastRunsCollection = process.env.WEATHER_FORECAST_RUNS_COLLECTION || 'ingest_runs_shadow';
const kmaLifestyleRawCollection = process.env.KMA_LIFESTYLE_RAW_COLLECTION || 'kma_lifestyle_raw';
const kmaLifestyleLatestCollection =
  process.env.KMA_LIFESTYLE_LATEST_COLLECTION || 'lifestyle_indices_daily';
const kmaLifestyleRunsCollection = process.env.KMA_LIFESTYLE_RUNS_COLLECTION || 'ingest_runs_lifestyle';
const airKoreaRawTtlDays = Number.parseInt(process.env.AIRKOREA_RAW_TTL_DAYS || '7', 10);
const airKoreaHistoryTtlDays = Number.parseInt(process.env.AIRKOREA_HISTORY_TTL_DAYS || '30', 10);
const airKoreaRunsTtlDays = Number.parseInt(process.env.AIRKOREA_RUNS_TTL_DAYS || '30', 10);
const airKoreaForecastRawTtlDays = Number.parseInt(process.env.AIRKOREA_FORECAST_RAW_TTL_DAYS || '30', 10);
const airKoreaForecastRunsTtlDays = Number.parseInt(
  process.env.AIRKOREA_FORECAST_RUNS_TTL_DAYS || '30',
  10,
);
const weatherForecastWriterTtlDays = Number.parseInt(process.env.WEATHER_FORECAST_WRITER_TTL_DAYS || '14', 10);
const weatherForecastRunsTtlDays = Number.parseInt(process.env.WEATHER_FORECAST_RUNS_TTL_DAYS || '30', 10);
const kmaLifestyleRawTtlDays = Number.parseInt(process.env.KMA_LIFESTYLE_RAW_TTL_DAYS || '14', 10);
const kmaLifestyleRunsTtlDays = Number.parseInt(process.env.KMA_LIFESTYLE_RUNS_TTL_DAYS || '30', 10);

if (!mongoUri) {
  console.error('Missing env: MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(mongoUri);

async function backfillExpireAt(collection, sourceExpression, ttlDays) {
  await collection.updateMany(
    {},
    [
      {
        $set: {
          expireAt: {
            $dateAdd: {
              startDate: sourceExpression,
              unit: 'day',
              amount: ttlDays,
            },
          },
        },
      },
    ],
  );
}

async function createAirQualityIndexes() {
  const db = client.db(airQualityDbName);
  const rawCollection = db.collection(airKoreaRawCollection);
  await rawCollection.createIndexes([
    {
      key: {
        requestScope: 1,
        sidoName: 1,
        stationName: 1,
        mangName: 1,
        dataTime: 1,
        payloadHash: 1,
      },
      name: 'uq_airkorea_raw_scope_station_time_hash',
      unique: true,
    },
    {
      key: { fetchedAt: -1 },
      name: 'idx_airkorea_raw_fetched_at',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_airkorea_raw_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(rawCollection, { $toDate: '$fetchedAt' }, airKoreaRawTtlDays);

  const historyCollection = db.collection(airKoreaHistoryCollection);
  await historyCollection.createIndexes([
    {
      key: { sidoName: 1, stationName: 1, mangName: 1, dataTime: 1 },
      name: 'uq_air_quality_history_station_time',
      unique: true,
    },
    {
      key: { measuredAtUtc: -1 },
      name: 'idx_air_quality_history_measured_at',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_air_quality_history_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(historyCollection, { $toDate: '$ingestedAt' }, airKoreaHistoryTtlDays);

  await db.collection(airKoreaLatestCollection).createIndexes([
    {
      key: { sidoName: 1, stationName: 1, mangName: 1 },
      name: 'uq_air_quality_latest_station',
      unique: true,
    },
    {
      key: { stationName: 1, measuredAtUtc: -1, updatedAt: -1 },
      name: 'idx_air_quality_latest_station_time',
    },
  ]);

  const airKoreaRuns = db.collection(airKoreaRunsCollection);
  await airKoreaRuns.createIndexes([
    {
      key: { jobName: 1, startedAt: -1 },
      name: 'idx_air_quality_ingest_runs_job_started_at',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_air_quality_ingest_runs_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(
    airKoreaRuns,
    { $toDate: { $ifNull: ['$finishedAt', '$startedAt'] } },
    airKoreaRunsTtlDays,
  );
}

async function createAirQualityForecastIndexes() {
  const db = client.db(airQualityDbName);

  const rawCollection = db.collection(airKoreaForecastRawCollection);
  await rawCollection.createIndexes([
    {
      key: { requestedCode: 1, informCode: 1, informData: 1, dataTime: 1, payloadHash: 1 },
      name: 'uq_airkorea_forecast_raw_issue_hash',
      unique: true,
    },
    {
      key: { fetchedAt: -1 },
      name: 'idx_airkorea_forecast_raw_fetched_at',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_airkorea_forecast_raw_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(rawCollection, { $toDate: '$fetchedAt' }, airKoreaForecastRawTtlDays);

  await db.collection(airKoreaForecastLatestCollection).createIndexes([
    {
      key: { informCode: 1, forecastDate: 1 },
      name: 'uq_air_quality_forecast_daily_code_date',
      unique: true,
    },
    {
      key: { forecastDate: 1, issuedAtUtc: -1 },
      name: 'idx_air_quality_forecast_daily_date_issued_at',
    },
  ]);

  const runsCollection = db.collection(airKoreaForecastRunsCollection);
  await runsCollection.createIndexes([
    {
      key: { jobName: 1, startedAt: -1 },
      name: 'idx_airkorea_forecast_runs_job_started_at',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_airkorea_forecast_runs_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(
    runsCollection,
    { $toDate: { $ifNull: ['$finishedAt', '$startedAt'] } },
    airKoreaForecastRunsTtlDays,
  );
}

async function createWeatherForecastIndexes() {
  const db = client.db(weatherForecastDbName);
  const weatherWriter = db.collection(weatherForecastWriterCollection);
  await weatherWriter.createIndexes([
    {
      key: { stationName: 1, forecastDate: 1, forecastHour: 1, updatedAt: -1 },
      name: 'idx_weather_forecast_station_date_hour_updated',
    },
    {
      key: { regionKey: 1, forecastAtUtc: 1, stationName: 1 },
      name: 'uq_weather_forecast_region_forecast_station',
      unique: true,
      partialFilterExpression: {
        regionKey: { $type: 'string' },
        forecastAtUtc: { $type: 'date' },
        stationName: { $type: 'string' },
      },
    },
    {
      key: { sidoName: 1, stationName: 1, forecastDate: 1, forecastHour: 1 },
      name: 'idx_weather_forecast_sido_station_time',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_weather_forecast_writer_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(weatherWriter, { $toDate: '$ingestedAt' }, weatherForecastWriterTtlDays);

  const weatherRuns = db.collection(weatherForecastRunsCollection);
  await weatherRuns.createIndexes([
    {
      key: { jobName: 1, startedAt: -1 },
      name: 'idx_weather_ingest_runs_job_started_at',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_weather_ingest_runs_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(
    weatherRuns,
    { $toDate: { $ifNull: ['$finishedAt', '$startedAt'] } },
    weatherForecastRunsTtlDays,
  );
}

async function createLifestyleIndexes() {
  const db = client.db(weatherForecastDbName);

  const rawCollection = db.collection(kmaLifestyleRawCollection);
  await rawCollection.createIndexes([
    {
      key: { category: 1, pollenType: 1, areaNo: 1, requestedTime: 1, payloadHash: 1 },
      name: 'uq_kma_lifestyle_raw_category_scope_hash',
      unique: true,
    },
    {
      key: { fetchedAt: -1 },
      name: 'idx_kma_lifestyle_raw_fetched_at',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_kma_lifestyle_raw_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(rawCollection, { $toDate: '$fetchedAt' }, kmaLifestyleRawTtlDays);

  await db.collection(kmaLifestyleLatestCollection).createIndexes([
    {
      key: { category: 1, pollenType: 1, sidoName: 1, forecastDate: 1 },
      name: 'uq_kma_lifestyle_latest_category_region_date',
      unique: true,
    },
    {
      key: { sidoName: 1, forecastDate: 1, updatedAt: -1 },
      name: 'idx_kma_lifestyle_latest_region_date_updated',
    },
  ]);

  const runsCollection = db.collection(kmaLifestyleRunsCollection);
  await runsCollection.createIndexes([
    {
      key: { jobName: 1, startedAt: -1 },
      name: 'idx_kma_lifestyle_runs_job_started_at',
    },
    {
      key: { expireAt: 1 },
      name: 'ttl_kma_lifestyle_runs_expire_at',
      expireAfterSeconds: 0,
    },
  ]);
  await backfillExpireAt(
    runsCollection,
    { $toDate: { $ifNull: ['$finishedAt', '$startedAt'] } },
    kmaLifestyleRunsTtlDays,
  );
}

async function main() {
  await client.connect();
  await createAirQualityIndexes();
  await createAirQualityForecastIndexes();
  await createWeatherForecastIndexes();
  await createLifestyleIndexes();
  console.log('Mongo indexes created successfully.');
}

main()
  .catch((error) => {
    console.error('Failed to create Mongo indexes:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
