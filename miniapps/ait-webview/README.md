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

빌드 산출물은 `dist/`에 생성되고, `.ait` 파일도 함께 생성됩니다(`*.ait`는 gitignore 처리됨).

## 디자인 시스템(TDS)

`@toss/tds-mobile`이 설치되어 있습니다. TDS는 로컬 브라우저에서는 동작하지 않을 수 있으니, UI 확인은 샌드박스앱 기준으로 진행하세요.

