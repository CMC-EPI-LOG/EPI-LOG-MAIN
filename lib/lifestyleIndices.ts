import { inferExpectedSido } from '@/lib/stationResolution';
import { normalizeForecastRegionKey } from '@/lib/airQualityForecast';

export interface LifestyleIndexRawDoc {
  category?: 'UV' | 'POLLEN' | null;
  pollenType?: 'pine' | 'oak' | 'weed' | null;
  sidoName?: string | null;
  forecastDate?: string | null;
  issuedAt?: string | null;
  issuedAtUtc?: string | Date | null;
  valueCode?: string | null;
  valueLabel?: string | null;
  peakValue?: number | null;
  peakHourLabel?: string | null;
}

export interface LifestyleUvViewItem {
  forecastDate: string;
  peakValue: number | null;
  peakLabel: string | null;
  peakHourLabel: string | null;
}

export interface LifestylePollenViewItem {
  forecastDate: string;
  overallLabel: string | null;
  pineLabel: string | null;
  oakLabel: string | null;
  weedLabel: string | null;
}

export interface LifestyleIndicesView {
  requestedRegion: string | null;
  resolvedRegion: string | null;
  uvIssuedAt: string | null;
  pollenIssuedAt: string | null;
  uvItems: LifestyleUvViewItem[];
  pollenItems: LifestylePollenViewItem[];
  actionSummary: string | null;
}

function severityFromLabel(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, '') || '';
  if (!normalized) return 0;
  if (normalized.includes('위험')) return 5;
  if (normalized.includes('매우높음') || normalized.includes('매우나쁨')) return 4;
  if (normalized.includes('높음') || normalized.includes('나쁨')) return 3;
  if (normalized.includes('보통')) return 2;
  if (normalized.includes('낮음') || normalized.includes('좋음')) return 1;
  return 0;
}

function parseIssuedAtMs(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildLifestyleActionSummary(input: {
  uvToday: LifestyleUvViewItem | null;
  pollenToday: LifestylePollenViewItem | null;
}) {
  const uvSeverity = severityFromLabel(input.uvToday?.peakLabel);
  const pollenSeverity = severityFromLabel(input.pollenToday?.overallLabel);

  if (uvSeverity >= 4 && pollenSeverity >= 3) {
    return '한낮 야외 활동은 짧게 하고, 외출 뒤 손·얼굴을 씻은 뒤 옷 먼지를 털어 주세요.';
  }

  if (uvSeverity >= 4) {
    return '정오 전후 야외 활동 전에는 모자·선크림을 챙기고, 그늘 위주로 이동해 주세요.';
  }

  if (pollenSeverity >= 3) {
    return '꽃가루가 강한 편이라 외출 뒤 세안과 환기 시간을 짧게 가져가는 편이 좋아요.';
  }

  if (uvSeverity >= 2 || pollenSeverity >= 2) {
    return '야외 활동은 가능하지만 외출 전 생활지수를 한 번 더 확인해 주세요.';
  }

  return '생활지수는 전반적으로 무난하지만, 낮 시간대 변동은 가볍게 확인해 주세요.';
}

export function mapLifestyleIndexDocsToView(
  docs: LifestyleIndexRawDoc[],
  requestedStation: string,
  regionHint: string | null,
): LifestyleIndicesView | null {
  if (!Array.isArray(docs) || docs.length === 0) return null;

  const requestedRegion =
    normalizeForecastRegionKey(regionHint)
    || normalizeForecastRegionKey(inferExpectedSido(requestedStation));
  const resolvedRegion =
    docs
      .map((doc) => normalizeForecastRegionKey(doc.sidoName || null))
      .find(Boolean)
    || requestedRegion
    || null;

  const uvItems = docs
    .filter((doc) => doc.category === 'UV')
    .sort((left, right) => {
      const dateCompare = String(left.forecastDate || '').localeCompare(String(right.forecastDate || ''));
      if (dateCompare !== 0) return dateCompare;
      return parseIssuedAtMs(right.issuedAtUtc) - parseIssuedAtMs(left.issuedAtUtc);
    })
    .map((doc) => ({
      forecastDate: doc.forecastDate || '',
      peakValue: typeof doc.peakValue === 'number' ? doc.peakValue : null,
      peakLabel: doc.valueLabel || null,
      peakHourLabel: doc.peakHourLabel || null,
    }))
    .filter((item, index, arr) => item.forecastDate && arr.findIndex((candidate) => candidate.forecastDate === item.forecastDate) === index);

  const pollenByDate = new Map<string, LifestylePollenViewItem>();
  const pollenIssuedAtCandidates: string[] = [];

  for (const doc of docs.filter((entry) => entry.category === 'POLLEN')) {
    const forecastDate = doc.forecastDate || '';
    if (!forecastDate) continue;

    if (!pollenByDate.has(forecastDate)) {
      pollenByDate.set(forecastDate, {
        forecastDate,
        overallLabel: null,
        pineLabel: null,
        oakLabel: null,
        weedLabel: null,
      });
    }

    const bucket = pollenByDate.get(forecastDate)!;
    if (doc.pollenType === 'pine') bucket.pineLabel = doc.valueLabel || null;
    if (doc.pollenType === 'oak') bucket.oakLabel = doc.valueLabel || null;
    if (doc.pollenType === 'weed') bucket.weedLabel = doc.valueLabel || null;
    if (doc.issuedAt) pollenIssuedAtCandidates.push(doc.issuedAt);
  }

  const pollenItems = Array.from(pollenByDate.values())
    .sort((left, right) => left.forecastDate.localeCompare(right.forecastDate))
    .map((item) => {
      const labels = [item.pineLabel, item.oakLabel, item.weedLabel];
      const overallLabel =
        labels
          .filter(Boolean)
          .sort((left, right) => severityFromLabel(right) - severityFromLabel(left))[0]
        || null;
      return {
        ...item,
        overallLabel,
      };
    });

  const uvIssuedAt =
    docs
      .filter((doc) => doc.category === 'UV' && doc.issuedAt)
      .sort((left, right) => parseIssuedAtMs(right.issuedAtUtc) - parseIssuedAtMs(left.issuedAtUtc))[0]
      ?.issuedAt
    || null;

  const pollenIssuedAt = pollenIssuedAtCandidates.sort().slice(-1)[0] || null;
  const uvToday = uvItems[0] || null;
  const pollenToday = pollenItems[0] || null;

  return {
    requestedRegion,
    resolvedRegion,
    uvIssuedAt,
    pollenIssuedAt,
    uvItems,
    pollenItems,
    actionSummary: buildLifestyleActionSummary({
      uvToday,
      pollenToday,
    }),
  };
}
