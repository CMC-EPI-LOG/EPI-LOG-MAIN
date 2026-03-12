import { createHash } from 'node:crypto';
import { parseAirKoreaDataTime } from '../shared/time';
import type { AirKoreaApiItem, AirQualityLatestDoc } from '../shared/types';

function toNullableNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed === 'null') return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function toNullableString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function extractAirKoreaItems(payload: unknown) {
  const response = (payload as { response?: { header?: Record<string, unknown>; body?: Record<string, unknown> } })
    ?.response;
  const header = response?.header || {};
  const body = response?.body || {};
  const rawItems = (body.items as { item?: unknown } | unknown[]) || [];
  const items = Array.isArray(rawItems)
    ? (rawItems as AirKoreaApiItem[])
    : Array.isArray((rawItems as { item?: unknown }).item)
      ? (((rawItems as { item?: unknown }).item || []) as AirKoreaApiItem[])
      : [];

  return {
    resultCode: String(header.resultCode || ''),
    resultMsg: String(header.resultMsg || ''),
    totalCount: Number(body.totalCount || items.length || 0),
    items,
  };
}

export function buildAirKoreaRawDoc(item: AirKoreaApiItem, requestScope: string, ingestedAt: string) {
  const payloadHash = createHash('sha256').update(JSON.stringify(item)).digest('hex');
  return {
    requestScope,
    fetchedAt: ingestedAt,
    payloadHash,
    ...item,
  };
}

export function buildAirKoreaLatestDoc(
  item: AirKoreaApiItem,
  ingestedAt: string,
  sourceVersion: string,
): AirQualityLatestDoc | null {
  const sidoName = toNullableString(item.sidoName);
  const stationName = toNullableString(item.stationName);
  const mangName = toNullableString(item.mangName);
  const dataTime = toNullableString(item.dataTime);

  if (!sidoName || !stationName || !dataTime) {
    return null;
  }

  const measuredAt = parseAirKoreaDataTime(dataTime);
  if (!measuredAt) {
    return null;
  }

  return {
    sidoName,
    stationName,
    mangName,
    dataTime,
    measuredAtUtc: measuredAt.toISOString(),
    pm10Value: toNullableNumber(item.pm10Value),
    pm10Value24: toNullableNumber(item.pm10Value24),
    pm25Value: toNullableNumber(item.pm25Value),
    pm25Value24: toNullableNumber(item.pm25Value24),
    o3Value: toNullableNumber(item.o3Value),
    no2Value: toNullableNumber(item.no2Value),
    coValue: toNullableNumber(item.coValue),
    so2Value: toNullableNumber(item.so2Value),
    khaiValue: toNullableNumber(item.khaiValue),
    khaiGrade: toNullableString(item.khaiGrade),
    pm10Grade: toNullableString(item.pm10Grade),
    pm25Grade: toNullableString(item.pm25Grade),
    pm10Grade1h: toNullableString(item.pm10Grade1h),
    pm25Grade1h: toNullableString(item.pm25Grade1h),
    o3Grade: toNullableString(item.o3Grade),
    no2Grade: toNullableString(item.no2Grade),
    coGrade: toNullableString(item.coGrade),
    so2Grade: toNullableString(item.so2Grade),
    pm10Flag: toNullableString(item.pm10Flag),
    pm25Flag: toNullableString(item.pm25Flag),
    o3Flag: toNullableString(item.o3Flag),
    no2Flag: toNullableString(item.no2Flag),
    coFlag: toNullableString(item.coFlag),
    so2Flag: toNullableString(item.so2Flag),
    updatedAt: ingestedAt,
    ingestedAt,
    sourceVersion,
  };
}
