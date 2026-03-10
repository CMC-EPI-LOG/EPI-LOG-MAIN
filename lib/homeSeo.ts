import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  buildCanonicalUrl,
  canonicalSiteUrl,
} from "@/lib/site";

export const HOME_TITLE = "실시간 아이 대기질 맞춤 활동 가이드";
export const HOME_DESCRIPTION =
  "미세먼지, 초미세먼지, 오존, 기온, 습도와 아이 연령·질환 정보를 함께 반영해 오늘 외출 가능 여부와 준비사항을 안내합니다.";

export const HOME_FEATURES = [
  {
    title: "실시간 대기질 판단",
    description:
      "측정소 기반 대기질 데이터와 최신 상태 보정 로직을 반영해 현재 외출 난이도를 빠르게 보여줍니다.",
  },
  {
    title: "아이 프로필 맞춤 가이드",
    description:
      "연령대와 비염, 천식, 아토피 같은 질환 정보를 함께 고려해 행동 체크리스트를 조정합니다.",
  },
  {
    title: "기상과 생활지수까지 결합",
    description:
      "기온, 습도, 자외선, 꽃가루 지수까지 함께 보여줘 외출 준비와 복장 결정을 돕습니다.",
  },
] as const;

export const HOME_USE_CASES = [
  "등원 전 오늘 외출이 괜찮은지 빠르게 확인하고 싶은 보호자",
  "미세먼지와 오존이 높은 날 아이 준비물을 정리해야 하는 보호자",
  "위치와 프로필에 따라 달라지는 개인화된 활동 가이드를 찾는 사용자",
] as const;

export const HOME_FAQS = [
  {
    question: "아이숨은 어떤 정보를 바탕으로 결과를 보여주나요?",
    answer:
      "대기질 데이터와 기상 정보, 사용자가 입력한 아이 연령대와 질환 정보를 함께 반영해 오늘의 활동 가이드를 구성합니다.",
  },
  {
    question: "지역이 바뀌면 결과도 달라지나요?",
    answer:
      "네. 현재 위치나 직접 선택한 지역 기준으로 가장 가까운 측정소 후보를 찾고, 가능한 최신 대기질 상태를 반영합니다.",
  },
  {
    question: "의료 진단이나 처방을 대신하나요?",
    answer:
      "아니요. 아이숨은 보호자의 일상 판단을 돕는 정보 서비스이며, 증상이나 치료 판단은 반드시 의료진 상담이 우선입니다.",
  },
  {
    question: "어떤 상황에서 유용한가요?",
    answer:
      "등원, 하원, 놀이터 방문, 산책 전처럼 아이의 실외 활동 여부를 짧은 시간 안에 판단해야 하는 상황에서 특히 유용합니다.",
  },
] as const;

export function getHomeJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: canonicalSiteUrl,
      inLanguage: "ko-KR",
      description: HOME_DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: SITE_NAME,
      url: canonicalSiteUrl,
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      inLanguage: "ko-KR",
      description: HOME_DESCRIPTION,
      image: buildCanonicalUrl(DEFAULT_OG_IMAGE),
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "KRW",
      },
      featureList: HOME_FEATURES.map((feature) => feature.title),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HOME_FAQS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ] as const;
}
