/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    API_BASE: process.env.API_BASE ?? process.env.PLATFORM_BASE_URL ?? "http://localhost:8787",
  },
};

export default nextConfig;
