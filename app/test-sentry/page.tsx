import type { Metadata } from "next";
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
  return <TestSentryPageClient />;
}
