import { CorrectRequest, runCorrection, type Category, type PiiKind, type SseEvent, type Usage } from "@grammer-hub/core";
import { createDraft, createRun, finishRun, getProfile, listDictionary, listRules, saveSuggestions, updateDraftMask } from "@grammer-hub/db";
import { getDb, getUser } from "@/lib/db";
import { env } from "@/lib/env";
import { bad, parseBody } from "@/lib/json";
import { getProvider } from "@/lib/providers";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = await parseBody(req, CorrectRequest);
  if (!body.ok) return body.res;
  const { text, profileId, level } = body.data;

  const db = getDb();
  const user = getUser();
  const profile = getProfile(db, user.id, profileId);
  if (!profile) return bad(`프로필을 찾을 수 없습니다: ${profileId}`, 404);

  let provider;
  try { provider = getProvider(body.data.provider ?? null); }
  catch (e) { return Response.json({ error: { code: "provider_unavailable", message: String(e) } }, { status: 503 }); }
  if (provider.id === "cloud" && !env.hasAnthropicKey) {
    return Response.json({ error: { code: "provider_unavailable", message: "ANTHROPIC_API_KEY가 설정되지 않았습니다" } }, { status: 503 });
  }

  const rules = listRules(db, user.id);
  const dictionary = listDictionary(db, user.id);
  const muted = rules.filter((r) => r.status === "demoted" && r.scope.category)
    .filter((r) => (!r.scope.channel || r.scope.channel === profile.channel) && (!r.scope.audience || r.scope.audience === profile.audience))
    .map((r) => r.scope.category as Category);

  // run은 미리 만들어 runId를 meta에 싣는다. 원문 저장은 파이프라인 결과(마스킹 후)로 갱신.
  const draftId = createDraft(db, { userId: user.id, profileId, textNfc: text.normalize("NFC"), textMasked: "", maskMap: {}, lang: profile.lang, storeText: env.storeDrafts });
  const runId = createRun(db, { draftId, level, provider: provider.id, model: provider.model, promptVersion: "pending", profileVersionId: null });

  const ac = new AbortController();
  const gen = runCorrection({
    runId, text, level, profile, rules, rulesVersionId: null, dictionary, mutedCategories: muted, provider,
    piiBlock: env.piiBlock as PiiKind[], signal: ac.signal,
  });

  // 결과 저장을 위해 제너레이터를 감싼다
  const wrapped = (async function* (): AsyncGenerator<SseEvent, void> {
    let r = await gen.next();
    while (!r.done) { yield r.value; r = await gen.next(); }
    const result = r.value;
    const usage: Usage = result.usage ?? { inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0, ttfbMs: 0 };
    if (result.error) finishRun(db, runId, usage, "error", result.error.code);
    else {
      saveSuggestions(db, runId, result.edits, result.rewrites, result.dropped);
      finishRun(db, runId, usage, "ok");
    }
    if (env.storeDrafts) updateDraftMask(db, draftId, result.masked.masked, Object.fromEntries(result.masked.map));
  })();

  return sseResponse(wrapped, () => ac.abort());
}
