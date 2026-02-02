import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '',
  assetPrefix: './',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
