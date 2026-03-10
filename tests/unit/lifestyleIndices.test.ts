import { describe, expect, it } from 'vitest';
import { mapLifestyleIndexDocsToView } from '../../lib/lifestyleIndices';

describe('lifestyleIndices', () => {
  it('자외선과 꽃가루 문서를 홈 카드용 뷰로 묶는다', () => {
    const view = mapLifestyleIndexDocsToView(
      [
        {
          category: 'UV',
          pollenType: null,
          sidoName: '경남',
          forecastDate: '2026-03-09',
          issuedAt: '2026030906',
          issuedAtUtc: '2026-03-08T21:00:00.000Z',
          peakValue: 7,
          peakHourLabel: '12:00',
          valueLabel: '높음',
        },
        {
          category: 'POLLEN',
          pollenType: 'pine',
          sidoName: '경남',
          forecastDate: '2026-03-09',
          issuedAt: '2026030906',
          issuedAtUtc: '2026-03-08T21:00:00.000Z',
          valueLabel: '보통',
        },
        {
          category: 'POLLEN',
          pollenType: 'oak',
          sidoName: '경남',
          forecastDate: '2026-03-09',
          issuedAt: '2026030906',
          issuedAtUtc: '2026-03-08T21:00:00.000Z',
          valueLabel: '높음',
        },
        {
          category: 'POLLEN',
          pollenType: 'weed',
          sidoName: '경남',
          forecastDate: '2026-03-09',
          issuedAt: '2026030906',
          issuedAtUtc: '2026-03-08T21:00:00.000Z',
          valueLabel: '낮음',
        },
      ],
      '경상남도 김해시 진영읍',
      '경남',
    );

    expect(view?.resolvedRegion).toBe('경남');
    expect(view?.uvItems[0]).toEqual({
      forecastDate: '2026-03-09',
      peakValue: 7,
      peakLabel: '높음',
      peakHourLabel: '12:00',
    });
    expect(view?.pollenItems[0]).toEqual({
      forecastDate: '2026-03-09',
      overallLabel: '높음',
      pineLabel: '보통',
      oakLabel: '높음',
      weedLabel: '낮음',
    });
    expect(view?.actionSummary).toContain('꽃가루가 강한 편');
  });
});
