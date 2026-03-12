# Air Quality Forecast Block

## 목적

시간별 날씨 예보와 별도로, AirKorea의 일 단위 미세먼지 예보를 `/api/weather-forecast` 응답에 `airQualityForecast` 블록으로 함께 제공한다.

## 응답 구조

```json
{
  "requestedStation": "경상남도 김해시 진영읍",
  "resolvedStation": "진영읍",
  "triedStations": ["경상남도 김해시 진영읍", "진영읍"],
  "windowHours": 48,
  "items": [
    {
      "forecastAt": "2026-03-08T15:00:00.000Z",
      "dateKst": "2026-03-09",
      "hourKst": 0,
      "timeLabel": "00:00",
      "temperature": 3,
      "humidity": 65,
      "precipitation": null,
      "precipitationProbability": 20,
      "precipitationType": 0,
      "sky": 3
    }
  ],
  "airQualityForecast": {
    "requestedRegion": "경남",
    "resolvedRegion": "경남",
    "issuedAt": "2026-03-08 23시 발표",
    "items": [
      {
        "forecastDate": "2026-03-09",
        "pm10Grade": "보통",
        "pm25Grade": "보통",
        "overall": "요약 문구",
        "cause": "원인 문구",
        "actionKnack": null
      }
    ]
  },
  "timestamp": "2026-03-08T14:57:00.000Z"
}
```

## Mongo 스키마

### raw

- DB: `air_quality`
- Collection: `airkorea_forecast_raw`
- 용도: 원본 payload 보관, 중복/재처리 추적
- upsert key: `requestedCode + informCode + informData + dataTime + payloadHash`
- TTL: 30일

예시 필드:

```json
{
  "requestedCode": "PM10",
  "informCode": "PM10",
  "informData": "2026-03-09",
  "dataTime": "2026-03-08 23시 발표",
  "informGrade": "서울 : 보통, ... , 경남 : 보통",
  "informOverall": "요약 문구",
  "informCause": "원인 문구",
  "actionKnack": null,
  "payloadHash": "sha256...",
  "fetchedAt": "2026-03-08T14:53:04.000Z",
  "expireAt": "2026-04-07T14:53:04.000Z"
}
```

### serving

- DB: `air_quality`
- Collection: `air_quality_forecast_daily`
- 용도: 서비스 조회용 최신 일별 미세먼지 예보
- upsert key: `informCode + forecastDate`
- 인덱스: `forecastDate + issuedAtUtc`

예시 필드:

```json
{
  "informCode": "PM25",
  "forecastDate": "2026-03-09",
  "issuedAt": "2026-03-08 23시 발표",
  "issuedAtUtc": "2026-03-08T14:00:00.000Z",
  "overall": "요약 문구",
  "cause": "원인 문구",
  "actionKnack": null,
  "gradeText": "서울 : 나쁨, ... , 경남 : 보통",
  "gradesByRegion": {
    "서울": "나쁨",
    "경남": "보통"
  },
  "imageUrls": [],
  "updatedAt": "2026-03-08T14:53:04.000Z",
  "ingestedAt": "2026-03-08T14:53:04.000Z",
  "sourceVersion": "forecast-v1"
}
```

### runs

- DB: `air_quality`
- Collection: `ingest_runs_forecast`
- 용도: 스케줄 실행 성공/실패와 fetched/upsert 수 추적
- TTL: 30일

## Lambda 수집기

- 함수: `airkorea-forecast-ingest`
- 엔트리: `workers/public-data/src/airkorea-forecast/handler.ts`
- API: `getMinuDustFrcstDspth`
- 스케줄: 매시 `23분` KST
- 요청 코드: `PM10`, `PM25`
- 입력 파라미터:
  - `serviceKey`
  - `returnType=json`
  - `numOfRows=100`
  - `pageNo`
  - `searchDate=KST 오늘`
  - `InformCode`

### 적재 규칙

1. `PM10`, `PM25`를 각각 호출한다.
2. 원본 응답은 `InformCode`를 줘도 코드가 섞일 수 있으므로 응답을 다시 `informCode`로 post-filter 한다.
3. raw 컬렉션에는 원본 payload를 그대로 저장한다.
4. serving 컬렉션에는 `gradesByRegion`을 파싱해 저장한다.
5. 같은 날짜/코드에 더 최신 `issuedAtUtc`가 오면 덮어쓴다.

## 지역 해상도 규칙

- 일반 시도는 `서울`, `경남`, `제주` 등으로 바로 매핑
- `경기`는 `경기북부`, `경기남부`
- `강원`은 `영동`, `영서`
- 요청 위치와 `sido` 힌트를 같이 써서 `resolvedRegion`을 결정

## UI 노출 규칙

- 시간별 예보 카드 아래에 별도 섹션 `미세먼지 예보`를 노출
- 최대 3일치 `PM10`, `PM2.5` 등급 배지 표시
- `overall`, `cause`, `actionKnack` 요약 표시
- 날씨 예보와 섞지 않고 별도 블록으로 유지
