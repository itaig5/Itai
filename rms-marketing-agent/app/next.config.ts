import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: ['@revpilot/core'],
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;
