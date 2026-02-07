import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Toaster } from "react-hot-toast";
import KakaoScript from "@/components/KakaoScript";
import Analytics from "@/components/Analytics";
import localFont from "next/font/local";
import "./globals.css";

const chilpanFont = localFont({
  src: [
    {
      path: "./fonts/HakgyoansimChilpanjiugae-Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/HakgyoansimChilpanjiugae-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-chilpan",
  display: "swap",
});

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
const siteUrl = rawSiteUrl.replace(/\/$/, "");
const gaId = process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_GA4_ID;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "에피로그 (EPI-LOG)",
    template: "%s | 에피로그 (EPI-LOG)",
  },
  description: "대기질에 따른 우리 아이 활동 가이드",
  applicationName: "에피로그 (EPI-LOG)",
  keywords: [
    "에피로그",
    "EPI-LOG",
    "대기질",
    "미세먼지",
    "초미세먼지",
    "육아",
    "아이 건강",
    "활동 가이드",
  ],
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "에피로그 (EPI-LOG)",
    title: "에피로그 (EPI-LOG)",
    description: "대기질에 따른 우리 아이 활동 가이드",
    images: [
      {
        url: "/thumbnail.png",
        width: 1200,
        height: 630,
        alt: "에피로그 (EPI-LOG) 공유 이미지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "에피로그 (EPI-LOG)",
    description: "대기질에 따른 우리 아이 활동 가이드",
    images: ["/thumbnail.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: "3bG1zQxlFNvpo41nV5G7Sox0n1HmuH_MnQl6wqGjWpo",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFDF5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

declare global {
  interface Window {
    Kakao: any;
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clarityScript = `(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "vdiqwxoxsc");`;

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          type="text/javascript"
          dangerouslySetInnerHTML={{ __html: clarityScript }}
        />
      </head>
      <body
        className={`${chilpanFont.className} ${chilpanFont.variable} antialiased min-h-screen`}
      >
        {gaId && (
          <>
            <GoogleAnalytics gaId={gaId} />
            <Suspense fallback={null}>
              <Analytics gaId={gaId} />
            </Suspense>
          </>
        )}
        {children}
        <Toaster position="top-center" reverseOrder={false} />
        <KakaoScript />
      </body>
    </html>
  );
}
