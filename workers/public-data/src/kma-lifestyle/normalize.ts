import { createHash } from 'node:crypto';
import {
  formatKstDateLabel,
  formatKstHourLabel,
  parseKmaLifestyleIssuedAt,
} from '../shared/time';
import type {
  KmaLifestyleIndexDoc,
  LifestyleCategory,
  PollenType,
} from '../shared/types';

type KmaLifestyleItem = Record<string, unknown>;

function toNullableString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toNullableNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed === 'null') return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeUvLabel(value: number | null) {
  if (value === null) return null;
  if (value >= 11) return '위험';
  if (value >= 8) return '매우높음';
  if (value >= 6) return '높음';
  if (value >= 3) return '보통';
  return '낮음';
}

function normalizePollenLabel(value: unknown) {
  const text = toNullableString(value);
  if (!text) return null;

  if (text.includes('매우')) return '매우높음';
  if (text.includes('높')) return '높음';
  if (text.includes('보통')) return '보통';
  if (text.includes('낮')) return '낮음';

  const numeric = toNullableNumber(text);
  if (numeric === null) return text;
  if (numeric >= 3) return '매우높음';
  if (numeric >= 2) return '높음';
  if (numeric >= 1) return '보통';
  return '낮음';
}

function formatIssuedAtLabel(raw: string) {
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:00 발표`;
}

export function extractKmaLifestyleItems(payload: unknown) {
  const response = (payload as {
    response?: { header?: Record<string, unknown>; body?: Record<string, unknown> };
  })?.response;
  const header = response?.header || {};
  const body = response?.body || {};
  const rawItems = (body.items as { item?: unknown } | unknown[]) || [];
  const items = Array.isArray(rawItems)
    ? (rawItems as KmaLifestyleItem[])
    : Array.isArray((rawItems as { item?: unknown }).item)
      ? (((rawItems as { item?: unknown }).item || []) as KmaLifestyleItem[])
      : ((rawItems as { item?: unknown }).item ? [(rawItems as { item?: unknown }).item as KmaLifestyleItem] : []);

  return {
    resultCode: String(header.resultCode || ''),
    resultMsg: String(header.resultMsg || ''),
    totalCount: Number(body.totalCount || items.length || 0),
    items,
  };
}

export function buildLifestyleRawDoc(input: {
  category: LifestyleCategory;
  pollenType?: PollenType | null;
  areaNo: string;
  sidoName: string;
  requestedTime: string;
  item: KmaLifestyleItem;
  ingestedAt: string;
}) {
  const payloadHash = createHash('sha256').update(JSON.stringify(input.item)).digest('hex');
  return {
    category: input.category,
    pollenType: input.pollenType || null,
    areaNo: input.areaNo,
    sidoName: input.sidoName,
    requestedTime: input.requestedTime,
    fetchedAt: input.ingestedAt,
    payloadHash,
    ...input.item,
  };
}

export function buildUvLatestDocs(input: {
  areaNo: string;
  sidoName: string;
  item: KmaLifestyleItem;
  ingestedAt: string;
  sourceVersion: string;
}) {
  const issuedAt = toNullableString(input.item.date);
  const issuedAtUtc = parseKmaLifestyleIssuedAt(issuedAt);
  if (!issuedAt || !issuedAtUtc) return [];
  const issuedAtLabel = formatIssuedAtLabel(issuedAt);

  const dailyMap = new Map<
    string,
    {
      peakValue: number | null;
      peakHourLabel: string | null;
      valuesByHour: Record<string, number | null>;
    }
  >();

  for (const [key, value] of Object.entries(input.item)) {
    if (!/^h\d+$/.test(key)) continue;
    const offsetHours = Number.parseInt(key.slice(1), 10);
    if (Number.isNaN(offsetHours)) continue;

    const forecastAt = new Date(issuedAtUtc.getTime() + offsetHours * 60 * 60 * 1000);
    const forecastDate = formatKstDateLabel(forecastAt);
    const hourLabel = formatKstHourLabel(forecastAt);
    const numericValue = toNullableNumber(value);

    if (!dailyMap.has(forecastDate)) {
      dailyMap.set(forecastDate, {
        peakValue: numericValue,
        peakHourLabel: numericValue === null ? null : hourLabel,
        valuesByHour: {},
      });
    }

    const bucket = dailyMap.get(forecastDate)!;
    bucket.valuesByHour[hourLabel] = numericValue;

    if (
      numericValue !== null
      && (bucket.peakValue === null || numericValue > bucket.peakValue)
    ) {
      bucket.peakValue = numericValue;
      bucket.peakHourLabel = hourLabel;
    }
  }

  return Array.from(dailyMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([forecastDate, bucket]): KmaLifestyleIndexDoc => ({
      category: 'UV',
      pollenType: null,
      areaNo: input.areaNo,
      sidoName: input.sidoName,
      forecastDate,
      issuedAt: issuedAtLabel,
      issuedAtUtc: issuedAtUtc.toISOString(),
      valueCode: bucket.peakValue === null ? null : String(bucket.peakValue),
      valueLabel: normalizeUvLabel(bucket.peakValue),
      peakValue: bucket.peakValue,
      peakHourLabel: bucket.peakHourLabel,
      valuesByHour: bucket.valuesByHour,
      updatedAt: input.ingestedAt,
      ingestedAt: input.ingestedAt,
      sourceVersion: input.sourceVersion,
    }));
}

export function buildPollenLatestDocs(input: {
  areaNo: string;
  sidoName: string;
  pollenType: PollenType;
  item: KmaLifestyleItem;
  ingestedAt: string;
  sourceVersion: string;
}) {
  const issuedAt = toNullableString(input.item.date);
  const issuedAtUtc = parseKmaLifestyleIssuedAt(issuedAt);
  if (!issuedAt || !issuedAtUtc) return [];
  const issuedAtLabel = formatIssuedAtLabel(issuedAt);

  const slots: Array<[key: string, offsetDays: number]> = [
    ['today', 0],
    ['tomorrow', 1],
    ['dayaftertomorrow', 2],
    ['todaysaftertomorrow', 3],
  ];

  return slots.map(([key, offsetDays]) => {
    const forecastAt = new Date(issuedAtUtc.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const rawValue = input.item[key];
    const label = normalizePollenLabel(rawValue);
    return {
      category: 'POLLEN',
      pollenType: input.pollenType,
      areaNo: input.areaNo,
      sidoName: input.sidoName,
      forecastDate: formatKstDateLabel(forecastAt),
      issuedAt: issuedAtLabel,
      issuedAtUtc: issuedAtUtc.toISOString(),
      valueCode: toNullableString(rawValue) ?? (toNullableNumber(rawValue) === null ? null : String(rawValue)),
      valueLabel: label,
      peakValue: null,
      peakHourLabel: null,
      valuesByHour: null,
      updatedAt: input.ingestedAt,
      ingestedAt: input.ingestedAt,
      sourceVersion: input.sourceVersion,
    } satisfies KmaLifestyleIndexDoc;
  });
}
