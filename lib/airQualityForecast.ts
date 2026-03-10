import { inferExpectedSido } from '@/lib/stationResolution';

export interface AirQualityForecastRawDoc {
  informCode?: string | null;
  forecastDate?: string | null;
  issuedAt?: string | null;
  issuedAtUtc?: string | Date | null;
  overall?: string | null;
  cause?: string | null;
  actionKnack?: string | null;
  gradesByRegion?: Record<string, string> | null;
}

export interface AirQualityForecastViewItem {
  forecastDate: string;
  pm10Grade: string | null;
  pm25Grade: string | null;
  overall: string | null;
  cause: string | null;
  actionKnack: string | null;
}

export interface AirQualityForecastView {
  requestedRegion: string | null;
  resolvedRegion: string | null;
  issuedAt: string | null;
  items: AirQualityForecastViewItem[];
}

const GYEONGGI_NORTH_HINTS = ['고양', '파주', '의정부', '양주', '포천', '동두천', '연천', '가평', '남양주'];
const GYEONGGI_SOUTH_HINTS = [
  '성남',
  '용인',
  '수원',
  '안양',
  '안산',
  '화성',
  '평택',
  '부천',
  '광명',
  '시흥',
  '군포',
  '오산',
  '이천',
  '안성',
  '하남',
  '광주',
  '과천',
  '의왕',
  '여주',
];
const GANGWON_EAST_HINTS = ['강릉', '동해', '속초', '삼척', '고성', '양양', '태백'];
const GANGWON_WEST_HINTS = ['춘천', '원주', '횡성', '홍천', '철원', '화천', '양구', '인제'];

export function normalizeForecastRegionKey(raw?: string | null) {
  if (!raw) return null;
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
  if (compact === '경기') return '경기';
  if (compact === '강원') return '강원';
  return compact;
}

function inferSpecialForecastRegion(baseRegion: string | null, query: string, availableRegions: Set<string>) {
  if (baseRegion === '경기') {
    if (GYEONGGI_NORTH_HINTS.some((token) => query.includes(token)) && availableRegions.has('경기북부')) {
      return '경기북부';
    }
    if (GYEONGGI_SOUTH_HINTS.some((token) => query.includes(token)) && availableRegions.has('경기남부')) {
      return '경기남부';
    }
  }

  if (baseRegion === '강원') {
    if (GANGWON_EAST_HINTS.some((token) => query.includes(token)) && availableRegions.has('영동')) {
      return '영동';
    }
    if (GANGWON_WEST_HINTS.some((token) => query.includes(token)) && availableRegions.has('영서')) {
      return '영서';
    }
  }

  return null;
}

function parseIssuedAtMs(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeGradeSeverity(grade: string | null | undefined) {
  const normalized = grade?.replace(/\s+/g, '') || '';
  if (!normalized) return 0;
  if (normalized.includes('매우나쁨')) return 4;
  if (normalized.includes('나쁨')) return 3;
  if (normalized.includes('보통')) return 2;
  if (normalized.includes('좋음')) return 1;
  return 0;
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function buildAirQualityForecastActionKnack(input: {
  pm10Grade: string | null;
  pm25Grade: string | null;
  overall: string | null;
  cause: string | null;
  actionKnack: string | null;
}) {
  const provided = input.actionKnack?.trim();
  if (provided) return provided;

  const combinedText = [input.overall, input.cause]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const severity = Math.max(
    normalizeGradeSeverity(input.pm10Grade),
    normalizeGradeSeverity(input.pm25Grade),
  );
  const hasVolatilitySignal = includesAny(combinedText, [
    '일시적',
    '오전',
    '오후',
    '밤',
    '늦은',
    '상승',
    '변동',
    '정체',
    '유입',
    '축적',
  ]);
  const hasTransportSignal = includesAny(combinedText, [
    '국외 미세먼지',
    '북서풍',
    '잔류',
    '대기정체',
    '축적',
    '유입',
  ]);

  if (severity >= 3 && hasVolatilitySignal) {
    return '외출 전 실시간 수치를 다시 확인하고, 민감군은 장시간 야외 활동을 줄여 주세요.';
  }

  if (severity >= 3) {
    return '야외 활동 시간은 짧게 가져가고, 외출 후 손씻기와 옷 정리를 바로 해 주세요.';
  }

  if (severity === 2 && hasVolatilitySignal) {
    return '외출은 가능하지만 오전·밤 변동 시간대에는 실시간 수치를 한 번 더 확인해 주세요.';
  }

  if (severity === 2 && hasTransportSignal) {
    return '전반적으로 무난하지만 공기 정체 시간대에는 환기를 짧게 하고 최신 수치를 함께 확인해 주세요.';
  }

  if (severity === 1) {
    return '야외 활동은 무난하지만 활동 전 최신 미세먼지 수치를 가볍게 확인해 주세요.';
  }

  if (combinedText) {
    return '외출 전 최신 미세먼지 예보와 실시간 수치를 함께 확인해 주세요.';
  }

  return null;
}

function resolveForecastRegion(
  requestedStation: string,
  regionHint: string | null,
  availableRegions: Set<string>,
) {
  const query = [requestedStation, regionHint].filter(Boolean).join(' ');
  const requestedRegion =
    normalizeForecastRegionKey(regionHint)
    || normalizeForecastRegionKey(inferExpectedSido(requestedStation));

  if (requestedRegion && availableRegions.has(requestedRegion)) {
    return {
      requestedRegion,
      resolvedRegion: requestedRegion,
    };
  }

  const specialRegion = inferSpecialForecastRegion(requestedRegion, query, availableRegions);
  if (specialRegion) {
    return {
      requestedRegion,
      resolvedRegion: specialRegion,
    };
  }

  for (const candidate of availableRegions) {
    if (query.includes(candidate)) {
      return {
        requestedRegion,
        resolvedRegion: candidate,
      };
    }
  }

  return {
    requestedRegion,
    resolvedRegion: null,
  };
}

export function mapAirQualityForecastDocsToView(
  docs: AirQualityForecastRawDoc[],
  requestedStation: string,
  regionHint: string | null,
): AirQualityForecastView | null {
  if (!Array.isArray(docs) || docs.length === 0) return null;

  const availableRegions = new Set(
    docs.flatMap((doc) => Object.keys(doc.gradesByRegion || {})).filter(Boolean),
  );
  const { requestedRegion, resolvedRegion } = resolveForecastRegion(
    requestedStation,
    regionHint,
    availableRegions,
  );

  const byDate = new Map<string, { PM10?: AirQualityForecastRawDoc; PM25?: AirQualityForecastRawDoc }>();

  for (const doc of docs) {
    const forecastDate = doc.forecastDate?.trim();
    const informCode = doc.informCode?.trim().toUpperCase();
    if (!forecastDate || (informCode !== 'PM10' && informCode !== 'PM25')) continue;
    if (!byDate.has(forecastDate)) byDate.set(forecastDate, {});
    byDate.get(forecastDate)![informCode] = doc;
  }

  const items = Array.from(byDate.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([forecastDate, grouped]) => {
      const pm10 = grouped.PM10;
      const pm25 = grouped.PM25;

      return {
        forecastDate,
        pm10Grade: resolvedRegion ? pm10?.gradesByRegion?.[resolvedRegion] || null : null,
        pm25Grade: resolvedRegion ? pm25?.gradesByRegion?.[resolvedRegion] || null : null,
        overall: pm10?.overall || pm25?.overall || null,
        cause: pm10?.cause || pm25?.cause || null,
        actionKnack: buildAirQualityForecastActionKnack({
          pm10Grade: resolvedRegion ? pm10?.gradesByRegion?.[resolvedRegion] || null : null,
          pm25Grade: resolvedRegion ? pm25?.gradesByRegion?.[resolvedRegion] || null : null,
          overall: pm10?.overall || pm25?.overall || null,
          cause: pm10?.cause || pm25?.cause || null,
          actionKnack: pm10?.actionKnack || pm25?.actionKnack || null,
        }),
      };
    })
    .filter((item) => item.pm10Grade || item.pm25Grade || item.overall || item.cause);

  if (items.length === 0) return null;

  const latestIssuedDoc = [...docs].sort(
    (left, right) => parseIssuedAtMs(right.issuedAtUtc || null) - parseIssuedAtMs(left.issuedAtUtc || null),
  )[0];

  return {
    requestedRegion,
    resolvedRegion,
    issuedAt: latestIssuedDoc?.issuedAt?.trim() || null,
    items,
  };
}
