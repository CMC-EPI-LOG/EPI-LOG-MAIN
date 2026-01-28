# EPI-LOG API Guide

This document outlines the external AI API integration and internal BFF endpoints used by the EPI-LOG application.

## AI Server API

**Base URL**: `https://epi-log-ai.vercel.app`

### 1. Give Advice
Generates health advice based on air quality station data and user profile.

- **Endpoint**: `POST /api/advice`
- **Content-Type**: `application/json`

#### Request Body
| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `stationName` | `string` | The name of the station (e.g., "강남구") | Yes |
| `userProfile` | `object` | User's health profile information | Yes |

**Example Request**:
```json
{
  "stationName": "강남구",
  "userProfile": {
    "ageGroup": "elementary_low",
    "condition": "asthma"
  }
}
```

#### Response Body
| Field | Type | Description |
| :--- | :--- | :--- |
| `decision` | `string` | The activity recommendation (e.g., "Good", "Bad") |
| `reason` | `string` | A summary explanation of the advice |
| `actionItems` | `string[]` | List of specific actionable advice items |
| `references` | `string[]` | List of source documents or titles used for RAG |

**Example Response**:
```json
{
  "decision": "실외 활동 자제",
  "reason": "미세먼지 농도가 매우 나쁩니다.",
  "actionItems": [
    "마스크를 착용하세요.",
    "창문을 닫아주세요."
  ],
  "references": [
    "Clean Air Guide 2024",
    "WHO Guidelines"
  ]
}
```

---

## Internal BFF API

### Daily Report
Aggregates AirKorea data and AI advice for the frontend.

- **Endpoint**: `POST /api/daily-report`

#### Request Body
```json
{
  "stationName": "강남구",
  "profile": {
    "ageGroup": "child_low",
    "condition": "rhinitis"
  }
}
```

#### Profile Mapping (BFF → AI)
- Internal `ageGroup`: `infant` | `child_low` | `child_high` | `adult`
- AI `ageGroup`: `infant` | `elementary_low` | `elementary_high` | `teen`
- Internal `condition`: `none` | `rhinitis` | `asthma`
- AI `condition`: `none` | `rhinitis` | `asthma`

#### Response Structure
```json
{
  "airQuality": {
    "stationName": "string",
    "grade": "string",
    "value": "number",
    "detail": "object"
  },
  "aiGuide": {
    "summary": "string",
    "detail": "string",
    "activityRecommendation": "string",
    "maskRecommendation": "string",
    "actionItems": "string[]",
    "references": "string[]"
  },
  "timestamp": "string"
}
```

#### Notes
- AirKorea 응답은 UI 사용성을 위해 `grade`, `value`, `detail` 형태로 평탄화됩니다.
- AI 서버 실패 시에도 `aiGuide` 폴백을 반환합니다.
- AirKorea 실패 시에도 `airQuality` 폴백을 반환합니다.

### Reverse Geocode
Converts coordinates to administrative region names.

- **Endpoint**: `POST /api/reverse-geocode`

#### Request Body
```json
{
  "lat": 37.5172,
  "lng": 127.0473
}
```

#### Response Structure
```json
{
  "address": "서울특별시 강남구 역삼1동",
  "regionName": "역삼1동",
  "stationCandidate": "강남구"
}
```

#### Error Handling
- `lat/lng` 누락 시 `400`
- `KAKAO_REST_API_KEY` 누락 시 `500`
- Kakao API 실패 시 `500`

---

## Environment Variables

- `NEXT_PUBLIC_DATA_API_URL`: AirKorea 데이터 API URL
- `NEXT_PUBLIC_AI_API_URL`: AI 서버 API URL
- `KAKAO_REST_API_KEY`: Kakao 지도 REST API Key (서버용)
- `NEXT_PUBLIC_KAKAO_JS_KEY`: Kakao JS SDK Key (클라이언트용)
- `NEXT_PUBLIC_SITE_URL`: 배포 URL
- `NEXT_PUBLIC_GA4_ID`: Google Analytics ID
