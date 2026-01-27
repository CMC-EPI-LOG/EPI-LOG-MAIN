import { NextResponse } from 'next/server';

const DATA_API_URL = process.env.NEXT_PUBLIC_DATA_API_URL || 'https://epi-log-airkorea.vercel.app';
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'https://epi-log-ai.vercel.app';

function mapProfileToAiSchema(profile: any) {
  // Internal to AI Schema Mapping
  // Internal Age: 'infant', 'child_low', 'child_high', 'teen'
  // AI Age: 'infant', 'child', 'adult', 'elderly'
  let aiAge = 'child';
  if (profile.ageGroup === 'infant') aiAge = 'infant';
  else if (profile.ageGroup === 'teen') aiAge = 'child'; // Map teen to child for now

  // Internal Condition: 'normal', 'sensitive', 'asthma'
  // AI Condition: 'asthma', 'rhinitis', 'none', 'etc'
  let aiCondition = 'none';
  if (profile.condition === 'asthma') aiCondition = 'asthma';
  else if (profile.condition === 'sensitive') aiCondition = 'rhinitis'; // Closest mapping

  return {
    ageGroup: aiAge,
    condition: aiCondition,
  };
}

export async function POST(request: Request) {
  try {
    const { stationName, profile } = await request.json();

    const targetStation = stationName || '강남구';
    const finalProfile = profile || { ageGroup: 'child_low', condition: 'normal' };
    const aiProfile = mapProfileToAiSchema(finalProfile);

    console.log(`[BFF] Fetching for station: ${targetStation}`);
    console.log(`[BFF] AI Profile Payload:`, aiProfile);

    // Parallel Requests
    const [airResponse, aiResponse] = await Promise.allSettled([
      fetch(`${DATA_API_URL}/api/stations?stationName=${encodeURIComponent(targetStation)}`, {
        cache: 'no-store',
      }),
      fetch(`${AI_API_URL}/api/advice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stationName: targetStation,
          userProfile: aiProfile
        }),
        cache: 'no-store',
      }),
    ]);

    // Process Air Data
    let airData = null;
    if (airResponse.status === 'fulfilled') {
      if (airResponse.value.ok) {
        const result = await airResponse.value.json();
        // AirKorea API returns an array, take the first item
        airData = Array.isArray(result) && result.length > 0 ? result[0] : null;

        // Map to our internal structure if needed? 
        // Our DecisionCard uses: grade, value, stationName.
        // API returns: realtime.pm10.grade, etc.
        // We probably need to map/flatten this for easier consumption in frontend or update frontend.
        // Let's flatten slightly for the frontend to be happy:
        if (airData && airData.realtime) {
           airData = {
             stationName: airData.stationName || targetStation,
             // Prioritize PM10 or PM2.5 or worst grade?
             // Let's pick worst grade between PM10 and PM2.5 for generalized 'grade'
             grade: Math.max(airData.realtime.pm10.grade, airData.realtime.pm25.grade) === 4 ? 'VERY_BAD' :
                    Math.max(airData.realtime.pm10.grade, airData.realtime.pm25.grade) === 3 ? 'BAD' :
                    Math.max(airData.realtime.pm10.grade, airData.realtime.pm25.grade) === 2 ? 'NORMAL' : 'GOOD',
             value: airData.realtime.pm10.value, // Just show PM10 as rep value
             detail: airData.realtime
           };
        }
      } else {
        console.error('[BFF] Air API Failed:', airResponse.value.status, airResponse.value.statusText);
      }
    } else {
      console.error('[BFF] Air API Error:', airResponse.reason);
    }

    // Process AI Data
    let aiData = null;
    if (aiResponse.status === 'fulfilled') {
      if (aiResponse.value.ok) {
        aiData = await aiResponse.value.json();
        // Transform AI response to expected format if needed
        // AI returns: { decision: "X", reason: "...", actionItems: [] }
        if (aiData) {
            // Check for backend-level error caught and returned as 200
            if (aiData.decision === 'Error' || (typeof aiData.reason === 'string' && aiData.reason.includes('Error code:'))) {
                 console.error('[BFF] AI Business Logic Error:', aiData.reason);
                 aiData = {
                    summary: "AI 서버 설정 오류가 발생했어요 😅",
                    detail: "백엔드 OpenAI 모델 설정(Temperature)을 확인해주세요.",
                    maskRecommendation: "확인 필요",
                    activityRecommendation: "확인 필요"
                 };
            } else {
                    aiData = {
                        summary: aiData.reason,
                        detail: aiData.actionItems ? aiData.actionItems.join('\n') : '',
                        activityRecommendation: aiData.decision, 
                        maskRecommendation: 'KF80 권장', // Default/Logic placeholder
                        references: aiData.references || []
                    };
            }
        }
      } else {
        console.error('[BFF] AI API Failed:', aiResponse.value.status, aiResponse.value.statusText);
      }
    } else {
      console.error('[BFF] AI API Error:', aiResponse.reason);
    }

    // Fallback if AI fails
    if (!aiData) {
      aiData = {
        summary: "지금은 정보를 가져올 수 없어요 🥲\n잠시 후 다시 시도해주세요!",
        detail: "AI 선생님이 잠시 쉬고 있어요. 연결을 확인해주세요.",
      };
    }

    // Ensure airData has stationName for UI even if API failed
    if (!airData) {
      airData = {
        stationName: targetStation,
        grade: 'NORMAL', // Fallback to avoid white/broken UI
        detail: null
      };
    } else if (!airData.stationName) {
      airData.stationName = targetStation;
    }

    return NextResponse.json({
      airQuality: airData,
      aiGuide: aiData,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[BFF] Internal Server Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
