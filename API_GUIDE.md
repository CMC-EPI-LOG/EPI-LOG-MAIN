# EPI-LOG API Guide

This document outlines the external AI API integration used by the EPI-LOG application.

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
    "ageGroup": "child",
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
    "references": "string[]"
  }
}
```
