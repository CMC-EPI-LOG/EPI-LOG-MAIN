import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { withApiObservability } from '@/lib/api-observability';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const KAKAO_TIMEOUT_MS = 5000;

interface KakaoRegionDocument {
  address_name?: string;
  region_1depth_name?: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
  region_type?: string;
}

interface ReverseGeocodeSuccessPayload {
  address: string | null;
  regionName: string;
  stationCandidate: string;
  fallbackApplied?: boolean;
}

function toCoordinate(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRegion(doc: KakaoRegionDocument) {
  const depth1 = (doc.region_1depth_name || '').trim();
  const depth2 = (doc.region_2depth_name || '').trim();
  const depth3 = (doc.region_3depth_name || '').trim();
  const stationCandidate =
    [depth1, depth2, depth3].filter(Boolean).join(' ').trim() ||
    [depth2, depth3].filter(Boolean).join(' ').trim() ||
    depth1 ||
    depth2 ||
    depth3;
  const regionName = depth3 || depth2;

  if (!regionName || !stationCandidate) return null;
  return {
    address: doc.address_name,
    regionName,
    stationCandidate,
  };
}

function normalizeFallbackStationName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function buildFallbackRegionResponse(fallbackStationName: string): ReverseGeocodeSuccessPayload {
  return {
    address: null,
    regionName: fallbackStationName,
    stationCandidate: fallbackStationName,
    fallbackApplied: true,
  };
}

async function fetchKakaoRegion(lat: number, lng: number): Promise<KakaoRegionDocument | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, KAKAO_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
        signal: controller.signal,
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      const status = response.status;
      const bodyText = await response.text().catch(() => '');
      throw new Error(`KAKAO_HTTP_${status}:${bodyText.slice(0, 200)}`);
    }

    const data = (await response.json()) as { documents?: KakaoRegionDocument[] };
    const docs = Array.isArray(data.documents) ? data.documents : [];
    if (docs.length === 0) return null;

    // Prefer administrative region (H code) when available.
    return docs.find((doc) => doc.region_type === 'H') || docs[0] || null;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('KAKAO_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function handlePost(request: Request) {
  let fallbackStationName: string | null = null;

  try {
    const rawBody = (await request.json()) as {
      lat?: unknown;
      lng?: unknown;
      fallbackStationName?: unknown;
    };
    const lat = toCoordinate(rawBody?.lat);
    const lng = toCoordinate(rawBody?.lng);
    fallbackStationName = normalizeFallbackStationName(rawBody?.fallbackStationName);

    if (lat === null || lng === null) {
      return NextResponse.json(
        { error: 'Latitude and Longitude are required' },
        { status: 400, headers: corsHeaders() },
      );
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Invalid coordinate range' },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!KAKAO_REST_API_KEY) {
      console.error('KAKAO_REST_API_KEY is missing');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500, headers: corsHeaders() },
      );
    }

    const region = await fetchKakaoRegion(lat, lng);
    if (!region) {
      if (fallbackStationName) {
        return NextResponse.json(buildFallbackRegionResponse(fallbackStationName), {
          headers: corsHeaders(),
        });
      }
      return NextResponse.json(
        { error: 'UNSUPPORTED_COORDINATES' },
        { status: 422, headers: corsHeaders() },
      );
    }

    const normalized = normalizeRegion(region);
    if (!normalized) {
      if (fallbackStationName) {
        return NextResponse.json(buildFallbackRegionResponse(fallbackStationName), {
          headers: corsHeaders(),
        });
      }
      return NextResponse.json(
        { error: 'NO_RESULTS' },
        { status: 422, headers: corsHeaders() },
      );
    }

    return NextResponse.json(
      {
        address: normalized.address,
        regionName: normalized.regionName,
        stationCandidate: normalized.stationCandidate,
      },
      { headers: corsHeaders() },
    );
  } catch (error) {
    console.error('Reverse Geocode Error:', error);

    const reason = error instanceof Error ? error.message : 'unknown';
    if (reason.startsWith('KAKAO_HTTP_4')) {
      if (fallbackStationName) {
        return NextResponse.json(buildFallbackRegionResponse(fallbackStationName), {
          headers: corsHeaders(),
        });
      }
      return NextResponse.json(
        { error: 'UNSUPPORTED_COORDINATES' },
        { status: 422, headers: corsHeaders() },
      );
    }
    if (reason === 'KAKAO_TIMEOUT') {
      return NextResponse.json(
        { error: 'UPSTREAM_TIMEOUT' },
        { status: 504, headers: corsHeaders() },
      );
    }

    return NextResponse.json(
      { error: 'UPSTREAM_ERROR' },
      { status: 502, headers: corsHeaders() },
    );
  }
}

export const OPTIONS = withApiObservability('/api/reverse-geocode', 'OPTIONS', handleOptions);
export const POST = withApiObservability('/api/reverse-geocode', 'POST', handlePost);
