import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseWorkspaceProfile, profileSummary, type WorkspaceProfile } from "@grammer-hub/core";
import { env } from "./env";
import { serverLog } from "./log";

/**
 * 작업 공간 프로필 로더. 루트 `studio.workspace.json`(또는 WORKSPACE_PROFILE 경로)을 읽어 검증한다.
 * 파일 mtime이 바뀌면 다시 읽으므로 서버 재시작 없이 고칠 수 있다. 파싱 실패는 상태 화면에 그대로 보인다.
 */
const ROOT = resolve(process.cwd(), "..", "..");
export const workspacePath = (): string => (env.workspaceProfile ? resolve(ROOT, env.workspaceProfile) : resolve(ROOT, "studio.workspace.json"));

let cache: { mtime: number; profile: WorkspaceProfile | null; error: string | null } | null = null;

export function loadWorkspace(): { profile: WorkspaceProfile | null; error: string | null; path: string; exists: boolean } {
  const path = workspacePath();
  if (!existsSync(path)) { cache = null; return { profile: null, error: null, path, exists: false }; }
  const mtime = statSync(path).mtimeMs;
  if (cache && cache.mtime === mtime) return { profile: cache.profile, error: cache.error, path, exists: true };
  const r = parseWorkspaceProfile(readFileSync(path, "utf8"));
  cache = r.ok ? { mtime, profile: r.profile, error: null } : { mtime, profile: null, error: r.message };
  if (r.ok) serverLog("workspace", "프로필 로드", { ...profileSummary(r.profile), team: undefined });
  else serverLog("workspace", `프로필 오류: ${r.message.slice(0, 200)}`);
  return { profile: cache.profile, error: cache.error, path, exists: true };
}

/** 클라이언트에 보여 줄 요약(비밀값 없음). */
export function workspaceStatus() {
  const w = loadWorkspace();
  return { exists: w.exists, error: w.error, summary: profileSummary(w.profile), repoNames: w.profile?.repos.map((r) => r.name) ?? [], defaults: w.profile?.defaults ?? {} };
}
export type WorkspaceStatus = ReturnType<typeof workspaceStatus>;
