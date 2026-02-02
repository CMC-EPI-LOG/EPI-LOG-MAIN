import type { NextConfig } from "next";
import withPWA from "next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

const config: NextConfig = {
  // Add other config options here if needed
  // Note: instrumentation.ts is automatically enabled in Next.js 13+
};

const nextConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
})(config);

export default withSentryConfig(nextConfig, {
  org: "epi-j9c",
  project: "javascript-nextjs",
  tunnelRoute: "/monitoring",
});
