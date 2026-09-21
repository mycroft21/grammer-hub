import type { NextConfig } from "next";
import { processEnv } from "@next/env";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 모노레포 루트의 .env를 읽는다. Next는 앱 디렉터리(apps/web)의 .env만 보므로 문서대로 루트에 둔 .env가 무시된다.
 * Next가 자기 .env를 이미 처리한 뒤라 forceReload로 다시 돌린다 — 같은 키가 양쪽에 있으면 루트가 이기고, OS 환경 변수는 항상 우선.
 */
function loadRootEnv() {
  let dir = process.cwd();
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) { const up = dirname(dir); if (up === dir) return; dir = up; }
  const files = [".env.local", ".env"].filter((f) => existsSync(join(dir, f))).map((f) => ({ path: f, contents: readFileSync(join(dir, f), "utf8"), env: {} }));
  if (files.length) processEnv(files, dir, console, true);
}
loadRootEnv();

const nextConfig: NextConfig = {
  transpilePackages: ["@grammer-hub/core", "@grammer-hub/db"],
  serverExternalPackages: ["better-sqlite3"],
  agentRules: false, // AGENTS.md/CLAUDE.md 자동 생성 끔
};
export default nextConfig;
