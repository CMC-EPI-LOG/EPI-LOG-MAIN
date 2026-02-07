# EPI-LOG API Guide

This document describes the external AI API and internal BFF APIs used by EPI-LOG.

## AI Server API

Base URL: `https://epi-log-ai.vercel.app`

### `POST /api/advice`
Generates personalized health/activity guidance from station data and user profile.

#### Request Body
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `stationName` | `string` | Yes | Air station name (e.g. `강남구`) |
| `userProfile.ageGroup` | `string` | Yes | `infant` \| `toddler` \| `elementary_low` \| `elementary_high` \| `teen_adult` |
| `userProfile.condition` | `string` | Yes | `general` \| `rhinitis` \| `asthma` \| `atopy` |

#### Response (major fields)
| Field | Type | Description |
| :--- | :--- | :--- |
| `decision` | `string` | Main recommendation sentence |
| `reason` | `string` | Detailed rationale |
| `three_reason` | `string[]` | 3-line summary reasons |
| `detail_answer` | `string` | Expanded explanation |
| `actionItems` | `string[]` | Action checklist |
| `references` | `string[]` | RAG source list |
| `pm25_value`, `pm10_value`, `o3_value`, `no2_value` | `number` | Numeric metrics (optional) |

---

## Internal BFF API

### `POST /api/daily-report`
Aggregates air data + AI guidance, applies decision normalization, and returns reliability metadata.

#### Request Body
```json
{
  "stationName": "강남구",
  "profile": {
    "ageGroup": "elementary_low",
    "condition": "rhinitis"
  }
}
```

#### Profile mapping (BFF -> AI)
- `condition`: `none` -> `general`
- `rhinitis` -> `rhinitis`
- `asthma` -> `asthma`
- `atopy` -> `atopy`

#### Response Structure
```json
{
  "airQuality": {
    "stationName": "강남구",
    "grade": "BAD",
    "pm25_value": 55,
    "pm10_value": 88,
    "o3_value": 0.07,
    "no2_value": 0.04,
    "temp": 22,
    "humidity": 45,
    "detail": {
      "pm10": { "grade": 3, "value": 88 },
      "pm25": { "grade": 3, "value": 55 },
      "o3": { "value": 0.07 },
      "no2": { "value": 0.04 }
    }
  },
  "aiGuide": {
    "summary": "오늘은 실외 활동 가능해요",
    "detail": "...",
    "threeReason": ["..."],
    "detailAnswer": "...",
    "actionItems": ["..."],
    "activityRecommendation": "...",
    "maskRecommendation": "...",
    "references": ["..."]
  },
  "decisionSignals": {
    "pm25Grade": 3,
    "o3Grade": 2,
    "adjustedRiskGrade": 3,
    "finalGrade": "BAD",
    "o3IsDominantRisk": false,
    "o3OutingBanForced": false,
    "infantMaskBanApplied": false,
    "weatherAdjusted": false
  },
  "reliability": {
    "status": "LIVE",
    "label": "최근 1시간 기준 실측 데이터",
    "description": "현재 선택한 지역 측정소의 최근 1시간 기준 실측값을 반영했어요.",
    "requestedStation": "강남구",
    "resolvedStation": "강남구",
    "triedStations": ["강남구"],
    "updatedAt": "2026-02-07T01:23:45.000Z",
    "aiStatus": "ok"
  },
  "timestamp": "2026-02-07T01:23:45.000Z"
}
```

#### Runtime behavior
- Air + AI are fetched in parallel with `Promise.allSettled`.
- Partial failure returns degraded but render-safe payload.
- O3 rule: when `BAD+`, action list force-appends `오후 2~5시 외출 금지`.
- Infant rule: mask recommendation is overridden to `마스크 착용 금지(영아)`.
- Weather adjustment: risk can be raised by temperature/humidity + profile condition.
- Reliability label policy:
  - `LIVE`: `최근 1시간 기준 실측 데이터`
  - `STATION_FALLBACK`: `인근 측정소 자동 보정`
  - `DEGRADED`: `주변 평균 대체 데이터`

#### External calls
- `GET ${NEXT_PUBLIC_DATA_API_URL}/api/air-quality?stationName=...`
- `POST ${NEXT_PUBLIC_AI_API_URL}/api/advice`

### `POST /api/reverse-geocode`
Converts coordinates to display region + station candidate.

#### Request Body
```json
{
  "lat": 37.5172,
  "lng": 127.0473
}
```

#### Response
```json
{
  "address": "서울특별시 강남구 역삼1동",
  "regionName": "역삼1동",
  "stationCandidate": "강남구"
}
```

#### Errors
- `400`: missing `lat` / `lng`
- `500`: missing `KAKAO_REST_API_KEY`
- `500`: Kakao API failure

---

## Environment Variables

- `NEXT_PUBLIC_DATA_API_URL`
- `NEXT_PUBLIC_AI_API_URL`
- `KAKAO_REST_API_KEY`
- `NEXT_PUBLIC_KAKAO_JS_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_GA_ID` or `NEXT_PUBLIC_GA4_ID`
