import { z } from "zod";
import { ProfileOp, WorkspaceOverlay, applyOverlayOps, cleanOverlayDraft, overlayIssues } from "@grammer-hub/core";
import { saveWorkspaceOverlay } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { parseBody } from "@/lib/json";
import { serverLog } from "@/lib/log";
import { loadMergedWorkspace, workspaceStatus } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 작업 공간 화면: 내 층(편집), 팀 기본값(읽기 전용 요약), 팀이 바뀌어 적용 안 된 내 항목. */
function view(userId: string) {
  const w = loadMergedWorkspace(userId);
  return {
    overlay: w.overlay, drops: w.drops,
    team: w.team ? { team: w.team.team ?? null, repos: w.team.repos.map((r) => ({ name: r.name, what: r.what, aliases: r.aliases, verify: r.verify })), conventions: w.team.conventions, defaults: w.team.defaults } : null,
    teamError: w.error,
    workspace: workspaceStatus(userId),
  };
}

export async function GET(): Promise<Response> {
  return Response.json(view((await getUser()).id));
}

/** 팀 파일을 못 읽는 동안에는 팀 기준 검사가 거짓 판정(얹기 항목 = 설명 없는 내 저장소)을 내므로 저장을 막는다 — 안내를 따라 지우면 데이터가 사라진다. */
function teamUnreadable(userId: string): Response | null {
  const w = loadMergedWorkspace(userId);
  return w.exists && !w.team ? Response.json({ error: { code: "team_workspace_error", message: `팀 기본값 파일에 오류가 있어 지금은 내 작업 공간을 저장할 수 없습니다(${w.error ?? "알 수 없는 오류"}). 관리자가 고친 뒤 다시 시도하세요.` } }, { status: 409 }) : null;
}

/** 폼 저장. 팀 기준 검사(얹기 항목의 설명 금지·내 레포 설명 필수·별칭 충돌)를 통과해야 쓴다. */
const PutBody = z.object({ overlay: z.record(z.string(), z.unknown()) });
export async function PUT(req: Request): Promise<Response> {
  const body = await parseBody(req, PutBody);
  if (!body.ok) return body.res;
  const user = await getUser();
  const blocked = teamUnreadable(user.id); if (blocked) return blocked;
  const parsed = WorkspaceOverlay.safeParse(body.data.overlay);
  const overlay = parsed.success ? cleanOverlayDraft(parsed.data) : body.data.overlay;
  const issues = overlayIssues(loadMergedWorkspace(user.id).team, overlay);
  if (Object.keys(issues).length) return Response.json({ error: { code: "invalid_overlay", message: `${Object.keys(issues).length}개 칸을 확인해 주세요`, issues } }, { status: 400 });
  saveWorkspaceOverlay(getDb(), user.id, overlay as Record<string, unknown>);
  serverLog("workspace", "내 작업 공간 저장", { repos: (overlay as WorkspaceOverlay).repos.length });
  return Response.json({ ok: true, ...view(user.id) });
}

/** 검토 화면의 "프로필에 추가"(기본 대상). 팀 저장소면 얹기 항목을 만든다. */
const PatchBody = z.object({ ops: z.array(ProfileOp).min(1).max(10) });
export async function PATCH(req: Request): Promise<Response> {
  const body = await parseBody(req, PatchBody);
  if (!body.ok) return body.res;
  const user = await getUser();
  const blocked = teamUnreadable(user.id); if (blocked) return blocked;
  const w = loadMergedWorkspace(user.id);
  const r = applyOverlayOps(w.team, w.overlay, body.data.ops);
  if (!r.ok) return Response.json({ error: { code: "profile_patch_failed", message: r.message } }, { status: 400 });
  if (r.changes.length) {
    saveWorkspaceOverlay(getDb(), user.id, r.overlay as unknown as Record<string, unknown>);
    serverLog("workspace", "내 작업 공간 자동 추가", { ops: body.data.ops.map((o) => o.op).join(","), changes: r.changes.length });
  }
  return Response.json({ ok: true, changes: r.changes, workspace: workspaceStatus(user.id) });
}
