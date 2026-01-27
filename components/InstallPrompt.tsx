'use client';

import { useEffect, useState } from 'react';
import { Share, PlusSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Detect Android/Chrome Install Prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Show iOS prompt if standalone is false (roughly)
    if (isIosDevice && !(window.navigator as any).standalone) {
       // Only show after some delay or interaction in a real app, 
       // but for MVP we show it if not installed.
       // However, to be less intrusive, let's show it only if user engages or based on timer.
       // For now, simple logic:
       setIsVisible(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleAndroidInstall = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        setDeferredPrompt(null);
        setIsVisible(false);
      });
    }
  };

  if (!isVisible) return null;

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
