'use client';

import { Share2 } from 'lucide-react';

interface ShareButtonProps {
  nickname?: string;
  region?: string;
  action?: string; // e.g. "실내 놀이", "마스크 필수"
}

export default function ShareButton({ nickname, region, action }: ShareButtonProps) {
  const handleShare = () => {
    if (typeof window === 'undefined') return;

    const { Kakao } = window;

    if (!Kakao || !Kakao.isInitialized()) {
      // Try initializing if key exists
      if (Kakao && process.env.NEXT_PUBLIC_KAKAO_JS_KEY) {
         try {
           Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
         } catch (e) {
           console.error("Kakao Init Failed:", e);
         }
      } else {
        alert('카카오톡 공유 기능을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
    }

    // Double check
    if (Kakao && Kakao.isInitialized()) {
      // FIX: Force use of registered domain to avoid 4019 error on localhost/preview
      const shareUrl = new URL(
        window.location.pathname + window.location.search,
        'https://epi-log-main.vercel.app'
      ).href;

      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: `${nickname || '우리 아이'}는 오늘 ${action || '조심해야'} 해요!`,
          description: `오늘 ${region || '우리 동네'} 미세먼지 확인하러 가기`,
          imageUrl: 'https://epi-log-main.vercel.app/og-image.png',
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl,
          },
        },
        buttons: [
          {
            title: '결과 보러 가기 🚀',
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
        ],
      });
    }
  };

  return (
    <button
      onClick={handleShare}
      className="w-full mt-4 py-4 bg-[#FEE500] text-[#191919] font-black text-lg rounded-xl flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#FDD835] active:translate-y-1 active:shadow-none transition-all border-2 border-black"
    >
      <Share2 size={20} className="stroke-[3px]" />
      이 결과 다른 엄마에게 공유하기
    </button>
  );
}
