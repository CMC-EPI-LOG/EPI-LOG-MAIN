const PRIMARY_SITE_URL = "https://www.ai-soom.site";

export const SITE_NAME = "아이숨 (AI-Soom)";
export const SITE_DESCRIPTION =
  "실시간 대기질과 기상, 아이 연령과 질환 정보를 함께 반영해 외출 여부와 준비사항을 안내하는 맞춤 활동 가이드";
export const DEFAULT_OG_IMAGE = "/thumbnail.png";
export const SITE_KEYWORDS = [
  "아이숨",
  "AI-Soom",
  "대기질",
  "미세먼지",
  "초미세먼지",
  "오존",
  "아이 건강",
  "육아",
  "외출 가이드",
  "활동 가이드",
];

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "production"
    ? PRIMARY_SITE_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const siteUrl = rawSiteUrl.replace(/\/$/, "");
export const canonicalSiteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || PRIMARY_SITE_URL
).replace(/\/$/, "");
export const isIndexableDeployment =
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");

export function buildCanonicalUrl(path = "/") {
  return new URL(path, canonicalSiteUrl).toString();
}
