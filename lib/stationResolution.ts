const STATION_HINTS: Record<string, string[]> = {
  '성남시 분당구': ['정자동', '수내동', '운중동'],
  분당구: ['정자동', '수내동', '운중동'],
  판교동: ['운중동', '정자동'],
  // 서울 일부 구는 동 단위보다 구 단위 측정소로 수렴하는 케이스가 있어 우선 힌트를 둔다.
  '서울특별시 강남구': ['강남구', '역삼동'],
  '서울 강남구': ['강남구', '역삼동'],
  강남구: ['강남구', '역삼동'],
  세종시: ['보람동', '아름동', '한솔동', '조치원읍'],
  세종특별자치시: ['보람동', '아름동', '한솔동', '조치원읍'],
  // 전국 단위 신뢰성 스모크에서 DEGRADED가 발생한 지역 우선 보강
  '인천광역시 연수구': ['송도', '동춘', '청라'],
  '인천 연수구': ['송도', '동춘', '청라'],
  연수구: ['송도', '동춘'],
  '광주광역시 북구': ['운암동', '두암동', '일곡동', '건국동'],
  '광주 북구': ['운암동', '두암동', '일곡동', '건국동'],
  '대전광역시 유성구': ['구성동', '관평동', '노은동'],
  '대전 유성구': ['구성동', '관평동', '노은동'],
  '충청남도 천안시 서북구': ['성황동', '백석동', '성성동', '신방동'],
  '충남 천안시 서북구': ['성황동', '백석동', '성성동', '신방동'],
  '전라남도 여수시': ['삼일동', '문수동', '율촌면', '월내동', '여수항'],
  '전남 여수시': ['삼일동', '문수동', '율촌면', '월내동', '여수항'],
  '경상북도 포항시 남구': ['장흥동', '대도동', '연일읍', '장량동', '청림동'],
  '경북 포항시 남구': ['장흥동', '대도동', '연일읍', '장량동', '청림동'],
  '경상남도 창원시 성산구': ['성주동', '웅남동', '사파동', '명서동', '회원동'],
  '경남 창원시 성산구': ['성주동', '웅남동', '사파동', '명서동', '회원동'],
  // 2026-02-27 확장 스모크(34개)에서 추가로 검출된 행정동-측정소 불일치 보정
  '대구광역시 수성구': ['만촌동', '지산동'],
  '대구 수성구': ['만촌동', '지산동'],
  '인천광역시 남동구': ['구월동', '논현'],
  '인천 남동구': ['구월동', '논현'],
  '광주광역시 광산구': ['평동', '건국동', '치평동'],
  '광주 광산구': ['평동', '건국동', '치평동'],
  '울산광역시 북구': ['효문동', '농소동'],
  '울산 북구': ['효문동', '농소동'],
  '경기도 고양시 일산동구': ['주엽동', '행신동', '식사동'],
  '경기 고양시 일산동구': ['주엽동', '행신동', '식사동'],
  '강원특별자치도 원주시': ['문막읍'],
  '강원 원주시': ['문막읍'],
  '충청북도 충주시': ['호암동', '칠금동'],
  '충북 충주시': ['호암동', '칠금동'],
  '전라남도 목포시': ['부흥동', '용당동'],
  '전남 목포시': ['부흥동', '용당동'],
  '경상남도 김해시': ['장유동', '삼방동', '동상동', '진영읍'],
  '경남 김해시': ['장유동', '삼방동', '동상동', '진영읍'],
  // 부산은 구/동 명칭이 타 시도와 겹치는 경우가 많아 대표 측정소 힌트를 명시한다.
  '부산광역시 중구': ['광복동'],
  '부산광역시 서구': ['대신동'],
  '부산광역시 동구': ['초량동'],
  '부산광역시 영도구': ['태종대', '청학동'],
  '부산광역시 부산진구': ['전포동', '개금동'],
  '부산광역시 동래구': ['명장동'],
  '부산광역시 남구': ['대연동', '용호동'],
  '부산광역시 북구': ['화명동', '덕천동'],
  '부산광역시 해운대구': ['우동', '좌동'],
  '부산광역시 사하구': ['당리동', '장림동'],
  '부산광역시 금정구': ['청룡동'],
  '부산광역시 강서구': ['명지동', '녹산동', '대저동'],
  '부산광역시 연제구': ['연산동'],
  '부산광역시 수영구': ['광안동'],
  '부산광역시 사상구': ['학장동', '삼락동'],
  '부산광역시 기장군': ['기장읍'],
  // 주소 검색 소스에 따라 시도명이 `부산`으로만 전달되는 케이스도 함께 처리한다.
  '부산 중구': ['광복동'],
  '부산 서구': ['대신동'],
  '부산 동구': ['초량동'],
  '부산 영도구': ['태종대', '청학동'],
  '부산 부산진구': ['전포동', '개금동'],
  '부산 동래구': ['명장동'],
  '부산 남구': ['대연동', '용호동'],
  '부산 북구': ['화명동', '덕천동'],
  '부산 해운대구': ['우동', '좌동'],
  '부산 사하구': ['당리동', '장림동'],
  '부산 금정구': ['청룡동'],
  '부산 강서구': ['명지동', '녹산동', '대저동'],
  '부산 연제구': ['연산동'],
  '부산 수영구': ['광안동'],
  '부산 사상구': ['학장동', '삼락동'],
  '부산 기장군': ['기장읍'],
  // depth1 정보가 없는 기존 stationName 입력과도 호환되도록, 비교적 고유한 구/군 키를 함께 둔다.
  부산진구: ['전포동', '개금동'],
  동래구: ['명장동'],
  영도구: ['태종대', '청학동'],
  해운대구: ['우동', '좌동'],
  사하구: ['당리동', '장림동'],
  금정구: ['청룡동'],
  연제구: ['연산동'],
  수영구: ['광안동'],
  사상구: ['학장동', '삼락동'],
  기장군: ['기장읍'],
};

const SIDO_CANONICAL_RULES: Array<{ canonical: string; tokens: string[] }> = [
  { canonical: '서울', tokens: ['서울특별시', '서울'] },
  { canonical: '부산', tokens: ['부산광역시', '부산'] },
  { canonical: '대구', tokens: ['대구광역시', '대구'] },
  { canonical: '인천', tokens: ['인천광역시', '인천'] },
  { canonical: '광주', tokens: ['광주광역시', '광주'] },
  { canonical: '대전', tokens: ['대전광역시', '대전'] },
  { canonical: '울산', tokens: ['울산광역시', '울산'] },
  { canonical: '세종', tokens: ['세종특별자치시', '세종시', '세종'] },
  { canonical: '경기', tokens: ['경기도', '경기'] },
  { canonical: '강원', tokens: ['강원특별자치도', '강원도', '강원'] },
  { canonical: '충북', tokens: ['충청북도', '충북'] },
  { canonical: '충남', tokens: ['충청남도', '충남'] },
  { canonical: '전북', tokens: ['전북특별자치도', '전라북도', '전북'] },
  { canonical: '전남', tokens: ['전라남도', '전남'] },
  { canonical: '경북', tokens: ['경상북도', '경북'] },
  { canonical: '경남', tokens: ['경상남도', '경남'] },
  { canonical: '제주', tokens: ['제주특별자치도', '제주도', '제주'] },
];

export function normalizeDongName(name: string) {
  return name.replace(/^(.+?)\d+동$/, '$1동');
}

export function normalizeSubregionName(name: string) {
  // Kakao depth3 often includes numeric suffixes like `역삼1동`, `효자동1가`.
  // Normalize to maximize DB hit rate.
  return name
    .replace(/^(.+?)\d+동$/, '$1동')
    .replace(/^(.+?)\d+가$/, '$1')
    .replace(/^(.+?)\d+리$/, '$1리');
}

export function buildStationCandidates(rawStation: string): string[] {
  const cleaned = rawStation.trim().replace(/\s+/g, ' ');
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (value?: string) => {
    if (!value) return;
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const tokens = cleaned.split(' ').filter(Boolean);
  const matchedHints: string[] = [];
  const matchedHintSet = new Set<string>();
  for (const [key, hints] of Object.entries(STATION_HINTS)) {
    if (cleaned.includes(key) || tokens.includes(key)) {
      for (const hint of hints) {
        if (matchedHintSet.has(hint)) continue;
        matchedHintSet.add(hint);
        matchedHints.push(hint);
      }
    }
  }

  const lastToken = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
  const prevToken = tokens.length > 1 ? tokens[tokens.length - 2] : undefined;

  // 1차 매칭 성공률 향상을 위해 (힌트 -> 행정동 축약명) 순서로 우선 시도한다.
  matchedHints.forEach((hint) => add(hint));
  if (lastToken) {
    add(normalizeSubregionName(lastToken));
    add(normalizeDongName(lastToken));
    add(lastToken);
  }
  if (prevToken && lastToken) {
    add(`${prevToken} ${normalizeSubregionName(lastToken)}`);
    add(`${prevToken} ${lastToken}`);
  }

  add(cleaned);
  add(cleaned.replace(/\s+/g, ''));
  add(normalizeDongName(cleaned));
  add(normalizeSubregionName(cleaned));

  for (const token of tokens) {
    add(token);
    add(normalizeDongName(token));
    add(normalizeSubregionName(token));
  }

  if (tokens.length >= 2) {
    add(tokens[tokens.length - 2]);
  }

  return candidates;
}

function canonicalizeSido(value: string): string | null {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return null;

  for (const rule of SIDO_CANONICAL_RULES) {
    if (rule.tokens.some((token) => compact.includes(token.replace(/\s+/g, '')))) {
      return rule.canonical;
    }
  }

  return compact;
}

export function inferExpectedSido(stationQuery: string): string | null {
  const compact = stationQuery.replace(/\s+/g, '');
  if (!compact) return null;

  for (const rule of SIDO_CANONICAL_RULES) {
    if (rule.tokens.some((token) => compact.includes(token.replace(/\s+/g, '')))) {
      return rule.canonical;
    }
  }

  return null;
}

export function isSidoMismatch(expectedSido: string | null, resolvedSido?: string | null): boolean {
  if (!expectedSido || !resolvedSido) return false;
  const normalizedResolved = canonicalizeSido(resolvedSido);
  if (!normalizedResolved) return false;
  return normalizedResolved !== expectedSido;
}
