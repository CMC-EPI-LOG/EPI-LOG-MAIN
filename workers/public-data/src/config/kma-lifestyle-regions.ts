export type KmaLifestyleRegion = {
  areaNo: string;
  sidoName: string;
  aliases: string[];
};

export const KMA_LIFESTYLE_REGIONS: KmaLifestyleRegion[] = [
  { areaNo: '1100000000', sidoName: '서울', aliases: ['서울'] },
  { areaNo: '2600000000', sidoName: '부산', aliases: ['부산'] },
  { areaNo: '2700000000', sidoName: '대구', aliases: ['대구'] },
  { areaNo: '2800000000', sidoName: '인천', aliases: ['인천'] },
  { areaNo: '2900000000', sidoName: '광주', aliases: ['광주'] },
  { areaNo: '3000000000', sidoName: '대전', aliases: ['대전'] },
  { areaNo: '3100000000', sidoName: '울산', aliases: ['울산'] },
  { areaNo: '3600000000', sidoName: '세종', aliases: ['세종'] },
  { areaNo: '4100000000', sidoName: '경기', aliases: ['경기', '경기남부', '경기북부'] },
  { areaNo: '4200000000', sidoName: '강원', aliases: ['강원', '영서', '영동'] },
  { areaNo: '4300000000', sidoName: '충북', aliases: ['충북'] },
  { areaNo: '4400000000', sidoName: '충남', aliases: ['충남'] },
  { areaNo: '4500000000', sidoName: '전북', aliases: ['전북'] },
  { areaNo: '4600000000', sidoName: '전남', aliases: ['전남'] },
  { areaNo: '4700000000', sidoName: '경북', aliases: ['경북'] },
  { areaNo: '4800000000', sidoName: '경남', aliases: ['경남'] },
  { areaNo: '5000000000', sidoName: '제주', aliases: ['제주'] },
];
