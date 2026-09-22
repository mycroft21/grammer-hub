import { z } from "zod";
import { parseBody } from "@/lib/json";
import { SETTINGS, getSettings, saveSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 설정 목록(비밀값은 마스킹) + 정의(라벨·도움말). */
export async function GET(): Promise<Response> {
  return Response.json({ ...getSettings(), defs: SETTINGS });
}

const Body = z.object({ values: z.record(z.string(), z.string().max(4000)) });
/** 바뀐 키만 받아 .env에 쓰고 즉시 반영. */
export async function PUT(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const r = saveSettings(body.data.values);
  if (!r.ok) return Response.json({ error: { code: "invalid_setting", message: r.message } }, { status: 400 });
  return Response.json({ ok: true, restart: r.restart, changed: r.changed, ...getSettings(), defs: SETTINGS });
}
