import { describe, expect, it } from 'vitest';
import { buildStationCandidates } from '../../lib/stationResolution';
import { resolveForecastStationName } from '../../lib/weatherForecastResolution';

describe('weather-forecast route station resolution', () => {
  it('direct dong match is preferred over broader district hints', () => {
    const requestedStation = '부산광역시 강서구 대저1동';
    const triedStations = buildStationCandidates(requestedStation);

    expect(resolveForecastStationName(requestedStation, triedStations, ['명지동', '대저동'])).toBe('대저동');
  });

  it('falls back to hint candidates when no direct dong forecast exists', () => {
    const requestedStation = '부산광역시 강서구 대저1동';
    const triedStations = buildStationCandidates(requestedStation);

    expect(resolveForecastStationName(requestedStation, triedStations, ['명지동', '녹산동'])).toBe('명지동');
  });
});
