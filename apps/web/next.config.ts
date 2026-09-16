import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@grammer-hub/core", "@grammer-hub/db"],
  serverExternalPackages: ["better-sqlite3"],
};
export default nextConfig;
