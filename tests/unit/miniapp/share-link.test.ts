import { describe, expect, it } from 'vitest';
import {
  buildMiniappDeepLink,
  buildTossShareMessage,
  resolveMiniappNameFromHostname,
} from '../../../miniapps/ait-webview/src/lib/shareLink';

describe('miniapp share link helpers', () => {
  it('resolves appName from toss hostnames', () => {
    expect(resolveMiniappNameFromHostname('epilog.apps.tossmini.com')).toBe('epilog');
    expect(resolveMiniappNameFromHostname('epilog.private-apps.tossmini.com')).toBe('epilog');
    expect(resolveMiniappNameFromHostname('localhost')).toBe('epilog');
    expect(resolveMiniappNameFromHostname(undefined)).toBe('epilog');
  });

  it('builds intoss deep link with shared_by tracking', () => {
    const deepLink = buildMiniappDeepLink('epilog', 'share-123');
    expect(deepLink.startsWith('intoss://epilog?')).toBe(true);
    expect(deepLink).toContain('shared_by=share-123');
    expect(deepLink).toContain('source=result_share');
  });

  it('builds toss share message with deep link payload', () => {
    const message = buildTossShareMessage({
      nickname: '우리 아이',
      region: '강남구',
      summaryLine: '실내 놀이 권장',
      reasonLine: '초미세먼지 주의',
      tossLink: 'https://toss.im/s/abc',
    });

    expect(message).toContain('우리 아이 오늘 공기질 가이드');
    expect(message).toContain('강남구 기준');
    expect(message).toContain('https://toss.im/s/abc');
  });
});
