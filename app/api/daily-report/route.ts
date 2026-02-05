import { NextResponse } from 'next/server';

const DATA_API_URL = process.env.NEXT_PUBLIC_DATA_API_URL || 'https://epi-log-ai.vercel.app';
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'https://epi-log-ai.vercel.app';

function mapProfileToAiSchema(profile: any) {
  // Updated to 5 age groups + atopy condition
  // Internal Age Groups: 'infant', 'toddler', 'elementary_low', 'elementary_high', 'teen_adult'
  // AI Age Groups: Same (direct mapping)
  let aiAge = profile.ageGroup || 'elementary_low'; // Direct pass-through with fallback
  
  // Internal Condition: 'none', 'rhinitis', 'asthma', 'atopy'
  // AI Condition: 'general', 'rhinitis', 'asthma', 'atopy'
  let aiCondition = 'general'; // Backend uses 'general' for none
  if (profile.condition === 'asthma') aiCondition = 'asthma';
  else if (profile.condition === 'rhinitis') aiCondition = 'rhinitis';
  else if (profile.condition === 'atopy') aiCondition = 'atopy';
  else if (profile.condition === 'none') aiCondition = 'general';
  
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
      fetch(`${DATA_API_URL}/api/air-quality?stationName=${encodeURIComponent(targetStation)}`, {
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
        
        // New EPI-LOG-AI /api/air-quality endpoint returns direct format
        // { stationName, pm25_grade, pm25_value, pm10_grade, pm10_value, ... }
        airData = result;

        // Transform to internal structure for frontend
        if (airData) {
           // Convert Korean grade text to numeric for comparison
           const gradeMap: Record<string, number> = {
             '좋음': 1,
             '보통': 2,
             '나쁨': 3,
             '매우나쁨': 4
           };
           
           const pm10Grade = gradeMap[airData.pm10_grade] || 2;
           const pm25Grade = gradeMap[airData.pm25_grade] || 2;
           const worstGrade = Math.max(pm10Grade, pm25Grade);
           
           airData = {
             stationName: airData.stationName || targetStation,
             grade: worstGrade === 4 ? 'VERY_BAD' :
                    worstGrade === 3 ? 'BAD' :
                    worstGrade === 2 ? 'NORMAL' : 'GOOD',
             value: airData.pm10_value,
             pm25_value: airData.pm25_value,
             pm10_value: airData.pm10_value,
             o3_value: airData.o3_value,
             no2_value: airData.no2_value,
             detail: {
               pm10: { grade: pm10Grade, value: airData.pm10_value },
               pm25: { grade: pm25Grade, value: airData.pm25_value },
               o3: { value: airData.o3_value },
               no2: { value: airData.no2_value }
             }
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
        console.log('[BFF] Raw AI Data:', JSON.stringify(aiData, null, 2));
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
                        summary: aiData.decision,
                        detail: aiData.reason,
                        actionItems: aiData.actionItems || [],
                        activityRecommendation: aiData.decision, 
                        maskRecommendation: 'KF80 권장', // Default/Logic placeholder
                        references: aiData.references || [] // Now explicitly part of the API
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

    // Merge numeric values from AI API response into airData if not present
    // This ensures we always have pm25_value, o3_value etc even if AirKorea API fails
    if (aiData) {
      if (!airData.pm25_value && aiData.pm25_value) airData.pm25_value = aiData.pm25_value;
      if (!airData.o3_value && aiData.o3_value) airData.o3_value = aiData.o3_value;
      if (!airData.pm10_value && aiData.pm10_value) airData.pm10_value = aiData.pm10_value;
      if (!airData.no2_value && aiData.no2_value) airData.no2_value = aiData.no2_value;
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
