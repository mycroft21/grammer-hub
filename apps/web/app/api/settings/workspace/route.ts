import { z } from "zod";
import { ProfileOp } from "@grammer-hub/core";
import { requireAdmin } from "@/lib/auth/user";
import { getUser } from "@/lib/db";
import { parseBody } from "@/lib/json";
import { getWorkspaceFile, patchWorkspaceProfile, saveWorkspaceFile, saveWorkspaceProfile } from "@/lib/settings";
import { workspaceStatus } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const denied = await requireAdmin(); if (denied) return denied;
  return Response.json(getWorkspaceFile());
}

/** JSON 탭·가져오기는 원문(text), 폼 탭은 구조화 값(profile). 어느 쪽이든 스키마·중복 이름 검증을 통과해야 파일에 쓴다. */
const PutBody = z.union([z.object({ text: z.string().max(200_000) }), z.object({ profile: z.record(z.string(), z.unknown()) })]);
export async function PUT(req: Request): Promise<Response> {
  const denied = await requireAdmin(); if (denied) return denied;
  const body = await parseBody(req, PutBody);
  if (!body.ok) return body.res;
  const r = "text" in body.data ? saveWorkspaceFile(body.data.text) : saveWorkspaceProfile(body.data.profile);
  if (!r.ok) return Response.json({ error: { code: "invalid_profile", message: r.message } }, { status: 400 });
  return Response.json({ ok: true, repos: r.repos, ...getWorkspaceFile() });
}

/** 검토 화면의 "프로필에 추가"를 팀 기본값(파일)에: 관리자만. 다른 사람은 /api/me/workspace PATCH(내 작업 공간)로 간다. */
const PatchBody = z.object({ ops: z.array(ProfileOp).min(1).max(10) });
export async function PATCH(req: Request): Promise<Response> {
  const denied = await requireAdmin(); if (denied) return denied;
  const body = await parseBody(req, PatchBody);
  if (!body.ok) return body.res;
  const r = patchWorkspaceProfile(body.data.ops);
  if (!r.ok) return Response.json({ error: { code: "profile_patch_failed", message: r.message } }, { status: 400 });
  return Response.json({ ok: true, changes: r.changes, repos: r.repos, workspace: workspaceStatus((await getUser()).id) });
}
