import { describe, expect, it } from 'vitest';
import {
  buildAirQualityForecastActionKnack,
  mapAirQualityForecastDocsToView,
  normalizeForecastRegionKey,
} from '../../lib/airQualityForecast';

describe('airQualityForecast', () => {
  it('권역 키를 정규화한다', () => {
    expect(normalizeForecastRegionKey('서울')).toBe('서울');
    expect(normalizeForecastRegionKey('경기 남부')).toBe('경기남부');
    expect(normalizeForecastRegionKey('강원영서')).toBe('영서');
  });

  it('요청 지역 기준으로 PM10/PM2.5 예보를 묶어 반환한다', () => {
    const view = mapAirQualityForecastDocsToView(
      [
        {
          informCode: 'PM10',
          forecastDate: '2026-03-09',
          issuedAt: '2026-03-08 23시 발표',
          issuedAtUtc: '2026-03-08T14:00:00.000Z',
          overall: '전 권역이 좋음∼보통으로 예상됩니다.',
          cause: '대기 정체 영향입니다.',
          actionKnack: '외출 전 최신 지수를 확인하세요.',
          gradesByRegion: { 경남: '좋음', 서울: '보통' },
        },
        {
          informCode: 'PM25',
          forecastDate: '2026-03-09',
          issuedAt: '2026-03-08 23시 발표',
          issuedAtUtc: '2026-03-08T14:00:00.000Z',
          overall: '전 권역이 좋음∼보통으로 예상됩니다.',
          cause: '대기 정체 영향입니다.',
          actionKnack: '외출 전 최신 지수를 확인하세요.',
          gradesByRegion: { 경남: '보통', 서울: '나쁨' },
        },
      ],
      '경상남도 김해시 진영읍',
      '경남',
    );

    expect(view?.resolvedRegion).toBe('경남');
    expect(view?.items).toEqual([
      {
        forecastDate: '2026-03-09',
        pm10Grade: '좋음',
        pm25Grade: '보통',
        overall: '전 권역이 좋음∼보통으로 예상됩니다.',
        cause: '대기 정체 영향입니다.',
        actionKnack: '외출 전 최신 지수를 확인하세요.',
      },
    ]);
  });

  it('actionKnack가 없으면 overall/cause와 등급으로 짧은 행동 요약을 생성한다', () => {
    expect(
      buildAirQualityForecastActionKnack({
        pm10Grade: '보통',
        pm25Grade: '나쁨',
        overall: '수도권은 나쁨으로 예상됩니다.',
        cause: '국외 미세먼지 유입과 대기 정체 영향입니다.',
        actionKnack: null,
      }),
    ).toBe('외출 전 실시간 수치를 다시 확인하고, 민감군은 장시간 야외 활동을 줄여 주세요.');
  });
});
