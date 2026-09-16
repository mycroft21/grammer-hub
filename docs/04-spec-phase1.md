# Phase 1 구현 스펙 (v0.1, 2026-09-16)

> 범위: 기획서 10장 Phase 1 "교정이 된다" + 로컬/클라우드 교체형 백엔드 + 학습 루프를 위한 로깅 기반.
> 선행 문서: [기획서](./01-product-plan.md) · [가성비 판정](./02-feasibility.md) · [로컬 LLM 판정](./03-local-llm.md)

---

## 0. 범위와 가정

**포함**
- 웹 에디터 1페이지(원문 → 교정 결과, 변경 카드, 톤 대안), 상황 프로필 CRUD, 스타일 규칙 수동 편집, 개인 사전.
- `POST /api/correct` 스트리밍 API. Provider 2종: `cloud` (Claude Sonnet 5), `local` (llama-server + Gemma 4 26B-A4B).
- 앵커 해소 라이브러리(LLM 출력 → 원문 오프셋), 한국어 픽스처 테스트.
- 모든 제안·피드백·토큰·지연·비용 로깅(Phase 2 학습 루프의 입력).
- PII 마스킹(외부 LLM 호출 전).

**제외(Phase 2 이후)**
- 자동 규칙 증류, 임베딩 검색, 대시보드, 전역 단축키 유틸, 크롬 확장, 다중 사용자 결제.

**가정(미확정 항목의 기본값)**
| 항목 | 기본값 | 바뀌면 영향 |
|---|---|---|
| 배포 | 로컬 `pnpm dev` + SQLite. Vercel/Postgres는 Phase 2 | DB 드라이버만 교체(Drizzle) |
| 사용자 | 단일 사용자, 이메일 화이트리스트 1개 | 스키마는 `user_id` 스코프 유지 |
| 언어 | 한국어 1급, 영어 2급 | 프롬프트 언어 분기 |
| 로컬 모델 | Gemma 4 26B-A4B QAT Q4_0, llama-server | **확정: M5 기본형 32GB.** 출력 토큰 최소화 설계 필수(§4.2) |
| 메신저·OS | **확정: 슬랙 · macOS** | Phase 2 단축키는 Raycast 확장 또는 Shortcuts |

---

## 1. 시스템 구성

```
grammer-hub/
├─ apps/
│  └─ web/                    Next.js 15 App Router, TS, Tailwind, shadcn/ui
│     ├─ app/(editor)/page.tsx
│     ├─ app/profiles/…  app/style/…  app/dictionary/…
│     └─ app/api/{correct,feedback,profiles,rules,dictionary,runs}/route.ts
├─ packages/
│  ├─ core/                   순수 TS, 프레임워크 무관
│  │  ├─ schema/              zod: CorrectionOutput, CorrectRequest, SSE events
│  │  ├─ prompt/              시스템 프롬프트 빌더, 카테고리 정의, 프로필 렌더러
│  │  ├─ anchor/              정규화·문장 분할·앵커 해소·edit 적용
│  │  ├─ pii/                 마스킹/복원
│  │  └─ providers/           CorrectionProvider 인터페이스, cloud, local
│  └─ db/                     Drizzle 스키마, 마이그레이션, 리포지토리
├─ tools/                     비용·지연 모델 스크립트(기존)
└─ docs/
```

데이터 흐름:
```
UI ─POST /api/correct(SSE)→ route ─→ pii.mask ─→ anchor.normalize+split
   ─→ prompt.build(profile, rules, dictionary, draft) ─→ provider.correct()
   ─stream JSON─→ partial parse ─→ anchor.resolve(edit) ─SSE edit event→ UI
   ─final─→ pii.unmask ─→ db.save(run, suggestions) ─SSE done→ UI
UI ─POST /api/feedback→ db.save(feedback_events)
```

---

## 2. 도메인 타입 (`packages/core/schema`)

```ts
export const Category = z.enum([
  "SPACING","SPELLING","GRAMMAR","PUNCTUATION","HONORIFIC",
  "REGISTER","WORD_CHOICE","CLARITY","CONCISENESS","TONE",
]);
export const Severity = z.enum(["error","warning","style"]);
export const Level = z.enum(["L1","L2","L3"]);

export const SituationProfile = z.object({
  id: z.string(), userId: z.string(), name: z.string(),
  audience: z.enum(["boss","peer","junior","customer","public"]),
  channel: z.enum(["messenger","email","report","notice","minutes"]),
  lang: z.enum(["ko","en","mixed"]),
  honorific: z.enum(["hasipsio","haeyo","hae","gaejo"]),   // 하십시오체/해요체/해체/개조식
  formality: z.number().int().min(1).max(5),
  length: z.enum(["concise","normal","detailed"]),
  intent: z.enum(["report","request","apology","persuade","inform","thanks"]),
  tone: z.enum(["neutral","polite","firm","friendly","indirect"]),
  notes: z.string().max(500).optional(),
});

// LLM이 내는 것. 오프셋 없음. 앵커 인용만.
export const LlmEdit = z.object({
  id: z.string(),
  sentence_index: z.number().int(),
  original: z.string(),           // 원문 스팬을 그대로 인용
  context_before: z.string(),     // 앞 6~10자
  context_after: z.string(),
  replacement: z.string(),
  category: Category,
  severity: Severity,
  reason_ko: z.string(),          // 1~2문장, 근거 규정 있으면 명시
  rule_ref: z.string().optional(),
  confidence: z.number().min(0).max(1),
});
export const LlmRewrite = z.object({
  label: z.string(), text: z.string(), rationale: z.string(),
});
export const CorrectionOutput = z.object({
  corrected_text: z.string(),
  edits: z.array(LlmEdit),
  rewrites: z.array(LlmRewrite),            // L3만 채움, 최대 3
  reader_view: z.string().optional(),        // 수신자 관점 1~2문장
  preserved_facts_check: z.object({
    numbers: z.boolean(), dates: z.boolean(), commitments: z.boolean(),
  }),
});

// 서버가 앵커 해소 후 UI로 보내는 것
export const Suggestion = LlmEdit.extend({
  start: z.number().int(), end: z.number().int(),   // NFC 문자열의 UTF-16 오프셋
  resolveMethod: z.enum(["exact","context","fuzzy","diff"]),
});
```

구조화 출력 제약(클라우드): 스키마에 `minLength/pattern/min/max` 같은 제약은 API가 지원하지 않으므로 **zod에서는 선언하되 `zodOutputFormat`에 넘기는 스키마는 제약 없는 버전**을 쓰고, 검증은 서버에서 한다. 모든 object는 `additionalProperties:false`(zod 기본).

---

## 3. API 계약

### 3.1 `POST /api/correct` (SSE)
요청:
```json
{ "text": "…", "profileId": "boss-slack", "level": "L2",
  "provider": "cloud" | "local" | null, "clientRequestId": "uuid" }
```
제약: `text` 1~4,000자(NFC 기준). 초과 시 400.

SSE 이벤트(순서 보장):
| event | data | 시점 |
|---|---|---|
| `meta` | `{runId, provider, model, profileVersionId, maskedSpans:[{start,end,kind}]}` | 즉시 |
| `edit` | `Suggestion` | LLM edits 배열 항목이 완성될 때마다(부분 JSON 파싱) |
| `edit_dropped` | `{id, reason}` | 앵커 해소 실패 |
| `rewrite` | `LlmRewrite & {index}` | L3, 항목 완성 시 |
| `text` | `{corrected_text}` | 최종 |
| `usage` | `{inputTokens, cachedTokens, outputTokens, costUsd, latencyMs, ttfbMs}` | 최종 |
| `done` | `{}` | 종료 |
| `error` | `{code, message}` | 실패. `code ∈ provider_unavailable, refusal, schema_invalid, timeout` |

### 3.2 `POST /api/feedback`
```json
{ "suggestionId": "…", "action": "accept|reject|edit|prefer|mute",
  "finalText": "…(action=edit 또는 복사 시점 전체 최종본)",
  "chosenIndex": 0, "rejectedIndexes": [1,2] }
```
`mute`는 `{category, scope}`로 즉시 demoted 규칙을 만든다(Phase 1은 기록만, 프롬프트 반영은 Phase 2).

### 3.3 `POST /api/runs/{runId}/final`
복사 버튼 시점의 전체 최종본을 기록. `{finalText}` → `preference_pairs` 후보(Phase 2에서 소비).

### 3.4 CRUD
- `GET/POST/PUT/DELETE /api/profiles`
- `GET/POST/PUT/DELETE /api/rules` (Phase 1: 사용자 직접 작성, `created_by=user`)
- `GET/POST/DELETE /api/dictionary`

---

## 4. Provider 인터페이스 (`packages/core/providers`)

```ts
export interface CorrectionProvider {
  readonly id: "cloud" | "local";
  readonly model: string;
  correct(input: {
    system: SystemBlocks;          // [stable, profileSnapshot, dynamic]
    user: string;                  // 마스킹·NFC 처리된 초안 + 상황 요약
    level: Level;
    signal: AbortSignal;
  }): AsyncIterable<ProviderEvent>;  // {type:"delta", text} | {type:"final", raw, usage}
  health(): Promise<{ok: boolean; detail?: string}>;
}
```

### 4.1 cloud (Claude Sonnet 5)
- `@anthropic-ai/sdk`, `client.messages.stream({...})` + `output_config: { format: zodOutputFormat(CorrectionOutputLoose), effort: "low" }`, `thinking: { type: "adaptive" }`, `max_tokens: 8000`.
- `system`은 3블록. 앞 두 블록(고정 지침, 프로필 스냅샷)에 `cache_control: {type:"ephemeral"}`. Sonnet 5 캐시 최소 1,024토큰이므로 고정 지침 블록은 1,024토큰 이상이 되도록 카테고리 정의·예시를 포함한다.
- 스트림의 텍스트 델타를 `partial-json`으로 누적 파싱해 `edits[i]`가 완성될 때마다 앵커 해소 → `edit` 이벤트. 최종 메시지는 zod 검증.
- `stop_reason === "refusal"` 또는 `max_tokens`면 `error`. 429/5xx는 SDK 재시도 2회 후 `provider_unavailable`.
- 비용 계산: `usage.input_tokens×2 + cache_read×0.2 + cache_creation×2.5 + output×10` ($/MTok).

### 4.2 local (llama-server)
- 서버 기동 예: `llama-server -m gemma-4-26B-A4B-it-qat-q4_0.gguf -c 8192 --cache-reuse 256 --slot-save-path ./slots --swa-full --port 8080`.
- 호출: `POST /completion` `{prompt, json_schema, stream:true, cache_prompt:true, id_slot:0, temperature:0.2, n_predict:2000}`.
- 프롬프트는 Gemma chat 템플릿으로 직렬화하되 **고정 지침+프로필 스냅샷이 항상 동일 바이트로 앞에 오도록** 하여 `cache_reuse`가 prefix를 재사용하게 한다. 프로필 스냅샷이 바뀔 때 `POST /slots/0?action=save`로 저장, 서버 재시작 후 `restore`.
- `json_schema`는 zod → JSON Schema 변환본. 로컬은 `additionalProperties` 제약이 느슨해도 됨.
- `health()`는 `GET /health`. 실패 시 UI가 cloud로 폴백할지 묻는다(자동 폴백 금지: 데이터 외부 전송이 걸려 있으므로).
- **출력 토큰 최소화(M5 기본형 디코드 37 tok/s 대응)**: 로컬에서는 `corrected_text`를 모델이 내지 않고 서버가 edits 적용으로 합성한다(`omit_corrected_text` 프롬프트 변형). L3 rewrites는 1안. 목표 L2 300자 7초 이내.

### 4.3 선택 규칙
`provider` 미지정 시 설정값(`DEFAULT_PROVIDER`). L3는 로컬에서 rewrites를 1개로 제한(지연 20초 초과 방지).

---

## 5. 프롬프트 스펙 (`packages/core/prompt`)

### 5.1 레이아웃 (캐시 경계 포함)
```
[system#1 stable]  ← cache_control
  역할, 절대 규칙(의미·숫자·약속 보존, 과교정 금지, 없는 오류 만들지 않기),
  카테고리 10종 정의 + 각 2예시, 높임 단계 4종 정의, 출력 규칙(앵커 인용 규칙, reason_ko 형식),
  강도 L1/L2/L3 정의
[system#2 profile snapshot]  ← cache_control
  활성 스타일 규칙(status=pinned/active, confidence 내림차순 최대 20개), 버전 ID
[system#3 dynamic]
  상황 프로필(렌더링된 문장), 개인 사전(최대 100항목), 오늘 날짜 없음(캐시 무효화 방지)
[user]
  <level>L2</level>
  <draft sentences="5">…NFC 초안(마스킹됨)…</draft>
  요청: 위 초안을 프로필에 맞게 교정하라.
```

### 5.2 핵심 지침(발췌, 한국어로 작성)
- "원문 스팬은 **글자 하나도 바꾸지 말고 그대로 인용**한다. 공백·문장부호 포함."
- "같은 스팬이 여러 번 나오면 `context_before/after`로 구별되게 앞뒤를 넉넉히 인용한다."
- "L1에서는 SPACING/SPELLING/GRAMMAR/PUNCTUATION만. 의미·어투 변경 금지."
- "L2에서는 프로필의 높임 단계로 통일하고 HONORIFIC/REGISTER/CONCISENESS 추가. 문장 순서 유지."
- "L3에서만 rewrites를 채운다. 각 안은 label(더 정중/더 간결/더 친근 중 프로필에 맞는 3개)과 근거."
- "사물 존대, 이중 존대, 압존법(직장에서는 미적용)은 HONORIFIC으로 표시하고 reason_ko에 규범을 적는다."
- "확신이 0.6 미만이면 severity=style로 내린다."
- "마스킹 토큰 `⟦PII:n⟧`은 절대 수정·이동하지 않는다."

### 5.3 프롬프트 버전 관리
`PROMPT_VERSION` 상수(semver)를 `correction_runs.prompt_version`에 기록. 스키마 변경은 24시간 캐시되는 컴파일 비용이 있으므로 하루 1회 이하.

---

## 6. 앵커 해소 (`packages/core/anchor`)

### 6.1 정규화·분할
1. `text.normalize("NFC")`. 이후 모든 오프셋은 이 문자열의 UTF-16 코드 유닛 기준.
2. 문장 분할: `Intl.Segmenter("ko", {granularity:"sentence"})` + 개행 기준. 각 문장의 `[start,end)` 저장. `sentence_index`는 이 배열 인덱스.
3. 이모지·서로게이트가 있으면 `Intl.Segmenter(granularity:"grapheme")`로 경계 집합을 만들어, 최종 오프셋이 grapheme 경계에 놓이도록 보정.

### 6.2 해소 순서
```
resolve(edit):
  s = sentences[edit.sentence_index] (없으면 전체 범위)
  1 exact:   s 내 indexOf(original) 결과가 정확히 1개 → 채택
  2 context: 다중 일치 → context_before+original+context_after 전체 일치 우선,
             없으면 before 또는 after 한쪽 일치. 유일하면 채택
  3 fuzzy:   s 내 슬라이딩 윈도(길이 ±20%)에서 Levenshtein ≤ ceil(len×0.15) 최소값이 유일 → 채택
  4 diff:    diff-match-patch(원문, corrected_text) → 헝크 목록.
             카테고리·replacement 유사도(정규화 Levenshtein ≥ 0.7)로 미해소 edit과 정렬 → 채택
  5 drop:    edit_dropped 이벤트 + 로그(resolve_fail)
```
- 문장 범위에서 실패하면 전체 텍스트 범위로 1~3을 한 번 더 시도한다(모델이 sentence_index를 틀리는 경우).
- 해소된 edit끼리 범위가 겹치면 confidence 높은 것만 남긴다.
- 적용은 `start` 내림차순(뒤에서부터)으로 하여 오프셋 드리프트 없음.

### 6.3 필수 픽스처 (`anchor/__tests__/fixtures.ko.json`)
| 케이스 | 원문 | 기대 |
|---|---|---|
| 띄어쓰기 | `할수있다` → `할 수 있다` | exact |
| 조사 교체 | `자료을 보냅니다` → `자료를` | exact, 1글자 스팬 |
| 어미 | `보내드릴께요` → `보내드릴게요` | exact |
| 사물 존대 | `커피 나오셨습니다` → `나왔습니다` | exact, HONORIFIC |
| 중복 스팬 | `확인 부탁드립니다. … 확인 부탁드립니다.` 둘 중 두 번째만 | context |
| NFD 입력 | macOS에서 복사한 자모 분해 문자열 | normalize 후 exact |
| 이모지 | `완료했습니다 🙏🏻 확인부탁드려요` | grapheme 경계 유지 |
| 영문 혼용 | `해당 issue는 resolve 됐습니다` | exact, 영단어 스팬 |
| 오인용 | 모델이 `original`에 공백 하나 누락 | fuzzy |
| 문장 인덱스 오류 | `sentence_index` 틀림 | 전체 범위 재시도로 exact |
| 실패 | `original`이 원문에 없음 | diff 정렬 또는 drop |

---

## 7. PII 마스킹 (`packages/core/pii`)

| 종류 | 패턴 | 토큰 |
|---|---|---|
| 이메일 | RFC 근사 정규식 | `⟦PII:EMAIL:1⟧` |
| 전화 | `01[016789]-?\d{3,4}-?\d{4}`, `0\d{1,2}-\d{3,4}-\d{4}`, `+82…` | `⟦PII:PHONE:n⟧` |
| 카드 | 13~19자리 + Luhn 통과 | `⟦PII:CARD:n⟧` |
| 계좌 | `\d{2,6}-\d{2,6}-\d{2,8}` 형태(오탐 허용) | `⟦PII:ACCT:n⟧` |
| 주민·외국인등록 | `\d{6}-?[1-8]\d{6}` | `⟦PII:RRN:n⟧` |
| 개인 사전 항목 | 사용자가 `mask=true`로 표시한 고객사명 등 | `⟦PII:DICT:n⟧` |

- 마스킹은 NFC 정규화 **후**, 문장 분할 **전**에 수행. 토큰 길이 차이로 오프셋이 달라지므로 `maskedSpans`를 응답 `meta`에 포함하고, 앵커 해소는 마스킹된 문자열 기준으로 한 뒤 `unmask`가 오프셋을 원문 기준으로 되돌린다.
- 로컬 provider에서도 동일 적용(로그에 원문이 남지 않게).
- **정책(확정)**: 감지된 PII는 종류를 가리지 않고 **전부 마스킹해서 전송하고, 응답을 받은 뒤 토큰을 원문으로 복원**한다. 차단은 기본 없음. `PII_BLOCK` 설정에 종류를 넣으면 그 종류만 400 `pii_blocked`로 거부(기본값 빈 값).
- 복원 실패 대비: 모델이 토큰을 변형하면(`⟦PII:PHONE:1⟧` → `⟦PII:PHONE:1 ⟧` 등) 퍼지 매칭으로 복원하고, 그래도 못 찾으면 해당 edit을 폐기하고 `edit_dropped(reason=pii_token_lost)`로 알린다. 원문 토큰 개수와 복원 개수가 다르면 결과에 경고 배지.
- 마스킹 토큰은 LLM이 문법 판단을 할 수 있게 종류별로 자연어 대체어를 쓰는 옵션을 둔다(예: 전화 → `010-0000-0000`, 이메일 → `user@example.com`, 고객사 → `A사`). 조사 결합(을/를, 이/가) 판단에 유리. 기본은 자연어 대체어.

---

## 8. DB 스키마 (`packages/db`, Drizzle)

Phase 1은 SQLite(`better-sqlite3`), Phase 2에서 Postgres+pgvector. Drizzle 스키마는 두 방언 공용으로 작성(`vector` 컬럼만 Phase 2에 추가).

```
users(id pk, email unique, created_at)
situation_profiles(id pk, user_id fk, name, audience, channel, lang, honorific,
  formality int, length, intent, tone, notes, is_default bool, created_at, updated_at)
style_rules(id pk, user_id fk, text, scope json, alpha real default 1, beta real default 1,
  confidence real, status enum(active,pinned,demoted), evidence_ids json, created_by enum(user,distill),
  created_at, updated_at)
profile_versions(id pk, user_id fk, snapshot json, hash text, activated_at)
personal_dictionary(id pk, user_id fk, term, note, mask bool default false)
drafts(id pk, user_id fk, profile_id fk, text_nfc, text_masked, mask_map json, lang, created_at)
correction_runs(id pk, draft_id fk, level, provider, model, prompt_version, profile_version_id fk,
  input_tokens int, cached_tokens int, cache_write_tokens int, output_tokens int,
  cost_usd real, ttfb_ms int, latency_ms int, status enum(ok,error), error_code, created_at)
suggestions(id pk, run_id fk, kind enum(edit,rewrite), start int, end int, original, replacement,
  category, severity, reason, rule_ref, confidence real, alt_index int, resolve_method, dropped bool)
feedback_events(id pk, suggestion_id fk, run_id fk, action enum(accept,reject,edit,prefer,mute),
  final_text, chosen_index int, rejected_indexes json, created_at)
run_finals(run_id pk fk, final_text, copied_at)
```
인덱스: `suggestions(run_id)`, `feedback_events(run_id)`, `correction_runs(created_at)`, `style_rules(user_id,status)`.

---

## 9. UI 스펙 (`apps/web`)

### 9.1 에디터 페이지 `/`
- 상단 바: 프로필 셀렉트(기본 프로필 기억), 강도 세그먼트(L1/L2/L3), provider 배지(cloud/local, 클릭 시 전환), 교정 버튼(`⌘/Ctrl+Enter`).
- 좌: `textarea`(자동 높이, 글자수/문장수 표시, 4,000자 제한).
- 우 상단: 결과 뷰. 두 모드 토글 "변경 보기"(원문 위에 삭제선+삽입 하이라이트) / "결과 보기"(교정문, 직접 편집 가능 contenteditable).
- 우 중단: 변경 카드 리스트. 카드 = 카테고리 배지 · `original → replacement` · reason · rule_ref 링크 · `[수락][무시][이런 제안 끄기]`. 카드 hover ↔ 하이라이트 동기화. 키보드 `j/k` 이동, `a` 수락, `x` 무시.
- 우 하단(L3): 리라이트 탭 A/B/C, 각각 `[이걸로 교체]`. `reader_view` 한 줄 안내.
- 하단: `[모두 수락]` `[최종본 복사]`. 복사 시 `/api/runs/{id}/final` 호출 + 토스트 "복사됨 · 변경 3건 수락 · 1건 무시".
- 스트리밍 중: 카드가 도착하는 대로 추가, 스켈레톤 표시, 취소 버튼(AbortController).
- 에러: provider 불가 시 배너 "로컬 서버에 연결할 수 없습니다. 클라우드로 보낼까요? (원문이 외부로 전송됩니다)" → 명시 동의 후 재시도.

### 9.2 프로필 페이지 `/profiles`
- 카드 그리드, 기본 6종 시드. 편집 폼은 2장 도메인 타입의 각 축을 셀렉트로. "미리보기 문장" 영역에 프로필 요약 문장 렌더링(프롬프트에 들어가는 그대로).

### 9.3 내 어투 페이지 `/style`
- 규칙 리스트(텍스트, scope 배지, 상태). Phase 1은 수동 추가/수정/삭제/고정만. 신뢰도 막대는 자리만 잡음.
- 부트스트랩 영역: "내가 쓴 글 붙여넣기(300자 이상)" → Phase 2에서 활성화, Phase 1은 저장만.

### 9.4 사전 페이지 `/dictionary`
- 용어, 메모, "외부 전송 시 마스킹" 체크.

### 9.5 상태 관리
- 서버 상태: TanStack Query. 스트림은 `fetch` + `ReadableStream` 파서(EventSource는 POST 불가).
- 로컬 상태: 현재 run, suggestions Map, 카드별 상태(pending/accepted/rejected), 결과 텍스트.

---

## 10. 학습 루프 v0 (Phase 1 범위)

Phase 1은 **신호를 빠짐없이 기록**하는 것까지. 반영은 사용자가 `/style`에 수동으로 쓴 규칙만.
- accept/reject → `feedback_events`.
- 결과 뷰 직접 편집 후 복사 → `run_finals.final_text`. 서버가 제안 적용본과 최종본의 diff를 계산해 `feedback_events(action=edit)`를 자동 생성.
- L3 선택 → `prefer(chosen, rejected)`.
- "이런 제안 끄기" → `style_rules(status=demoted, scope={category, channel, audience})` 생성. Phase 1에서도 **프롬프트 dynamic 블록에 "다음 카테고리는 제안하지 말 것"으로 반영**(간단하므로 포함).

---

## 11. 텔레메트리

- 모든 run에 토큰·캐시·비용·TTFB·총 지연 기록. `cachedTokens == 0`이 연속 5회면 서버 로그 경고(캐시 무효화 탐지).
- 간단 페이지 `/runs`: 최근 50건 표(시각, 프로필, 강도, provider, 지연, 비용, 수락/무시 수). 대시보드는 Phase 2.
- 주간 합계를 콘솔 스크립트로 출력(`pnpm report:week`)해 `02-feasibility.md`의 추정치와 대조.

---

## 12. 보안·설정

`.env`:
```
ANTHROPIC_API_KEY=            # cloud provider
DEFAULT_PROVIDER=cloud        # cloud | local
LOCAL_LLM_URL=http://127.0.0.1:8080
LOCAL_LLM_MODEL=gemma-4-26B-A4B-it-qat-q4_0
ALLOWED_EMAIL=                # 단일 사용자 화이트리스트
PII_BLOCK=                    # 감지 시 요청 거부할 종류(쉼표 구분). 기본 없음: 전부 마스킹 후 복원
DATABASE_URL=file:./data/grammer.db
```
- API 키는 서버 전용. 클라이언트 번들에 절대 포함하지 않음(Next.js `server-only`).
- 원문 저장: **확정 `STORE_DRAFTS=true`**, 로컬 SQLite. false면 해시만 저장.
- 인증: Auth.js 이메일 매직링크 또는 개발 중에는 `BASIC_AUTH` 대체.

---

## 13. 테스트·품질

| 계층 | 도구 | 내용 |
|---|---|---|
| core 단위 | Vitest | 앵커 해소 픽스처 11종, PII 마스킹/복원 왕복, 프롬프트 스냅샷(캐시 prefix 바이트 동일성) |
| provider 계약 | Vitest + 녹화 응답 | cloud/local 모두 같은 `ProviderEvent` 시퀀스를 내는지. 실제 호출은 `RUN_LIVE=1`일 때만 |
| API | Vitest + supertest 유사 | SSE 이벤트 순서, 400 조건, PII 차단 |
| E2E | Playwright | 붙여넣기 → 교정 → 카드 수락 → 복사 → feedback 기록 확인 |
| 골든셋 | `eval/golden.ko.jsonl` 30건 | 내 실제 메시지(마스킹) + 기대 교정. 프롬프트 변경 시 회귀 비교(수락률 대용) |

CI(GitHub Actions): lint, typecheck, core/api 테스트. E2E와 라이브 호출은 수동.

---

## 14. 작업 분해 (WBS)

| # | 작업 | 산출물 | 예상 |
|---|---|---|---|
| 1 | 모노레포 스캐폴딩(pnpm, TS, ESLint, Vitest, Next.js, shadcn) | 빌드 통과 | 0.5일 |
| 2 | `core/schema` 타입 + JSON Schema 변환 | zod 스키마, 테스트 | 0.5일 |
| 3 | `core/anchor` 정규화·분할·해소·적용 + 픽스처 11종 | 테스트 green | 2일 |
| 4 | `core/pii` 마스킹·복원 + 오프셋 매핑 | 테스트 green | 1일 |
| 5 | `core/prompt` 빌더, 카테고리 정의, 프로필 렌더러, 스냅샷 테스트 | 프롬프트 v0.1 | 1.5일 |
| 6 | `providers/cloud` 스트리밍 + 부분 JSON + 비용 계산 | 라이브 1회 성공 | 1일 |
| 7 | `providers/local` llama-server 클라이언트 + slot 캐시 | 로컬 1회 성공 | 1일 |
| 8 | `db` 스키마·마이그레이션·리포지토리 | SQLite 동작 | 1일 |
| 9 | `/api/correct` SSE 라우트 + 로깅 | curl로 이벤트 확인 | 1일 |
| 10 | 피드백·final·CRUD 라우트 | | 1일 |
| 11 | 에디터 UI(스트리밍 카드, 하이라이트, 수락/무시, 복사) | 사용 가능 | 3일 |
| 12 | 프로필·어투·사전 페이지 + 시드 6종 | | 1.5일 |
| 13 | `/runs` 표 + 주간 리포트 스크립트 | | 0.5일 |
| 14 | 골든셋 30건 작성 + cloud/local 비교 실행 | 비교표 | 1일 |
| 15 | E2E 1본, README 실행 가이드 | | 0.5일 |
| | **합계** | | **약 17일(3.5주)** |

순서: 1→2→3,4 병렬→5→6→8→9→10→11→12→13→7(local)→14→15. cloud로 UI까지 완성한 뒤 local을 붙인다.

---

## 15. 확정된 결정 (2026-09-16)

| 항목 | 결정 |
|---|---|
| Mac 칩 | **M5 기본형 32GB.** 로컬은 Gemma 4 26B-A4B, 출력 토큰 최소화 설계. dense 30B급 제외 |
| 메신저·OS | **슬랙 · macOS.** 프로필 시드는 슬랙 관례, Phase 2 단축키는 Raycast 확장 우선 |
| 첫 provider | **cloud(Sonnet 5) 먼저.** UI·앵커 해소 검증 후 local 연결(WBS 7은 11 이후로 이동) |
| 원문 저장 | **로컬 SQLite에 저장** |
| PII | **전부 마스킹 → 전송 → 복원.** 차단 기본 없음(`PII_BLOCK` 빈 값). 대체어는 자연어형 |

남은 미확정: 없음. 골든셋 30건은 사용자의 실제 메시지가 필요하므로 WBS 14 시점에 요청.
