import { parseKmaForecastToUtc, hourFromFcstTime } from '../shared/time';
import type { ForecastGrid, KmaShortForecastApiItem, WeatherForecastServingDoc } from '../shared/types';

function toNullableNumber(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export function extractKmaItems(payload: unknown) {
  const response = (payload as { response?: { header?: Record<string, unknown>; body?: Record<string, unknown> } })
    ?.response;
  const header = response?.header || {};
  const body = response?.body || {};
  const rawItems = (body.items as { item?: unknown } | unknown[]) || [];
  const items = Array.isArray(rawItems)
    ? (rawItems as KmaShortForecastApiItem[])
    : Array.isArray((rawItems as { item?: unknown }).item)
      ? (((rawItems as { item?: unknown }).item || []) as KmaShortForecastApiItem[])
      : [];

  return {
    resultCode: String(header.resultCode || ''),
    resultMsg: String(header.resultMsg || ''),
    totalCount: Number(body.totalCount || items.length || 0),
    items,
  };
}

export function buildForecastDocuments(
  grid: ForecastGrid,
  baseDate: string,
  baseTime: string,
  items: KmaShortForecastApiItem[],
  ingestedAt: string,
) {
  const stationNames = Array.from(new Set([grid.stationName, ...(grid.stationNames || [])]));
  const byForecastTime = new Map<string, Record<string, KmaShortForecastApiItem>>();

  for (const item of items) {
    const fcstDate = item.fcstDate?.trim();
    const fcstTime = item.fcstTime?.trim();
    const category = item.category?.trim();
    if (!fcstDate || !fcstTime || !category) continue;

    const key = `${fcstDate}${fcstTime.padStart(4, '0')}`;
    if (!byForecastTime.has(key)) byForecastTime.set(key, {});
    byForecastTime.get(key)![category] = item;
  }

  const docs: WeatherForecastServingDoc[] = [];

  for (const grouped of byForecastTime.values()) {
    const first = Object.values(grouped)[0];
    const fcstDate = first?.fcstDate?.trim();
    const fcstTime = first?.fcstTime?.trim().padStart(4, '0');
    if (!fcstDate || !fcstTime) continue;

    const forecastAt = parseKmaForecastToUtc(fcstDate, fcstTime);
    if (!forecastAt) continue;

    const categories = Object.fromEntries(
      Object.entries(grouped).map(([category, item]) => [
        category,
        { fcstValue: String(item.fcstValue ?? '') },
      ]),
    );

    for (const stationName of stationNames) {
      docs.push({
        regionKey: grid.regionKey,
        sidoName: grid.sidoName,
        stationName,
        source: 'kma-short-forecast',
        baseDate,
        baseTime,
        forecastDate: fcstDate,
        forecastHour: hourFromFcstTime(fcstTime),
        forecastTimeLabel: `${fcstTime.slice(0, 2)}:${fcstTime.slice(2, 4)}`,
        fcstDate,
        fcstTime,
        forecastAtUtc: forecastAt.toISOString(),
        dataTime: `${fcstDate} ${fcstTime}`,
        temperature: toNullableNumber(grouped.TMP?.fcstValue),
        humidity: toNullableNumber(grouped.REH?.fcstValue),
        precipitation: grouped.PCP?.fcstValue?.trim() || null,
        precipitationProbability: toNullableNumber(grouped.POP?.fcstValue),
        precipitationType: toNullableNumber(grouped.PTY?.fcstValue),
        categories,
        updatedAt: ingestedAt,
        ingestedAt,
      });
    }
  }

  return docs;
}
