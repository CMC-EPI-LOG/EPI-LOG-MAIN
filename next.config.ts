import type { NextConfig } from "next";
import withPWA from "next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

const config: NextConfig = {
  // Add other config options here if needed
  // Note: instrumentation.ts is automatically enabled in Next.js 13+
  webpack: (webpackConfig, { isServer }) => {
    if (isServer) {
      webpackConfig.ignoreWarnings = [
        ...(webpackConfig.ignoreWarnings ?? []),
        {
          module:
            /@opentelemetry\/instrumentation\/build\/esm\/platform\/node\/instrumentation\.js$/,
          message:
            /Critical dependency: the request of a dependency is an expression/,
        },
      ];
    }

    return webpackConfig;
  },
};

const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const shouldEnableSentryPlugin = Boolean(sentryOrg && sentryProject);

const nextConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
})(config);

export default shouldEnableSentryPlugin
  ? withSentryConfig(nextConfig, {
      org: sentryOrg,
      project: sentryProject,
      authToken: sentryAuthToken,
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
