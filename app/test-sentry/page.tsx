import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TestSentryPageClient from "./TestSentryPageClient";

export const metadata: Metadata = {
  title: "Sentry 테스트 페이지",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function TestSentryPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_DEBUG_PAGES !== "1"
  ) {
    notFound();
  }

  return <TestSentryPageClient />;
}
