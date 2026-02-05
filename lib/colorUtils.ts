/**
 * Color utility functions for Bento Box layout
 * Provides dynamic background colors based on air quality grade
 */

export type AirQualityGrade = 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD';

/**
 * Get background color for entire page based on air quality grade
 */
export function getBackgroundColor(grade: AirQualityGrade | string): string {
  const colors: Record<string, string> = {
    GOOD: '#E6F4F1',      // Mint
    NORMAL: '#FFF9E5',    // Lemon
    BAD: '#FFEDE0',       // Peach
    VERY_BAD: '#FCE8F3'   // Pink
  };
  return colors[grade] || '#F5F5F5'; // Default gray-beige
}

/**
 * Get status color for action recommendations
 */
export function getStatusColor(isPositive: boolean): string {
  return isPositive ? 'text-green-600' : 'text-red-600';
}

/**
 * Get grade badge color
 */
export function getGradeBadgeColor(grade: AirQualityGrade | string): string {
  const colors: Record<string, string> = {
    GOOD: 'bg-green-400',
    NORMAL: 'bg-yellow-400',
    BAD: 'bg-orange-400',
    VERY_BAD: 'bg-pink-400'
  };
  return colors[grade] || 'bg-gray-400';
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
