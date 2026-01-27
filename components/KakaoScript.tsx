'use client';

import Script from 'next/script';
import { useEffect } from 'react';

export default function KakaoScript() {
  useEffect(() => {
    const initKakao = () => {
      if (window.Kakao && !window.Kakao.isInitialized() && process.env.NEXT_PUBLIC_KAKAO_JS_KEY) {
        window.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
      }
    };

    // Try immediately
    initKakao();

    // Check periodically just in case script loads late
    const interval = setInterval(initKakao, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <Script
      src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.1/kakao.min.js" 
      strategy="afterInteractive"
    />
  );
}
