import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { withApiObservability } from '@/lib/api-observability';

const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'https://epi-log-ai.vercel.app';
const FALLBACK_TEMP = 22;
const FALLBACK_HUMIDITY = 45;

export const runtime = 'nodejs';

interface ClothingRecommendationView {
  summary: string;
  recommendation: string;
  tips: string[];
  comfortLevel: string;
  temperature: number;
  humidity: number;
  source: string;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function buildFallbackRecommendation(temperature: number, humidity: number): ClothingRecommendationView {
  let summary = '활동하기 무난한 날씨예요.';
  let recommendation = '가디건/맨투맨 + 긴바지';
  let comfortLevel = 'MILD';

  if (temperature < -5) {
    summary = '한파 수준이에요. 방한 장비를 최대치로 준비하세요.';
    recommendation = '패딩 + 두꺼운 니트 + 내복 + 목도리/장갑';
    comfortLevel = 'FREEZING';
  } else if (temperature < 5) {
    summary = '매우 추워요. 보온 중심 레이어링이 필요해요.';
    recommendation = '두꺼운 코트/패딩 + 기모 상의 + 긴바지';
    comfortLevel = 'COLD';
  } else if (temperature < 12) {
    summary = '쌀쌀한 편이에요. 가벼운 겉옷을 꼭 챙기세요.';
    recommendation = '트렌치/자켓 + 긴팔 상의 + 긴바지';
    comfortLevel = 'CHILLY';
  } else if (temperature < 20) {
    summary = '활동하기 무난한 날씨예요.';
    recommendation = '가디건/맨투맨 + 긴바지';
    comfortLevel = 'MILD';
  } else if (temperature < 27) {
    summary = '다소 따뜻해요. 얇고 통풍 잘되는 옷이 좋아요.';
    recommendation = '반팔 + 얇은 셔츠(또는 가디건) + 통풍 좋은 하의';
    comfortLevel = 'WARM';
  } else {
    summary = '더운 날씨예요. 열 배출이 잘되는 복장이 좋아요.';
    recommendation = '반팔 + 반바지/얇은 바지 + 통풍 좋은 소재';
    comfortLevel = 'HOT';
  }

  const tips: string[] = [];
  if (humidity >= 75) {
    tips.push('습도가 높아요. 땀 배출이 잘되는 소재를 권장해요.');
    if (temperature >= 25) {
      tips.push('체감 더위가 커질 수 있어요. 여벌 옷을 준비해 주세요.');
    }
  } else if (humidity <= 30) {
    tips.push('건조한 편이에요. 얇은 겉옷으로 체온과 피부를 함께 관리하세요.');
  } else {
    tips.push('현재 습도는 비교적 안정적이에요. 활동량에 따라 한 겹 조절하세요.');
  }

  if (temperature <= 5) {
    tips.push('실내외 온도차가 큰 날이에요. 탈착 가능한 겉옷 구성이 안전해요.');
  } else if (temperature >= 28) {
    tips.push('밝은 색, 통풍 좋은 소재의 옷을 추천해요.');
  }

  return {
    summary,
    recommendation,
    tips: tips.slice(0, 3),
    comfortLevel,
    temperature: Number(temperature.toFixed(1)),
    humidity: Number(humidity.toFixed(1)),
    source: 'fallback-bff',
  };
}

async function parseRequestBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function handlePost(request: Request) {
  const body = await parseRequestBody(request);
  const temperature = toNumber(body.temperature, FALLBACK_TEMP);
  const humidity = toNumber(body.humidity, FALLBACK_HUMIDITY);

  try {
    const response = await fetch(`${AI_API_URL}/api/clothing-recommendation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ temperature, humidity }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`AI clothing API failed: ${response.status} ${response.statusText}`);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const fallback = buildFallbackRecommendation(temperature, humidity);

    const result: ClothingRecommendationView = {
      summary: typeof raw.summary === 'string' ? raw.summary : fallback.summary,
      recommendation:
        typeof raw.recommendation === 'string' ? raw.recommendation : fallback.recommendation,
      tips: Array.isArray(raw.tips)
        ? raw.tips.filter((tip): tip is string => typeof tip === 'string').slice(0, 3)
        : fallback.tips,
      comfortLevel: typeof raw.comfortLevel === 'string' ? raw.comfortLevel : fallback.comfortLevel,
      temperature: toNumber(raw.temperature, temperature),
      humidity: toNumber(raw.humidity, humidity),
      source: typeof raw.source === 'string' ? raw.source : 'ai',
    };

    return NextResponse.json(result, { headers: corsHeaders() });
  } catch (error) {
    console.error('[BFF] Clothing recommendation error:', error);
    return NextResponse.json(buildFallbackRecommendation(temperature, humidity), {
      headers: corsHeaders(),
    });
  }
}

export const OPTIONS = withApiObservability('/api/clothing-recommendation', 'OPTIONS', handleOptions);
export const POST = withApiObservability('/api/clothing-recommendation', 'POST', handlePost);
