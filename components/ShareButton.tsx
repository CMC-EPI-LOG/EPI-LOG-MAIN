'use client';

import { Share2 } from 'lucide-react';

interface ShareButtonProps {
  nickname?: string;
  region?: string;
  action?: string; // e.g. "실내 놀이", "마스크 필수"
}

export default function ShareButton({ nickname, region, action }: ShareButtonProps) {
    const handleShare = async () => {
    const shareData = {
      title: `${nickname || '우리 아이'}는 오늘 ${action || '조심해야'} 해요!`,
      text: `오늘 ${region || '우리 동네'} 미세먼지 확인하러 가기`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        // Using alert for simplicity as toast might not be imported/configured in this file
        // We can check if 'react-hot-toast' is used in layout.tsx (it is), so we can import it.
        alert('링크가 복사되었습니다!'); 
      } catch (err) {
        console.error('Clipboard failed:', err);
        alert('링크 복사에 실패했습니다.');
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className="w-full py-4 px-6 bg-[#FEE500] text-[#1A1A1A] font-black text-lg rounded-[24px] flex items-center justify-center gap-2 border-[3px] border-black shadow-bento hover:bg-[#FDD835] btn-press"
    >
      <Share2 size={22} className="stroke-[3px]" />
      이 결과 다른 엄마에게 공유하기
    </button>
  );
}
