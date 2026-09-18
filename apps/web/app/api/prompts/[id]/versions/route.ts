import { z } from "zod";
import { PromptSpec, SLOT_KEYS, STUDIO_PROMPT_VERSION, renderClaude, runChecks } from "@grammer-hub/core";
import { addVersion, getPrompt, recordPromptEvent } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { bad, parseBody } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  spec: PromptSpec,
  source: z.enum(["regenerate", "edit"]),
  slot: z.enum(SLOT_KEYS).nullable().optional(),
  provider: z.string().max(20).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
});

/** 블록 재생성·직접 수정 결과를 새 버전으로. 렌더·점검은 서버가 다시 계산한다. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const db = getDb(); const user = getUser();
  const prompt = getPrompt(db, user.id, id);
  if (!prompt) return bad("프롬프트를 찾을 수 없습니다", 404);
  const spec = body.data.spec;
  const v = addVersion(db, id, {
    spec, rendered: renderClaude(spec), checks: runChecks(spec), source: body.data.source, slot: body.data.slot ?? null,
    studioVersion: STUDIO_PROMPT_VERSION, provider: body.data.provider ?? null, model: body.data.model ?? null,
  });
  recordPromptEvent(db, { promptId: id, versionId: v.id, action: body.data.source, slot: body.data.slot ?? null });
  return Response.json(v);
}
