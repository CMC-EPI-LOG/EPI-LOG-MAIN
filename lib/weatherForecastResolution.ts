import { buildDirectStationCandidates } from '@/lib/stationResolution';

export function resolveForecastStationName(
  requestedStation: string,
  triedStations: string[],
  availableStations: string[],
): string | null {
  const availableSet = new Set(
    availableStations
      .map((station) => station.trim())
      .filter(Boolean),
  );

  for (const candidate of buildDirectStationCandidates(requestedStation)) {
    if (availableSet.has(candidate)) {
      return candidate;
    }
  }

  for (const candidate of triedStations) {
    if (availableSet.has(candidate)) {
      return candidate;
    }
  }

  return availableStations[0] || null;
}
