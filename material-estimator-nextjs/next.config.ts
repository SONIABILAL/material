import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "sharp"],
  experimental: {
    proxyClientMaxBodySize: "50mb"
  }
};

export default nextConfig;
