import { z } from "zod";
import { PromptSpec, SLOT_KEYS, StudioRequest, regenerateSlot } from "@grammer-hub/core";
import { getPrompt } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { parseBody } from "@/lib/json";
import { recordStudioRun, runFields, studioProvider, toStudioContext } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  request: StudioRequest,
  spec: PromptSpec,
  slot: z.enum(SLOT_KEYS),
  instruction: z.string().max(500).nullable().optional(),
  promptId: z.string().max(60).nullable().optional(),   // 보관된 프롬프트를 재생성하면 실행 기록을 그 프롬프트에 잇는다
});

/** 블록 재생성: 한 슬롯만 다시. 나머지는 고정. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const p = studioProvider(body.data.request.provider, "generate");
  if (!p.ok) return p.res;
  const c = await toStudioContext(body.data.request);
  if (!c.ok) return c.res;
  const user = await getUser();
  const t0 = Date.now();
  const promptId = body.data.promptId && getPrompt(getDb(), user.id, body.data.promptId) ? body.data.promptId : null;
  const base = { userId: user.id, kind: "regenerate" as const, provider: p.provider.id, model: p.provider.model, promptId, ...runFields(body.data.request, c.ctx) };
  let r: Awaited<ReturnType<typeof regenerateSlot>>;
  try { r = await regenerateSlot(p.provider, c.ctx, body.data.spec, body.data.slot, body.data.instruction ?? null, req.signal); }
  catch (e) { recordStudioRun({ ...base, status: "error", errorCode: req.signal.aborted ? "aborted" : "exception", latencyMs: Date.now() - t0 }); throw e; }
  if (r.error) {
    recordStudioRun({ ...base, status: "error", errorCode: req.signal.aborted ? "aborted" : r.error.code, usage: r.usage, latencyMs: Date.now() - t0 });
    return Response.json({ error: r.error }, { status: 502 });
  }
  recordStudioRun({ ...base, status: "ok", usage: r.usage, checksPassed: r.checks.filter((x) => x.ok).length, checksTotal: r.checks.length });
  return Response.json({ spec: r.spec, rendered: r.rendered, checks: r.checks });
}
