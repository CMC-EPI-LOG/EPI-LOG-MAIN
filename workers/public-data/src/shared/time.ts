const KST_OFFSET_HOURS = 9;
const SHORT_FORECAST_BASE_TIMES = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
const DAY_MS = 24 * 60 * 60 * 1000;

function formatPart(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    ...options,
  }).format(date);
}

export function getKstDateKey(date: Date) {
  const year = formatPart(date, { year: 'numeric' });
  const month = formatPart(date, { month: '2-digit' });
  const day = formatPart(date, { day: '2-digit' });
  return `${year}${month}${day}`;
}

export function getKstHourMinute(date: Date) {
  const hour = formatPart(date, { hour: '2-digit', hour12: false });
  const minute = formatPart(date, { minute: '2-digit' });
  return `${hour}${minute}`;
}

export function parseAirKoreaDataTime(raw: string | undefined | null) {
  if (!raw) return null;
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!matched) return null;

  const [, year, month, day, hour, minute] = matched;
  const utcMillis = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - KST_OFFSET_HOURS,
    Number(minute),
  );

  return Number.isNaN(utcMillis) ? null : new Date(utcMillis);
}

export function parseAirKoreaForecastIssuedAt(raw: string | undefined | null) {
  if (!raw) return null;
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2})시\s*발표$/);
  if (!matched) return null;

  const [, year, month, day, hour] = matched;
  const utcMillis = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - KST_OFFSET_HOURS,
    0,
  );

  return Number.isNaN(utcMillis) ? null : new Date(utcMillis);
}

export function parseKmaForecastToUtc(fcstDate: string, fcstTime: string) {
  if (!/^\d{8}$/.test(fcstDate)) return null;
  if (!/^\d{3,4}$/.test(fcstTime)) return null;

  const padded = fcstTime.padStart(4, '0');
  const year = Number(fcstDate.slice(0, 4));
  const month = Number(fcstDate.slice(4, 6));
  const day = Number(fcstDate.slice(6, 8));
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2, 4));

  const utcMillis = Date.UTC(year, month - 1, day, hour - KST_OFFSET_HOURS, minute);
  return Number.isNaN(utcMillis) ? null : new Date(utcMillis);
}

export function getLatestSafeKmaShortForecastBase(now = new Date(), safetyLagMinutes = 20) {
  const lagged = new Date(now.getTime() - safetyLagMinutes * 60 * 1000);
  const currentDate = getKstDateKey(lagged);
  const currentTime = getKstHourMinute(lagged);
  const matchedBase = [...SHORT_FORECAST_BASE_TIMES].reverse().find((base) => base <= currentTime);

  if (matchedBase) {
    return { baseDate: currentDate, baseTime: matchedBase };
  }

  const previousDay = new Date(lagged.getTime() - 24 * 60 * 60 * 1000);
  return {
    baseDate: getKstDateKey(previousDay),
    baseTime: SHORT_FORECAST_BASE_TIMES[SHORT_FORECAST_BASE_TIMES.length - 1],
  };
}

export function hourFromFcstTime(fcstTime: string) {
  const padded = fcstTime.padStart(4, '0');
  const hour = Number.parseInt(padded.slice(0, 2), 10);
  return Number.isNaN(hour) ? 0 : hour;
}

export function expireAtFromIso(isoString: string, ttlDays: number) {
  const startAt = new Date(isoString);
  if (Number.isNaN(startAt.getTime())) {
    return null;
  }
  return new Date(startAt.getTime() + ttlDays * DAY_MS);
}

export function parseKmaLifestyleIssuedAt(raw: string | undefined | null) {
  if (!raw || !/^\d{10}$/.test(raw)) return null;

  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));

  const utcMillis = Date.UTC(year, month - 1, day, hour - KST_OFFSET_HOURS, 0);
  return Number.isNaN(utcMillis) ? null : new Date(utcMillis);
}

export function formatKstDateLabel(date: Date) {
  return formatPart(date, { year: 'numeric' })
    + '-'
    + formatPart(date, { month: '2-digit' })
    + '-'
    + formatPart(date, { day: '2-digit' });
}

export function formatKstHourLabel(date: Date) {
  return `${formatPart(date, { hour: '2-digit', hour12: false })}:00`;
}

export function getLatestKmaLifestyleIssueCandidates(
  now = new Date(),
  candidateCount = 3,
  safetyLagMinutes = 20,
) {
  const laggedKst = new Date(
    now.getTime() + KST_OFFSET_HOURS * 60 * 60 * 1000 - safetyLagMinutes * 60 * 1000,
  );
  const year = laggedKst.getUTCFullYear();
  const month = laggedKst.getUTCMonth();
  const day = laggedKst.getUTCDate();
  const hour = laggedKst.getUTCHours();
  const flooredHour = hour - (hour % 3);

  return Array.from({ length: candidateCount }, (_, index) => {
    const candidate = new Date(
      Date.UTC(year, month, day, flooredHour - KST_OFFSET_HOURS, 0, 0)
      - index * 3 * 60 * 60 * 1000,
    );
    const candidateKst = new Date(candidate.getTime() + KST_OFFSET_HOURS * 60 * 60 * 1000);
    return (
      `${candidateKst.getUTCFullYear()}`
      + `${candidateKst.getUTCMonth() + 1}`.padStart(2, '0')
      + `${candidateKst.getUTCDate()}`.padStart(2, '0')
      + `${candidateKst.getUTCHours()}`.padStart(2, '0')
    );
  });
}
