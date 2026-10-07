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
  let mtime: number; let raw: string;
  try { mtime = statSync(path).mtimeMs; if (cache && cache.mtime === mtime) return { profile: cache.profile, error: cache.error, path, exists: true }; raw = readFileSync(path, "utf8"); }
  catch (e) { const msg = `프로필 파일을 읽을 수 없습니다 (${(e as NodeJS.ErrnoException).code ?? "읽기 오류"})`; cache = { mtime: -1, profile: null, error: msg }; serverLog("workspace", msg); return { profile: null, error: msg, path, exists: true }; }
  const r = parseWorkspaceProfile(raw);
  // JSON 문법 오류 메시지에는 파일 내용 일부가 섞이므로 위치만 남긴다
  const safeErr = r.ok ? null : r.message.startsWith("JSON 문법 오류") ? `JSON 문법 오류${/position (\d+)/.exec(r.message) ? ` (position ${/position (\d+)/.exec(r.message)![1]})` : ""}` : r.message;
  cache = r.ok ? { mtime, profile: r.profile, error: null } : { mtime, profile: null, error: safeErr };
  if (r.ok) serverLog("workspace", "프로필 로드", { ...profileSummary(r.profile), team: undefined });
  else serverLog("workspace", `프로필 오류: ${safeErr}`);
  return { profile: cache.profile, error: cache.error, path, exists: true };
}

/** 클라이언트에 보여 줄 요약(비밀값 없음). */
export function workspaceStatus() {
  const w = loadWorkspace();
  return {
    exists: w.exists, error: w.error, summary: profileSummary(w.profile),
    repoNames: w.profile?.repos.map((r) => r.name) ?? [],
    // 검토 화면의 "프로필에 추가"가 이미 있는 별칭·검증 명령을 알아야 중복 제안을 안 한다
    repos: w.profile?.repos.map((r) => ({ name: r.name, aliases: r.aliases, verify: r.verify })) ?? [],
    defaults: w.profile?.defaults ?? {},
  };
}
export type WorkspaceStatus = ReturnType<typeof workspaceStatus>;
