/**
 * Color utility functions for Bento Box layout
 * Provides dynamic background colors based on air quality grade
 */

export type AirQualityGrade = 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD';

const GRADE_BG_COLORS: Record<string, string> = {
  GOOD: '#E6F4F1',
  NORMAL: '#FFF9E5',
  BAD: '#FFEDE0',
  VERY_BAD: '#FFE9E9',
};

const GRADE_BADGE_COLORS: Record<string, string> = {
  GOOD: 'bg-green-400',
  NORMAL: 'bg-yellow-400',
  BAD: 'bg-orange-400',
  VERY_BAD: 'bg-red-400',
};

/**
 * Get background color for entire page based on air quality grade
 */
export function getBackgroundColor(grade: AirQualityGrade | string): string {
  return GRADE_BG_COLORS[grade] || '#F5F5F5';
}

/**
 * Keep recommendation text readable while maintaining red/green semantics.
 */
export function getStatusColor(isPositive: boolean): string {
  return isPositive ? 'text-green-700' : 'text-red-700';
}

/**
 * Get grade badge color
 */
export function getGradeBadgeColor(grade: AirQualityGrade | string): string {
  return GRADE_BADGE_COLORS[grade] || 'bg-gray-400';
}

/**
 * Get grade text in Korean
 */
export function getGradeText(grade: AirQualityGrade | string): string {
  const texts: Record<string, string> = {
    GOOD: '좋음',
    NORMAL: '보통',
    BAD: '나쁨',
    VERY_BAD: '매우 나쁨'
  };
  return texts[grade] || '알 수 없음';
}
