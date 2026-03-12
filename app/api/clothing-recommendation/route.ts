import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { withApiObservability } from '@/lib/api-observability';
import { applyRateLimit } from '@/lib/requestRateLimit';
import { getSharedCache, setSharedCache } from '@/lib/sharedCache';

const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'https://epi-log-ai.vercel.app';
const FALLBACK_TEMP = 22;
const FALLBACK_HUMIDITY = 45;
const CLOTHING_CACHE_SCOPE = 'route:clothing-recommendation';
const CLOTHING_CACHE_FRESH_MS = 5 * 60 * 1000;
const CLOTHING_CACHE_STALE_MS = 30 * 60 * 1000;
const CLOTHING_CACHE_HARD_TTL_MS = 24 * 60 * 60 * 1000;
const CLOTHING_TIMEOUT_MS = 4500;

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

function buildServerTimingHeader(startedAt: number): string {
  return `total;dur=${Date.now() - startedAt}`;
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
  const startedAt = Date.now();
  const rateLimit = applyRateLimit('/api/clothing-recommendation', request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: {
          ...corsHeaders(),
          'x-rate-limit-remaining': String(rateLimit.remaining),
          'x-rate-limit-reset': String(rateLimit.resetAt),
          'server-timing': buildServerTimingHeader(startedAt),
          'x-degraded': '1',
        },
      },
    );
  }

  const body = await parseRequestBody(request);
  const temperature = toNumber(body.temperature, FALLBACK_TEMP);
  const humidity = toNumber(body.humidity, FALLBACK_HUMIDITY);
  const cacheKey = JSON.stringify({
    temperature: Number(temperature.toFixed(1)),
    humidity: Number(humidity.toFixed(1)),
    userProfile: body.userProfile ?? null,
    airQuality: body.airQuality ?? null,
    airGrade: body.airGrade ?? null,
  });
  const cached = await getSharedCache<ClothingRecommendationView>(CLOTHING_CACHE_SCOPE, cacheKey);
  if (cached?.state === 'shared') {
    const degraded = cached.value.source.includes('fallback');
    return NextResponse.json(cached.value, {
      headers: {
        ...corsHeaders(),
        'x-rate-limit-remaining': String(rateLimit.remaining),
        'x-rate-limit-reset': String(rateLimit.resetAt),
        'server-timing': buildServerTimingHeader(startedAt),
        'x-bff-clothing-cache': 'primary=shared:hit',
        'x-degraded': degraded ? '1' : '0',
      },
    });
  }

  const stale = cached ?? await getSharedCache<ClothingRecommendationView>(CLOTHING_CACHE_SCOPE, cacheKey, {
    allowStale: true,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLOTHING_TIMEOUT_MS);
    let raw: Record<string, unknown>;
    try {
      const response = await fetch(`${AI_API_URL}/api/clothing-recommendation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          temperature,
          humidity,
          userProfile: body.userProfile ?? null,
          airQuality: body.airQuality ?? null,
          airGrade: body.airGrade ?? null,
        }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`AI clothing API failed: ${response.status} ${response.statusText}`);
      }

      raw = (await response.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timeoutId);
    }
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

    await setSharedCache(CLOTHING_CACHE_SCOPE, cacheKey, result, {
      freshMs: CLOTHING_CACHE_FRESH_MS,
      staleMs: CLOTHING_CACHE_STALE_MS,
      hardTtlMs: CLOTHING_CACHE_HARD_TTL_MS,
    });

    return NextResponse.json(result, {
      headers: {
        ...corsHeaders(),
        'x-rate-limit-remaining': String(rateLimit.remaining),
        'x-rate-limit-reset': String(rateLimit.resetAt),
        'server-timing': buildServerTimingHeader(startedAt),
        'x-bff-clothing-cache': 'primary=api:miss',
        'x-degraded': result.source.includes('fallback') ? '1' : '0',
      },
    });
  } catch (error) {
    console.error('[BFF] Clothing recommendation error:', error);
    if (stale?.state === 'stale') {
      return NextResponse.json(stale.value, {
        headers: {
          ...corsHeaders(),
          'x-rate-limit-remaining': String(rateLimit.remaining),
          'x-rate-limit-reset': String(rateLimit.resetAt),
          'server-timing': buildServerTimingHeader(startedAt),
          'x-bff-clothing-cache': 'primary=stale:hit',
          'x-degraded': '1',
        },
      });
    }

    return NextResponse.json(buildFallbackRecommendation(temperature, humidity), {
      headers: {
        ...corsHeaders(),
        'x-rate-limit-remaining': String(rateLimit.remaining),
        'x-rate-limit-reset': String(rateLimit.resetAt),
        'server-timing': buildServerTimingHeader(startedAt),
        'x-bff-clothing-cache': 'primary=api:miss',
        'x-degraded': '1',
      },
    });
  }
}

export const OPTIONS = withApiObservability('/api/clothing-recommendation', 'OPTIONS', handleOptions);
export const POST = withApiObservability('/api/clothing-recommendation', 'POST', handlePost);
