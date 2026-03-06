# Miniapp Analytics Event Naming (Draft)

미니앱 계측은 이벤트 네이밍과 공통 컨텍스트를 아래 규칙으로 통일합니다.

## 1) 이벤트 네이밍 규칙

- 포맷: `snake_case`
- 패턴: `객체_동작` 또는 `퍼널단계_결과`
- 금지: `camelCase`, 공백/특수문자 포함 이름

예시:

- `miniapp_entry`
- `miniapp_pageview`
- `profile_changed`
- `location_changed`
- `share_clicked`

## 2) 필수 공통 컨텍스트

`trackCoreEvent`로 전송되는 이벤트는 아래 키를 항상 포함합니다.

- `station_name`
- `age_group`
- `condition`
- `reliability_status`

값이 아직 결정되지 않은 시점에는 `"unknown"`을 사용합니다.

## 3) 퍼널 기준 권장 이벤트

유입 → 온보딩 → 리포트 조회 → 공유 복원을 위해 최소 아래 이벤트를 유지합니다.

1. 진입: `miniapp_entry`
2. 페이지뷰: `miniapp_pageview`
3. 온보딩/프로필 갱신: `profile_changed`
4. 위치 갱신: `location_changed`
5. 콘텐츠 소비: `insight_opened`, `datagrid_opened`
6. 공유: `share_clicked`
7. 공유 진입 개인화 노출: `share_entry_personalized_shown`

## 4) UTM 어트리뷰션 규칙

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`를 세션/로컬 저장소에 보존
- 최초 랜딩 경로는 `utm_landing_path`에 저장
- 코어 이벤트 전송 시 저장된 UTM 컨텍스트를 함께 병합
