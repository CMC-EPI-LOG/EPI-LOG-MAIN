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

  it('전국 실패 샘플(인천/광주/대전/충남/전남/경북/경남)에 보정 힌트를 추가한다', () => {
    expect(buildStationCandidates('인천광역시 연수구 송도동')).toEqual(
      expect.arrayContaining(['송도', '동춘']),
    );
    expect(buildStationCandidates('광주광역시 북구 용봉동')).toEqual(
      expect.arrayContaining(['운암동', '두암동']),
    );
    expect(buildStationCandidates('대전광역시 유성구 봉명동')).toEqual(
      expect.arrayContaining(['구성동', '관평동']),
    );
    expect(buildStationCandidates('충청남도 천안시 서북구 불당동')).toEqual(
      expect.arrayContaining(['성황동', '백석동']),
    );
    expect(buildStationCandidates('전라남도 여수시 학동')).toEqual(
      expect.arrayContaining(['삼일동', '문수동']),
    );
    expect(buildStationCandidates('경상북도 포항시 남구 대잠동')).toEqual(
      expect.arrayContaining(['장흥동', '대도동']),
    );
    expect(buildStationCandidates('경상남도 창원시 성산구 중앙동')).toEqual(
      expect.arrayContaining(['성주동', '웅남동']),
    );
  });

  it('확장 샘플(대구/인천/광주/울산/경기/강원/충북/전남/경남) 보정 힌트를 포함한다', () => {
    expect(buildStationCandidates('대구광역시 수성구 범어동')).toEqual(
      expect.arrayContaining(['만촌동', '지산동']),
    );
    expect(buildStationCandidates('인천광역시 남동구 만수동')).toEqual(
      expect.arrayContaining(['구월동', '논현']),
    );
    expect(buildStationCandidates('광주광역시 광산구 우산동')).toEqual(
      expect.arrayContaining(['평동', '건국동']),
    );
    expect(buildStationCandidates('울산광역시 북구 염포동')).toEqual(
      expect.arrayContaining(['효문동', '농소동']),
    );
    expect(buildStationCandidates('경기도 고양시 일산동구 장항동')).toEqual(
      expect.arrayContaining(['주엽동', '행신동']),
    );
    expect(buildStationCandidates('강원특별자치도 원주시 단계동')).toEqual(
      expect.arrayContaining(['문막읍']),
    );
    expect(buildStationCandidates('충청북도 충주시 연수동')).toEqual(
      expect.arrayContaining(['호암동', '칠금동']),
    );
    expect(buildStationCandidates('전라남도 목포시 상동')).toEqual(
      expect.arrayContaining(['부흥동', '용당동']),
    );
    expect(buildStationCandidates('경상남도 김해시 내동')).toEqual(
      expect.arrayContaining(['장유동', '삼방동']),
    );
  });

  it('기존 분당구 힌트도 유지된다', () => {
    const candidates = buildStationCandidates('성남시 분당구');
    expect(candidates).toContain('정자동');
    expect(candidates).toContain('수내동');
  });

  it('보정 힌트가 있는 주소는 힌트 후보를 우선 순위로 둔다', () => {
    const candidates = buildStationCandidates('경상북도 포항시 남구 대잠동');
    expect(candidates[0]).toBe('장흥동');
  });

  it('강남구 주소는 구 단위 측정소 힌트를 우선 후보로 둔다', () => {
    const candidates = buildStationCandidates('서울특별시 강남구 역삼동');
    expect(candidates[0]).toBe('강남구');
  });

  it('보정 힌트가 없는 주소는 말단 행정동 후보를 우선 순위로 둔다', () => {
    const candidates = buildStationCandidates('서울특별시 종로구 사직동');
    expect(candidates[0]).toBe('사직동');
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
