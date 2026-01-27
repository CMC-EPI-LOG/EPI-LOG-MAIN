import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import KakaoScript from "@/components/KakaoScript";
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
  display: 'swap',
});

export const metadata: Metadata = {
  title: "오늘결정 (Epilogue)",
  description: "대기질에 따른 우리 아이 활동 가이드",
  manifest: "/manifest.json",
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
  return (
    <html lang="ko">
      <body className={`${chilpanFont.className} ${chilpanFont.variable} antialiased min-h-screen`}>
        {children}
        <Toaster position="top-center" reverseOrder={false} />
        <KakaoScript />
      </body>
    </html>
  );
}
