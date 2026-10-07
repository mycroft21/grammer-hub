import { SLOT_KEYS, StudioRequest, generatePrompt, type CheckResult, type StudioEvent } from "@grammer-hub/core";
import { expectedStudioLatencyMs } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { runLogger } from "@/lib/log";
import { parseBody } from "@/lib/json";
import { sseResponse } from "@/lib/sse";
import { recordStudioRun, runFields, studioProvider, toStudioContext } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 2단계: Spec 생성을 슬롯 단위 SSE로 흘린다. 저장은 클라이언트가 결과를 보고 POST /api/prompts로.
 * 실행 기록은 끝(usage) · 오류 · 사용자 중단 중 처음 오는 한 번만 남기고, 성공이면 `run` 이벤트로 id를 알린다(보관할 때 잇는다).
 */
export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, StudioRequest);
  if (!body.ok) return body.res;
  const p = studioProvider(body.data.provider);
  if (!p.ok) return p.res;
  const c = await toStudioContext(body.data);
  if (!c.ok) return c.res;
  const ac = new AbortController();
  const gen = generatePrompt(p.provider, c.ctx, ac.signal);
  const expectedMs = expectedStudioLatencyMs(getDb(), p.provider.id);
  const user = await getUser();
  const t0 = Date.now();
  const base = { userId: user.id, kind: "generate" as const, provider: p.provider.id, model: p.provider.model, ...runFields(body.data, c.ctx) };
  let recorded = false;
  const record = (extra: Omit<Parameters<typeof recordStudioRun>[0], keyof typeof base>): string | null => {
    if (recorded) return null;
    recorded = true;
    return recordStudioRun({ ...base, ...extra });
  };
  const log = runLogger("studio", `${body.data.purpose}:${Date.now().toString(36)}`);
  log("생성 시작", { purpose: body.data.purpose, subtype: body.data.subtype ?? "auto", lang: body.data.promptLanguage, length: body.data.length, runtime: c.ctx.runtime, ticket: body.data.ticket ?? undefined, provider: p.provider.id, goalChars: body.data.goal.length, expectedMs });
  const wrapped = (async function* (): AsyncGenerator<StudioEvent | { event: "run"; data: { id: string } }, void> {
    try {
      yield { event: "progress", data: { stage: "requesting", expectedMs } };
      let slots = 0;
      let checks: CheckResult[] = [];
      let r = await gen.next();
      while (!r.done) {
        const ev = r.value;
        if (ev.event === "progress") log(`단계 ${ev.data.stage}`);
        else if (ev.event === "slot") { slots++; log(`슬롯 ${slots}/${SLOT_KEYS.length} ${ev.data.key}`); }
        else if (ev.event === "checks") { checks = ev.data; log("점검", { passed: ev.data.filter((c) => c.ok).length, total: ev.data.length }); }
        else if (ev.event === "usage") log("완료", { latencyMs: ev.data.latencyMs, costUsd: ev.data.costUsd, out: ev.data.outputTokens, cached: ev.data.cachedTokens });
        else if (ev.event === "error") {
          log(`오류 ${ev.data.code}: ${ev.data.message.slice(0, 160)}`);
          record({ status: "error", errorCode: ac.signal.aborted ? "aborted" : ev.data.code, latencyMs: Date.now() - t0, ...(ev.data.usage ? { usage: ev.data.usage } : {}) });
        }
        yield ev;
        if (ev.event === "usage") {
          const id = record({ status: "ok", usage: ev.data, checksPassed: checks.filter((c) => c.ok).length, checksTotal: checks.length });
          if (id) yield { event: "run", data: { id } };
        }
        r = await gen.next();
      }
    } catch (e) {
      record({ status: "error", errorCode: ac.signal.aborted ? "aborted" : "exception", latencyMs: Date.now() - t0 });
      throw e;
    } finally {
      // 클라이언트가 스트림을 끊으면(취소·창 닫기) 남은 이벤트 없이 여기로 온다
      record({ status: "error", errorCode: "aborted", latencyMs: Date.now() - t0 });
    }
  })();
  return sseResponse(wrapped, () => ac.abort());
}
