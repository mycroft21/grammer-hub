import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getProvider } from "@/lib/providers";
import { env, cloudReady } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = resolve(process.cwd(), "..", "..");
function git(args: string[]): string | null {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 5000 }).trim(); } catch { return null; }
}

/**
 * 상태 점검: 어떤 백엔드로 도는지, 그 백엔드가 살아 있는지, 코드·빌드가 언제 것인지.
 * `curl localhost:3000/api/health` 또는 `pnpm doctor`가 본다. 비밀값은 내지 않는다.
 */
export async function GET(req: Request): Promise<Response> {
  const probe = new URL(req.url).searchParams.get("probe") === "1";
  const backend = env.fakeProvider ? "fake" : env.cloudBackend === "claude-cli" ? "claude-cli" : "api";
  const cloud = getProvider("cloud");
  let health: { ok: boolean; detail?: string } | null = null;
  if (probe) { try { health = await cloud.health(); } catch (e) { health = { ok: false, detail: String(e) }; } }

  const buildIdPath = resolve(process.cwd(), ".next", "BUILD_ID");
  const build = existsSync(buildIdPath) ? { id: readFileSync(buildIdPath, "utf8").trim(), builtAt: statSync(buildIdPath).mtime.toISOString() } : null;
  const head = git(["rev-parse", "--short", "HEAD"]);
  const headTime = git(["log", "-1", "--format=%cI"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = git(["status", "--porcelain"]);
  const buildStale = build && headTime ? new Date(build.builtAt).getTime() < new Date(headTime).getTime() : null;

  return Response.json({
    ok: cloudReady() || env.defaultProvider === "local",
    cloud: {
      backend, ready: cloudReady(), model: cloud.model,
      ...(backend === "claude-cli" ? { cliPath: env.claudeCliPath } : {}),
      ...(backend === "api" ? { hasApiKey: env.hasAnthropicKey } : {}),
      health,
    },
    defaultProvider: env.defaultProvider,
    local: { url: env.localLlmUrl, model: env.localLlmModel },
    storeDrafts: env.storeDrafts, piiBlock: env.piiBlock, databaseUrl: env.databaseUrl,
    code: { branch, head, committedAt: headTime, dirtyFiles: dirty === null ? null : dirty.split("\n").filter(Boolean).length },
    build: build ? { ...build, staleAgainstHead: buildStale } : null,
    node: process.version,
  });
}
