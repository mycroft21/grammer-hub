import { StudioRequest, planPrompt } from "@grammer-hub/core";
import { getUser } from "@/lib/db";
import { env } from "@/lib/env";
import { parseBody } from "@/lib/json";
import { recordStudioRun, runFields, studioProvider, toStudioContext } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1단계: 의도 정리(ready | ask). 성공·실패 모두 실행 기록에 남긴다. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, StudioRequest);
  if (!body.ok) return body.res;
  const p = studioProvider(body.data.provider, "plan");
  if (!p.ok) return p.res;
  const c = await toStudioContext(body.data);
  if (!c.ok) return c.res;
  const user = await getUser();
  const t0 = Date.now();
  const base = { userId: user.id, kind: "plan" as const, provider: p.provider.id, model: p.provider.model, ...runFields(body.data, c.ctx) };
  let r: Awaited<ReturnType<typeof planPrompt>>;
  try { r = await planPrompt(p.provider, c.ctx, req.signal); }
  catch (e) { recordStudioRun({ ...base, status: "error", errorCode: req.signal.aborted ? "aborted" : "exception", latencyMs: Date.now() - t0 }); throw e; }
  if (r.error) {
    recordStudioRun({ ...base, status: "error", errorCode: req.signal.aborted ? "aborted" : r.error.code, usage: r.usage, latencyMs: Date.now() - t0 });
    return Response.json({ error: r.error }, { status: 502 });
  }
  recordStudioRun({ ...base, subtype: r.plan?.subtype ?? base.subtype ?? null, status: "ok", usage: r.usage });
  return Response.json({ plan: r.plan, usage: r.usage });
}
