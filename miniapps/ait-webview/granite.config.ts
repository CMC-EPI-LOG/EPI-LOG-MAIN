import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'Epilog',
  brand: {
    displayName: '에피로그', // 화면에 노출될 앱 이름
    primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
    // 아이콘을 아직 정하지 않았다면 빈 문자열로 둔 상태로도 테스트할 수 있어요.
    icon: '',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'tsc -b && vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
});
