export type ScheduledIngestJob =
  | 'airkorea-realtime'
  | 'airkorea-forecast'
  | 'kma-short-forecast'
  | 'kma-lifestyle';

export type ScheduledIngestEvent = {
  job: ScheduledIngestJob;
  trigger: string;
  dryRun?: boolean;
  scope?: string[];
};

export type BackfillEvent = {
  source: ScheduledIngestJob;
  trigger: string;
  dryRun?: boolean;
  scope?: string[];
  fromKst?: string;
  toKst?: string;
};

export type IngestRunStatus = 'running' | 'success' | 'partial_failed' | 'failed' | 'skipped';

export type ForecastGrid = {
  regionKey: string;
  stationName: string;
  stationNames: string[];
  sidoName: string;
  nx: number;
  ny: number;
};

export type AirKoreaApiItem = {
  sidoName?: string;
  stationName?: string;
  mangName?: string;
  dataTime?: string;
  so2Value?: string | number;
  coValue?: string | number;
  o3Value?: string | number;
  no2Value?: string | number;
  pm10Value?: string | number;
  pm10Value24?: string | number;
  pm25Value?: string | number;
  pm25Value24?: string | number;
  khaiValue?: string | number;
  khaiGrade?: string | number;
  so2Grade?: string | number;
  coGrade?: string | number;
  o3Grade?: string | number;
  no2Grade?: string | number;
  pm10Grade?: string | number;
  pm25Grade?: string | number;
  pm10Grade1h?: string | number;
  pm25Grade1h?: string | number;
  so2Flag?: string;
  coFlag?: string;
  o3Flag?: string;
  no2Flag?: string;
  pm10Flag?: string;
  pm25Flag?: string;
  [key: string]: unknown;
};

export type AirKoreaForecastApiItem = {
  informCode?: string;
  informData?: string;
  informGrade?: string;
  informOverall?: string;
  informCause?: string;
  actionKnack?: string | null;
  dataTime?: string;
  imageUrl1?: string;
  imageUrl2?: string;
  imageUrl3?: string;
  imageUrl4?: string;
  imageUrl5?: string;
  imageUrl6?: string;
  [key: string]: unknown;
};

export type KmaShortForecastApiItem = {
  baseDate?: string;
  baseTime?: string;
  category?: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
  nx?: string | number;
  ny?: string | number;
  [key: string]: unknown;
};

export type AirQualityLatestDoc = {
  sidoName: string;
  stationName: string;
  mangName: string | null;
  dataTime: string;
  measuredAtUtc: string;
  pm10Value: number | null;
  pm10Value24: number | null;
  pm25Value: number | null;
  pm25Value24: number | null;
  o3Value: number | null;
  no2Value: number | null;
  coValue: number | null;
  so2Value: number | null;
  khaiValue: number | null;
  khaiGrade: string | null;
  pm10Grade: string | null;
  pm25Grade: string | null;
  pm10Grade1h: string | null;
  pm25Grade1h: string | null;
  o3Grade: string | null;
  no2Grade: string | null;
  coGrade: string | null;
  so2Grade: string | null;
  pm10Flag: string | null;
  pm25Flag: string | null;
  o3Flag: string | null;
  no2Flag: string | null;
  coFlag: string | null;
  so2Flag: string | null;
  updatedAt: string;
  ingestedAt: string;
  sourceVersion: string;
};

export type AirQualityForecastDailyDoc = {
  informCode: string;
  forecastDate: string;
  issuedAt: string;
  issuedAtUtc: string;
  overall: string | null;
  cause: string | null;
  actionKnack: string | null;
  gradeText: string | null;
  gradesByRegion: Record<string, string>;
  imageUrls: string[];
  updatedAt: string;
  ingestedAt: string;
  sourceVersion: string;
};

export type WeatherForecastServingDoc = {
  regionKey: string;
  sidoName: string;
  stationName: string;
  source: string;
  baseDate: string;
  baseTime: string;
  forecastDate: string;
  forecastHour: number;
  forecastTimeLabel: string;
  fcstDate: string;
  fcstTime: string;
  forecastAtUtc: string;
  dataTime: string;
  temperature: number | null;
  humidity: number | null;
  precipitation: string | number | null;
  precipitationProbability: number | null;
  precipitationType: number | null;
  categories: Record<string, { fcstValue: string }>;
  updatedAt: string;
  ingestedAt: string;
};

export type LifestyleCategory = 'UV' | 'POLLEN';
export type PollenType = 'pine' | 'oak' | 'weed';

export type KmaLifestyleIndexDoc = {
  category: LifestyleCategory;
  pollenType: PollenType | null;
  areaNo: string;
  sidoName: string;
  forecastDate: string;
  issuedAt: string;
  issuedAtUtc: string;
  valueCode: string | null;
  valueLabel: string | null;
  peakValue: number | null;
  peakHourLabel: string | null;
  valuesByHour: Record<string, number | null> | null;
  updatedAt: string;
  ingestedAt: string;
  sourceVersion: string;
};
