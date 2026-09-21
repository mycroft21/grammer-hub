import { z } from "zod";
import { PromptSpec, SLOT_KEYS, StudioRequest, regenerateSlot } from "@grammer-hub/core";
import { parseBody } from "@/lib/json";
import { studioProvider, toStudioContext } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  request: StudioRequest,
  spec: PromptSpec,
  slot: z.enum(SLOT_KEYS),
  instruction: z.string().max(500).nullable().optional(),
});

/** 블록 재생성: 한 슬롯만 다시. 나머지는 고정. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const p = studioProvider(body.data.request.provider);
  if (!p.ok) return p.res;
  const c = await toStudioContext(body.data.request);
  if (!c.ok) return c.res;
  const r = await regenerateSlot(p.provider, c.ctx, body.data.spec, body.data.slot, body.data.instruction ?? null, req.signal);
  if (r.error) return Response.json({ error: r.error }, { status: 502 });
  return Response.json({ spec: r.spec, rendered: r.rendered, checks: r.checks });
}
