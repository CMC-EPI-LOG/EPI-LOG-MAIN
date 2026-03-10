import { describe, expect, it } from 'vitest';
import { normalizeLocationSelection } from '../../lib/locationSelection';

describe('locationSelection', () => {
  it('리 단위 도로명 주소는 읍/면 단위로 정규화한다', () => {
    const selection = normalizeLocationSelection({
      address: '경상남도 김해시 진영읍 가산로 91',
      bname: '본산리',
      sigungu: '김해시',
      sido: '경상남도',
    });

    expect(selection.displayAddress).toBe('진영읍');
    expect(selection.stationQuery).toBe('경상남도 김해시 진영읍');
  });

  it('일반 동 단위 주소는 기존처럼 동 단위를 유지한다', () => {
    const selection = normalizeLocationSelection({
      address: '서울특별시 강남구 테헤란로 212',
      bname: '역삼동',
      sigungu: '강남구',
      sido: '서울특별시',
    });

    expect(selection.displayAddress).toBe('역삼동');
    expect(selection.stationQuery).toBe('서울특별시 강남구 역삼동');
  });
});
