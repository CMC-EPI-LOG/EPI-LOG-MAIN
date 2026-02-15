import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'epilog',
  brand: {
    displayName: '에피로그', // 화면에 노출될 앱 이름
    primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
    icon: 'https://epi-log-main.vercel.app/epilog.svg',
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
