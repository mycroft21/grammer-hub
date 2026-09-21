import { StudioRequest, generatePrompt, type StudioEvent } from "@grammer-hub/core";
import { expectedStudioLatencyMs } from "@grammer-hub/db";
import { getDb } from "@/lib/db";
import { runLogger } from "@/lib/log";
import { parseBody } from "@/lib/json";
import { sseResponse } from "@/lib/sse";
import { studioProvider, toStudioContext } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2단계: Spec 생성을 슬롯 단위 SSE로 흘린다. 저장은 클라이언트가 결과를 보고 POST /api/prompts로. */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, StudioRequest);
  if (!body.ok) return body.res;
  const p = studioProvider(body.data.provider);
  if (!p.ok) return p.res;
  const ac = new AbortController();
  const gen = generatePrompt(p.provider, toStudioContext(body.data), ac.signal);
  const expectedMs = expectedStudioLatencyMs(getDb(), p.provider.id);
  const log = runLogger("studio", `${body.data.purpose}:${Date.now().toString(36)}`);
  log("생성 시작", { purpose: body.data.purpose, subtype: body.data.subtype ?? "auto", lang: body.data.promptLanguage, length: body.data.length, provider: p.provider.id, goalChars: body.data.goal.length, expectedMs });
  const wrapped = (async function* (): AsyncGenerator<StudioEvent, void> {
    yield { event: "progress", data: { stage: "requesting", expectedMs } };
    let slots = 0;
    let r = await gen.next();
    while (!r.done) {
      const ev = r.value;
      if (ev.event === "progress") log(`단계 ${ev.data.stage}`);
      else if (ev.event === "slot") { slots++; log(`슬롯 ${slots}/13 ${ev.data.key}`); }
      else if (ev.event === "checks") log("점검", { passed: ev.data.filter((c) => c.ok).length, total: ev.data.length });
      else if (ev.event === "usage") log("완료", { latencyMs: ev.data.latencyMs, costUsd: ev.data.costUsd, out: ev.data.outputTokens, cached: ev.data.cachedTokens });
      else if (ev.event === "error") log(`오류 ${ev.data.code}: ${ev.data.message.slice(0, 160)}`);
      yield ev; r = await gen.next();
    }
  })();
  return sseResponse(wrapped, () => ac.abort());
}
