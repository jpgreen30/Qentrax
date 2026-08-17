import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/icon.png", destination: "/api/brand/icon" },
      { source: "/apple-icon.png", destination: "/api/brand/apple-icon" },
      { source: "/apple-touch-icon.png", destination: "/api/brand/apple-icon" },
      { source: "/favicon.ico", destination: "/api/brand/icon" },
    ];
  },
};

export default config;
