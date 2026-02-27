import { describe, expect, it } from 'vitest';
import {
  buildStationCandidates,
  inferExpectedSido,
  isSidoMismatch,
} from '../../lib/stationResolution';

describe('stationResolution', () => {
  it('부산 구/동 입력에 대표 측정소 힌트를 추가한다', () => {
    const candidates = buildStationCandidates('부산광역시 부산진구 부전동');

    expect(candidates).toContain('부산광역시 부산진구 부전동');
    expect(candidates).toContain('전포동');
    expect(candidates).toContain('개금동');
  });

  it('기존 분당구 힌트도 유지된다', () => {
    const candidates = buildStationCandidates('성남시 분당구');
    expect(candidates).toContain('정자동');
    expect(candidates).toContain('수내동');
  });

  it('요청 station query에서 기대 시도를 추론한다', () => {
    expect(inferExpectedSido('부산광역시 중구 영주동')).toBe('부산');
    expect(inferExpectedSido('서울특별시 강남구 역삼동')).toBe('서울');
    expect(inferExpectedSido('중구')).toBeNull();
  });

  it('시도 불일치 여부를 판별한다', () => {
    expect(isSidoMismatch('부산', '서울')).toBe(true);
    expect(isSidoMismatch('부산', '부산광역시')).toBe(false);
    expect(isSidoMismatch('부산', null)).toBe(false);
    expect(isSidoMismatch(null, '서울')).toBe(false);
  });
});
