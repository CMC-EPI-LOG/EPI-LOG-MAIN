import { NextResponse } from 'next/server';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

export async function POST(request: Request) {
  try {
    const { lat, lng } = await request.json();

    if (!lat || !lng) {
      return NextResponse.json({ error: 'Latitude and Longitude are required' }, { status: 400 });
    }

    if (!KAKAO_REST_API_KEY) {
      console.error('KAKAO_REST_API_KEY is missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
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
         return NextResponse.json({ error: 'No results found' }, { status: 404 });
    }
    
    // We prefer 3depth (Dong) if available, else 2depth (Gu)
    // Actually, for air quality, 'Gu' (2depth) is often better for matching stations, 
    // but users feel more "local" with 'Dong'.
    // Let's send back both or a formatted string. 
    // The previous app used 'stationName' which often maps to 'Gu' level in AirKorea.
    // AirKorea stations are often by 'Gu' or major points.
    // Let's return 2depth (Gu) as primary for station matching, and 3depth (Dong) for display?
    // Request says: "행정동(예: 역삼동)으로 변환 후 Store에 저장."
    // Let's use 3depth (Dong) as 'regionName' and 2depth (Gu) as 'stationName' candidate.
    
    return NextResponse.json({
      address: region.address_name,
      regionName: region.region_3depth_name, // 역삼1동
      stationCandidate: region.region_2depth_name, // 강남구
    });

  } catch (error) {
    console.error('Reverse Geocode Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
