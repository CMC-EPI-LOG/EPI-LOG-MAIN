const DEFAULT_APP_NAME = 'epilog';
const DEFAULT_SHARE_OG_IMAGE_URL = 'https://www.ai-soom.site/thumbnail.png';
const TOSS_HOSTNAME_PATTERN = /^([a-z0-9-]+)\.(?:private-)?apps\.tossmini\.com$/i;

export function resolveMiniappNameFromHostname(
  hostname: string | undefined,
  fallbackName: string = DEFAULT_APP_NAME,
): string {
  if (!hostname) return fallbackName;
  const matched = hostname.match(TOSS_HOSTNAME_PATTERN);
  return matched?.[1] || fallbackName;
}

export function buildMiniappDeepLink(appName: string, shareId: string): string {
  const safeAppName = appName.trim() || DEFAULT_APP_NAME;
  const params = new URLSearchParams({
    shared_by: shareId,
    source: 'result_share',
  });
  return `intoss://${safeAppName}?${params.toString()}`;
}

export function resolveShareOgImageUrl(): string {
  const trimmed = DEFAULT_SHARE_OG_IMAGE_URL.trim();
  if (trimmed && /^https:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_SHARE_OG_IMAGE_URL;
}

export function buildTossShareMessage(options: {
  nickname?: string;
  region?: string;
  summaryLine: string;
  reasonLine?: string;
  tossLink: string;
}): string {
  const { nickname, region, summaryLine, reasonLine, tossLink } = options;
  const header = `${nickname || '우리 아이'} 오늘 공기질 가이드`;
  const body = `${region || '우리 동네'} 기준 · ${summaryLine}${reasonLine ? ` · 이유: ${reasonLine}` : ''}`;
  return `${header}\n${body}\n${tossLink}`;
}
