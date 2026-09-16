import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@grammer-hub/core", "@grammer-hub/db"],
  serverExternalPackages: ["better-sqlite3"],
  agentRules: false, // AGENTS.md/CLAUDE.md 자동 생성 끔
};
export default nextConfig;
