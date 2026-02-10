'use client';

import { Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { trackCoreEvent } from '@/lib/analytics/ga';
import { useLogger } from '@/hooks/useLogger';

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

function createShareId() {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ShareButton({ nickname, region, action, summary, reason }: ShareButtonProps) {
  // Apps in Toss policy: don't send users outside of the miniapp environment.
  if (process.env.NEXT_PUBLIC_PLATFORM === 'TOSS') return null;
  const { logEvent } = useLogger();

  const handleShare = async () => {
    const canNativeShare = typeof (navigator as any).share === 'function';
    const shareMethod = canNativeShare ? 'native' : 'clipboard';
    const share_id = createShareId();
    void logEvent('share_link_created', { share_id });
    void logEvent('share_click', { method: shareMethod, share_id });

    const decisionLine = toSingleLine(action || summary || '오늘 활동 가이드를 확인해보세요');
    const reasonLine = toSingleLine(reason || '');

    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('shared_by', share_id);

    const shareData = {
      title: `${nickname || '우리 아이'} 오늘 공기질 가이드`,
      text: `${region || '우리 동네'} 기준 · ${decisionLine}${reasonLine ? ` · 이유: ${reasonLine}` : ''}`,
      url: shareUrl.toString(),
    };

    if (canNativeShare) {
      try {
        await (navigator as any).share(shareData);
        void logEvent('share_result', { method: 'native', result: 'success', share_id });
        trackCoreEvent('share_clicked', {
          station_name: region || 'unknown',
          recommended_action: action || summary || 'unknown',
          share_channel: 'native',
          share_result: 'success',
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          void logEvent('share_result', { method: 'native', result: 'cancel', share_id });
          trackCoreEvent('share_clicked', {
            station_name: region || 'unknown',
            recommended_action: action || summary || 'unknown',
            share_channel: 'native',
            share_result: 'cancel',
          });
          return;
        }
        void logEvent('share_result', { method: 'native', result: 'error', share_id });
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
        await navigator.clipboard.writeText(shareUrl.toString());
        void logEvent('share_result', { method: 'clipboard', result: 'success', share_id });
        trackCoreEvent('share_clicked', {
          station_name: region || 'unknown',
          recommended_action: action || summary || 'unknown',
          share_channel: 'clipboard',
          share_result: 'success',
        });
        toast.success('링크가 복사되었습니다!');
      } catch (err) {
        void logEvent('share_result', { method: 'clipboard', result: 'error', share_id });
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
