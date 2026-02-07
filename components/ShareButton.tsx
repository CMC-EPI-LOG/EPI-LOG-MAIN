'use client';

import { Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { trackCoreEvent } from '@/lib/analytics/ga';

interface ShareButtonProps {
  nickname?: string;
  region?: string;
  action?: string; // e.g. "실내 놀이", "마스크 필수"
  summary?: string;
  reason?: string;
}

function toSingleLine(value?: string) {
  if (!value) return '';
  return value
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ShareButton({ nickname, region, action, summary, reason }: ShareButtonProps) {
  const handleShare = async () => {
    const decisionLine = toSingleLine(action || summary || '오늘 활동 가이드를 확인해보세요');
    const reasonLine = toSingleLine(reason || '');

    const shareData = {
      title: `${nickname || '우리 아이'} 오늘 공기질 가이드`,
      text: `${region || '우리 동네'} 기준 · ${decisionLine}${reasonLine ? ` · 이유: ${reasonLine}` : ''}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        trackCoreEvent('share_clicked', {
          station_name: region || 'unknown',
          recommended_action: action || summary || 'unknown',
          share_channel: 'native',
          share_result: 'success',
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          trackCoreEvent('share_clicked', {
            station_name: region || 'unknown',
            recommended_action: action || summary || 'unknown',
            share_channel: 'native',
            share_result: 'cancel',
          });
          return;
        }
        trackCoreEvent('share_clicked', {
          station_name: region || 'unknown',
          recommended_action: action || summary || 'unknown',
          share_channel: 'native',
          share_result: 'error',
        });
        console.error('Share failed:', err);
        toast.error('공유를 완료하지 못했어요.');
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        trackCoreEvent('share_clicked', {
          station_name: region || 'unknown',
          recommended_action: action || summary || 'unknown',
          share_channel: 'clipboard',
          share_result: 'success',
        });
        toast.success('링크가 복사되었습니다!');
      } catch (err) {
        trackCoreEvent('share_clicked', {
          station_name: region || 'unknown',
          recommended_action: action || summary || 'unknown',
          share_channel: 'clipboard',
          share_result: 'error',
        });
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
