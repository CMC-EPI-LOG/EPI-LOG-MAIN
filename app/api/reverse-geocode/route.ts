import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    const { lat, lng } = await request.json();

    if (!lat || !lng) {
      return NextResponse.json(
        { error: 'Latitude and Longitude are required' },
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

    const response = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Kakao API Error:', errorData);
        throw new Error('Failed to fetch from Kakao API');
    }

    const data = await response.json();
    
    // Kakao returns documents[0] as administrative region (H-Code), documents[1] as legal region (B-Code).
    // Usually documents[0] (Administrative) is more user-friendly (e.g., Yeoksam 1-dong).
    // Let's return the full address or just the depth2/depth3 name.
    // data.documents[0].address_name -> '서울특별시 강남구 역삼1동'
    // data.documents[0].region_2depth_name -> '강남구'
    // data.documents[0].region_3depth_name -> '역삼1동'

    const region = data.documents[0];
    
    if (!region) {
         return NextResponse.json(
           { error: 'No results found' },
           { status: 404, headers: corsHeaders() },
         );
    }
    
    const depth2 = (region.region_2depth_name || '').trim();
    const depth3 = (region.region_3depth_name || '').trim();
    const stationCandidate = [depth2, depth3].filter(Boolean).join(' ').trim() || depth2 || depth3;

    return NextResponse.json({
      address: region.address_name,
      regionName: depth3 || depth2, // 역삼1동 (없으면 강남구)
      // 2depth만 쓰면 세종시처럼 광역 단위로 고정 템플릿 응답이 나올 수 있어 3depth를 함께 전달
      stationCandidate,
    }, { headers: corsHeaders() });

  } catch (error) {
    console.error('Reverse Geocode Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
