import type { Metadata } from "next";
import HomeScreen from "@/components/HomeScreen";
import HomeSeoSections from "@/components/HomeSeoSections";
import { getHomeJsonLd, HOME_DESCRIPTION, HOME_TITLE } from "@/lib/homeSeo";
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  buildCanonicalUrl,
  canonicalSiteUrl,
} from "@/lib/site";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: canonicalSiteUrl,
  },
  openGraph: {
    url: canonicalSiteUrl,
    title: `${HOME_TITLE} | ${SITE_NAME}`,
    description: HOME_DESCRIPTION,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} 대표 이미지`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${HOME_TITLE} | ${SITE_NAME}`,
    description: HOME_DESCRIPTION,
    images: [buildCanonicalUrl(DEFAULT_OG_IMAGE)],
  },
};

export default function Home() {
  const jsonLdItems = getHomeJsonLd();

  return (
    <>
      {jsonLdItems.map((item, index) => (
        <script
          key={`home-jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
      <HomeScreen enableClothingModalPreview />
      <HomeSeoSections />
    </>
  );
}
