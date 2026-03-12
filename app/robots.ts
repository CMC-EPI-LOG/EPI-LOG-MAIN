import type { MetadataRoute } from "next";
import {
  buildCanonicalUrl,
  canonicalSiteUrl,
  isIndexableDeployment,
} from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableDeployment) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      sitemap: buildCanonicalUrl("/sitemap.xml"),
      host: canonicalSiteUrl,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/test-sentry"],
    },
    sitemap: buildCanonicalUrl("/sitemap.xml"),
    host: canonicalSiteUrl,
  };
}
