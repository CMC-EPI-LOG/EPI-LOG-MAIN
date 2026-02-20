'use client';

import { useEffect, useState } from 'react';
import { Share, PlusSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NavigatorWithStandalone extends Navigator {
  // iOS Safari exposes this when launched from the home screen.
  standalone?: boolean;
}

// Not in TS lib.dom yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function InstallPrompt() {
  const isTossPlatform = process.env.NEXT_PUBLIC_PLATFORM === 'TOSS';

  // Apps in Toss policy: do not encourage installing a separate app/PWA.
  const userAgent =
    typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
  const isKakaoTalkInApp = userAgent.includes('kakaotalk');
  const isIOS = /iphone|ipad|ipod/.test(userAgent);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();

    // Temporarily disable install coach banner in KakaoTalk in-app browser.
    // KakaoTalk's in-app browser typically doesn't support the expected PWA install UX
    // (and the iOS "Add to Home Screen" guidance can be misleading), so showing this can
    // become noise during Kakao share flows.
    if (ua.includes('kakaotalk')) return false;

    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    const isStandalone = (window.navigator as NavigatorWithStandalone).standalone === true;
    return isIosDevice && !isStandalone;
  });

  useEffect(() => {
    // Detect Android/Chrome Install Prompt
    if (isTossPlatform || isKakaoTalkInApp) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [isKakaoTalkInApp, isTossPlatform]);

  const handleAndroidInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
      setIsVisible(false);
    }
  };

  if (isTossPlatform || !isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-0 left-0 right-0 p-4 z-50 flex justify-center pointer-events-none"
      >
        <div className="bg-white brutal-border p-4 rounded-xl shadow-2xl max-w-sm w-full pointer-events-auto relative">
           <button 
             onClick={() => setIsVisible(false)} 
             className="absolute top-2 right-2 text-gray-400 hover:text-black"
           >
             ✕
           </button>
           
          {isIOS ? (
            <div className="flex flex-col gap-2 items-center text-center">
              <p className="font-bold text-lg">앱으로 더 편하게 보세요! 📲</p>
              <div className="flex items-center gap-2 text-sm bg-gray-100 p-2 rounded-lg">
                <Share size={20} /> 버튼을 누르고 <br/>
                <PlusSquare size={20} /> <strong>'홈 화면에 추가'</strong> 선택
              </div>
              <div className="animate-bounce mt-2">
                👇
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="font-bold text-lg text-center">앱 설치하고 매일 알림 받기 🔔</p>
              <button
                onClick={handleAndroidInstall}
                className="w-full py-3 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors"
              >
                앱 설치하기
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
