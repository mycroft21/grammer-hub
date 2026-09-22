import { z } from "zod";
import { parseBody } from "@/lib/json";
import { getWorkspaceFile, saveWorkspaceFile } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(getWorkspaceFile());
}

const Body = z.object({ text: z.string().max(200_000) });
/** 검증(스키마·중복 이름)에 통과한 JSON만 파일로 쓴다. */
export async function PUT(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const r = saveWorkspaceFile(body.data.text);
  if (!r.ok) return Response.json({ error: { code: "invalid_profile", message: r.message } }, { status: 400 });
  return Response.json({ ok: true, repos: r.repos, ...getWorkspaceFile() });
}
