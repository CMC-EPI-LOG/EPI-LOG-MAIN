# Apps in Toss WebView Miniapp (Vite + React + TS)

이 프로젝트는 Apps in Toss 샌드박스앱에서 실행하는 WebView 미니앱입니다.

## 설정

1. 앱인토스 콘솔에서 만든 앱의 `appName`과 동일하게 `/Users/lux/Documents/EPI-LOG-MAIN/miniapps/ait-webview/granite.config.ts`의 `appName`을 맞춰주세요.
2. 아이콘 URL이 아직 없다면 `brand.icon`을 빈 문자열(`''`)로 둔 상태로도 테스트할 수 있습니다.

## 로컬 개발

```bash
cd /Users/lux/Documents/EPI-LOG-MAIN/miniapps/ait-webview
npm install
npm run dev
```

`npm run dev`는 `granite dev`를 실행하며, 기본적으로 아래 서버가 뜹니다.

- Metro: `http://0.0.0.0:8081`
- Web (Vite): `http://localhost:5173`

## 샌드박스앱에서 실행

샌드박스앱에서 `intoss://{appName}` 스킴을 열어 실행합니다. (`{appName}`은 `granite.config.ts`의 `appName`)

실기기에서 접속하려면:

- `/Users/lux/Documents/EPI-LOG-MAIN/miniapps/ait-webview/granite.config.ts`의 `web.host`를 PC의 로컬 IP로 변경
- `/Users/lux/Documents/EPI-LOG-MAIN/miniapps/ait-webview/granite.config.ts`의 `web.commands.dev`를 `vite --host`로 변경

Android는 필요 시 포트 리버스:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5173 tcp:5173
```

## 빌드

```bash
npm run build
```

`npm run build`는 SDK 2.0.1 기준 `ait build`를 실행합니다.

빌드 산출물은 `dist/`에 생성되고, `.ait` 파일도 함께 생성됩니다(`*.ait`는 gitignore 처리됨).

## 분석(Analytics)

- GA4 ID는 `VITE_GA_ID`로 주입합니다.
- 앱 진입 시점의 UTM 저장/페이지뷰 계측은 `src/components/AnalyticsBootstrap.tsx`에서 수행합니다.
- 이벤트 네이밍/필수 컨텍스트 표준 초안은 `ANALYTICS_EVENT_NAMING.md`를 참고하세요.

## Sentry 운영

미니앱은 `@sentry/browser`로 JS 런타임 오류를 수집합니다. (네이티브 크래시 수집은 사용하지 않음)

### 런타임 환경변수

- `VITE_SENTRY_DSN`: 미니앱 DSN
- `VITE_SENTRY_ENVIRONMENT`: 환경 이름(예: `production`, `staging`)
- `VITE_SENTRY_RELEASE`: 릴리즈 식별자(예: git sha)
- `VITE_SENTRY_TRACES_SAMPLE_RATE`: 트레이스 샘플링 비율(기본 `0`)
- 공유 OG 이미지는 `https://www.ai-soom.site/thumbnail.png`로 고정되어 있습니다.

### sourcemap 업로드

배포 산출물 생성 후 다음 스크립트로 sourcemap을 업로드합니다.

```bash
cd /Users/lux/Documents/EPI-LOG-MAIN/miniapps/ait-webview
npm run build
SENTRY_AUTH_TOKEN=... \
SENTRY_ORG=... \
SENTRY_PROJECT=... \
SENTRY_RELEASE=<release-id> \
npm run sentry:sourcemaps:upload
```

또는 원샷 실행:

```bash
SENTRY_AUTH_TOKEN=... \
SENTRY_ORG=... \
SENTRY_PROJECT=... \
SENTRY_RELEASE=<release-id> \
npm run release:build
```

### granite.config.ts 플러그인 검토 결과

SDK `@apps-in-toss/web-framework@2.0.1` 기준으로도 sourcemap 운영은 `sentry-cli` 스크립트 기반으로 처리합니다.

## 디자인 시스템(TDS)

`@toss/tds-mobile`이 설치되어 있습니다. TDS는 로컬 브라우저에서는 동작하지 않을 수 있으니, UI 확인은 샌드박스앱 기준으로 진행하세요.

## 심사 재준비 문서

- 리브랜딩/사전점검 결과: `REVIEW_PRECHECK.md`
