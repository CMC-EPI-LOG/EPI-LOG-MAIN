'use client';

import { Share2 } from 'lucide-react';
import toast from 'react-hot-toast';

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
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Share failed:', err);
        toast.error('공유를 완료하지 못했어요.');
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('링크가 복사되었습니다!');
      } catch (err) {
        console.error('Clipboard failed:', err);
        toast.error('링크 복사에 실패했습니다.');
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex w-full items-center justify-center gap-2 rounded-[20px] border-2 border-black bg-[#FEE500] px-5 py-3 text-base font-black text-[#1A1A1A] shadow-bento-sm transition-all hover:bg-[#FDD835] active:translate-y-0.5 active:shadow-none"
      aria-label="결과 공유하기"
      data-testid="share-button"
    >
      <Share2 size={18} className="stroke-[2.5px]" />
      이 결과 다른 엄마에게 공유하기
    </button>
  );
}
