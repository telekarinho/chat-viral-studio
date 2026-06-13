/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PWA service worker is registered manually from app/layout via /sw.js
  // ESLint is optional for builds; run `npm run lint` separately if desired.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
