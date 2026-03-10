import { createHash } from 'node:crypto';
import { parseAirKoreaForecastIssuedAt } from '../shared/time';
import type { AirKoreaForecastApiItem, AirQualityForecastDailyDoc } from '../shared/types';

function toNullableString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeForecastRegionKey(raw: string) {
  const compact = raw.replace(/\s+/g, '');
  if (!compact) return null;

  if (compact.includes('서울')) return '서울';
  if (compact.includes('부산')) return '부산';
  if (compact.includes('대구')) return '대구';
  if (compact.includes('인천')) return '인천';
  if (compact.includes('광주')) return '광주';
  if (compact.includes('대전')) return '대전';
  if (compact.includes('울산')) return '울산';
  if (compact.includes('세종')) return '세종';
  if (compact.includes('충북')) return '충북';
  if (compact.includes('충남')) return '충남';
  if (compact.includes('전북')) return '전북';
  if (compact.includes('전남')) return '전남';
  if (compact.includes('경북')) return '경북';
  if (compact.includes('경남')) return '경남';
  if (compact.includes('제주')) return '제주';
  if (compact.includes('경기남부')) return '경기남부';
  if (compact.includes('경기북부')) return '경기북부';
  if (compact.includes('영서')) return '영서';
  if (compact.includes('영동')) return '영동';
  return compact;
}

function parseRegionGrades(raw: string | null) {
  if (!raw) return {};

  return raw
    .split(',')
    .map((part) => part.trim())
    .reduce<Record<string, string>>((acc, part) => {
      const [regionRaw, gradeRaw] = part.split(':');
      const region = normalizeForecastRegionKey(regionRaw || '');
      const grade = toNullableString(gradeRaw);
      if (!region || !grade) return acc;
      acc[region] = grade;
      return acc;
    }, {});
}

function collectImageUrls(item: AirKoreaForecastApiItem) {
  return [
    item.imageUrl1,
    item.imageUrl2,
    item.imageUrl3,
    item.imageUrl4,
    item.imageUrl5,
    item.imageUrl6,
  ]
    .map((value) => toNullableString(value))
    .filter((value): value is string => Boolean(value));
}

export function extractAirKoreaForecastItems(payload: unknown) {
  const response = (payload as { response?: { header?: Record<string, unknown>; body?: Record<string, unknown> } })
    ?.response;
  const header = response?.header || {};
  const body = response?.body || {};
  const rawItems = (body.items as { item?: unknown } | unknown[]) || [];
  const items = Array.isArray(rawItems)
    ? (rawItems as AirKoreaForecastApiItem[])
    : Array.isArray((rawItems as { item?: unknown }).item)
      ? (((rawItems as { item?: unknown }).item || []) as AirKoreaForecastApiItem[])
      : [];

  return {
    resultCode: String(header.resultCode || ''),
    resultMsg: String(header.resultMsg || ''),
    totalCount: Number(body.totalCount || items.length || 0),
    items,
  };
}

export function buildAirKoreaForecastRawDoc(
  item: AirKoreaForecastApiItem,
  requestedCode: string,
  ingestedAt: string,
) {
  const payloadHash = createHash('sha256').update(JSON.stringify(item)).digest('hex');
  return {
    requestedCode,
    fetchedAt: ingestedAt,
    payloadHash,
    ...item,
  };
}

export function buildAirKoreaForecastLatestDoc(
  item: AirKoreaForecastApiItem,
  ingestedAt: string,
  sourceVersion: string,
): AirQualityForecastDailyDoc | null {
  const informCode = toNullableString(item.informCode);
  const forecastDate = toNullableString(item.informData);
  const issuedAt = toNullableString(item.dataTime);

  if (!informCode || !forecastDate || !issuedAt) {
    return null;
  }

  const issuedAtUtc = parseAirKoreaForecastIssuedAt(issuedAt);
  if (!issuedAtUtc) {
    return null;
  }

  const gradeText = toNullableString(item.informGrade);

  return {
    informCode,
    forecastDate,
    issuedAt,
    issuedAtUtc: issuedAtUtc.toISOString(),
    overall: toNullableString(item.informOverall),
    cause: toNullableString(item.informCause),
    actionKnack: toNullableString(item.actionKnack),
    gradeText,
    gradesByRegion: parseRegionGrades(gradeText),
    imageUrls: collectImageUrls(item),
    updatedAt: ingestedAt,
    ingestedAt,
    sourceVersion,
  };
}
