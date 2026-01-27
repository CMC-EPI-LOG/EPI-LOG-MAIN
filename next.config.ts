import type { NextConfig } from "next";
import withPWA from "next-pwa";

const config: NextConfig = {
  // Add other config options here if needed
};

const nextConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
})(config);

export default nextConfig;
