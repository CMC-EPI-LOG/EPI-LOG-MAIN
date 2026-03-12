import { optionalEnv } from './env';

export function getAirKoreaCollections() {
  return {
    raw: optionalEnv('AIRKOREA_RAW_COLLECTION', 'airkorea_realtime_raw'),
    history: optionalEnv('AIRKOREA_HISTORY_COLLECTION', 'air_quality_history'),
    latest: optionalEnv('AIRKOREA_LATEST_COLLECTION', 'air_quality_latest'),
    runs: optionalEnv('AIRKOREA_RUNS_COLLECTION', 'ingest_runs'),
  };
}

export function getAirKoreaForecastCollections() {
  return {
    raw: optionalEnv('AIRKOREA_FORECAST_RAW_COLLECTION', 'airkorea_forecast_raw'),
    latest: optionalEnv('AIRKOREA_FORECAST_LATEST_COLLECTION', 'air_quality_forecast_daily'),
    runs: optionalEnv('AIRKOREA_FORECAST_RUNS_COLLECTION', 'ingest_runs_forecast'),
  };
}

export function getWeatherForecastCollections() {
  return {
    writer: optionalEnv('WEATHER_FORECAST_WRITER_COLLECTION', 'weather_forecast_data_shadow'),
    runs: optionalEnv('WEATHER_FORECAST_RUNS_COLLECTION', 'ingest_runs_shadow'),
  };
}

export function getKmaLifestyleCollections() {
  return {
    raw: optionalEnv('KMA_LIFESTYLE_RAW_COLLECTION', 'kma_lifestyle_raw'),
    latest: optionalEnv('KMA_LIFESTYLE_LATEST_COLLECTION', 'lifestyle_indices_daily'),
    runs: optionalEnv('KMA_LIFESTYLE_RUNS_COLLECTION', 'ingest_runs_lifestyle'),
  };
}
