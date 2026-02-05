/**
 * Character Utility Functions
 * Maps user profile and air quality data to character assets
 */

type AirQualityGrade = 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD';
type GradeCode = 'A' | 'B' | 'C' | 'D';
type AgeGroup = 'infant' | 'toddler' | 'elementary_low' | 'elementary_high' | 'teen_adult';
type AgeCode = '1' | '2' | '3' | '4' | '5';

/**
 * Maps air quality grade to character letter code
 * A: 좋음 (Good)
 * B: 보통 (Normal)
 * C: 나쁨 (Bad)
 * D: 매우 나쁨 (Very Bad)
 */
export function getGradeCode(grade?: string): GradeCode {
  if (!grade) return 'B'; // Default to Normal
  
  switch (grade.toUpperCase()) {
    case 'GOOD':
      return 'A';
    case 'NORMAL':
      return 'B';
    case 'BAD':
      return 'C';
    case 'VERY_BAD':
      return 'D';
    default:
      return 'B';
  }
}

/**
 * Maps age group to character number code
 * 1: 0~2세 영아 (Infant)
 * 2: 3~6세 유아 (Toddler)
 * 3: 7~9세 초등 저학년 (Elementary Low)
 * 4: 10~12세 초등 고학년 (Elementary High)
 * 5: 13세~ 청소년/성인 (Teen/Adult)
 */
export function getAgeCode(ageGroup?: string): AgeCode {
  if (!ageGroup) return '5'; // Default to Teen/Adult
  
  switch (ageGroup) {
    case 'infant':
      return '1';
    case 'toddler':
      return '2';
    case 'elementary_low':
      return '3';
    case 'elementary_high':
      return '4';
    case 'teen_adult':
      return '5';
    default:
      return '5';
  }
}

/**
 * Returns the character file path based on air quality grade and age group
 * Example: getCharacterPath('GOOD', 'toddler') → '/Character/A2.svg'
 */
export function getCharacterPath(grade?: string, ageGroup?: string): string {
  const gradeCode = getGradeCode(grade);
  const ageCode = getAgeCode(ageGroup);
  return `/Character/${gradeCode}${ageCode}.svg`;
}

/**
 * Returns the pastel background color for a given air quality grade
 */
export function getGradeBackgroundColor(grade?: string): string {
  const gradeCode = getGradeCode(grade);
  
  switch (gradeCode) {
    case 'A': // 좋음
      return 'bg-[#E6F4F1]';
    case 'B': // 보통
      return 'bg-[#FFF9E5]';
    case 'C': // 나쁨
      return 'bg-[#FFEDE0]';
    case 'D': // 매우 나쁨
      return 'bg-[#FCE8F3]';
    default:
      return 'bg-[#FFF9E5]';
  }
}

/**
 * Returns the grade label in Korean
 */
export function getGradeLabel(grade?: string): string {
  const gradeCode = getGradeCode(grade);
  
  switch (gradeCode) {
    case 'A':
      return '좋음';
    case 'B':
      return '보통';
    case 'C':
      return '나쁨';
    case 'D':
      return '매우 나쁨';
    default:
      return '보통';
  }
}
