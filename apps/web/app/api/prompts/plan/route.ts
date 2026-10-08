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
  // 분류 모드: 요청의 purpose·runtime은 자리값이라 기록하지 않는다(성공하면 코드가 확정한 목적만)
  const base = { userId: user.id, kind: "plan" as const, provider: p.provider.id, model: p.provider.model, ...runFields(body.data, c.ctx), ...(body.data.classify ? { purpose: null, subtype: null, runtime: null } : {}) };
  let r: Awaited<ReturnType<typeof planPrompt>>;
  try { r = await planPrompt(p.provider, c.ctx, req.signal); }
  catch (e) { recordStudioRun({ ...base, status: "error", errorCode: req.signal.aborted ? "aborted" : "exception", latencyMs: Date.now() - t0 }); throw e; }
  if (r.error) {
    recordStudioRun({ ...base, status: "error", errorCode: req.signal.aborted ? "aborted" : r.error.code, usage: r.usage, latencyMs: Date.now() - t0 });
    return Response.json({ error: r.error }, { status: 502 });
  }
  // 분류 모드면 요청의 purpose는 자리값 → 기록에는 코드가 확정한 목적
  recordStudioRun({ ...base, purpose: r.plan?.purpose ?? base.purpose ?? null, subtype: r.plan?.subtype ?? base.subtype ?? null, status: "ok", usage: r.usage });
  return Response.json({ plan: r.plan, usage: r.usage });
}
