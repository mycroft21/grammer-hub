# 프롬프트 스튜디오 설계안 (v0.2, 2026-09-18)

> 목적: 교정 기능에서 정립한 프롬프트 구조를 뽑아, **어떤 소스나 개인 데이터도 조회하지 않고** 개발 생애주기(조사→계획→개발→검토)의 각 단계에 맞는 프롬프트를 만들어 주는 중립 기능을 추가한다. 개발 전후에 단순해지기 쉬운 프롬프트를 규격화해 **결과의 최소 품질을 보장**하는 것이 목표다.
> 상태: **1차 구현 완료** (`/prompts`). 아래 §11에 확정 사항과 구현 위치를 적었다. §1~§10은 설계 당시 내용이며 결정 항목(§10)은 §11에서 답한다.

---

## 0. 한 줄 요약

**LLM이 프롬프트 "본문"을 쓰게 하지 않는다. LLM은 정해진 슬롯(PromptSpec)을 채우고, 코드가 그것을 대상 모델·용도에 맞는 텍스트로 조립한다.** 교정 파이프라인에서 LLM이 오프셋이 아닌 앵커를 내고 코드가 위치를 복원하는 것과 같은 원칙이다. 이렇게 해야 구조가 매번 일정하고, 블록 단위로 설명·수정·재생성이 가능하며, 나중에 "이 사용자는 어떤 구조를 선호하는가"를 학습할 수 있다.

---

## 1. 지금 구조에서 뽑아낼 것

교정 프롬프트(`packages/core/src/prompt`)는 이미 아래 7개 층으로 되어 있다. 이것이 범용 PromptSpec의 원형이다.

| 교정 프롬프트의 층 | 하는 일 | 범용 슬롯 이름 |
|---|---|---|
| system#1 고정 지침 | 역할, 절대 규칙, 용어 정의, 출력 규칙 | `role` · `hard_rules` · `definitions` · `output_contract` |
| system#2 규칙 스냅샷 | 지속되는 선호(스타일 규칙) | `persistent_preferences` (스튜디오에서는 **기본 비움**, 중립) |
| system#3 동적 블록 | 이번 상황(프로필, 사전, 끈 카테고리) | `context` |
| user: `<level>` | 강도·모드 선택 | `mode` |
| user: `<draft>` 구분자 | 입력을 지침과 분리 | `input_delimiting` |
| 출력 JSON 스키마 | 형식 강제 + 자기 점검(`preserved_facts_check`) | `output_schema` · `self_check` |
| 앵커 규칙 | 모델이 틀리기 쉬운 지점에 대한 방어 지침 | `failure_guards` |

여기에 교정에는 없었지만 범용 프롬프트에 필요한 세 슬롯을 더한다.

| 추가 슬롯 | 이유 |
|---|---|
| `success_criteria` | 교정은 "틀린 곳 고치기"로 목표가 자명했지만, 개발·조사 프롬프트는 "무엇이 잘된 결과인가"를 써 줘야 한다 |
| `process` | 조사·분석은 단계(수집→비교→결론)를 지정할 때 품질이 오른다. 교정은 단일 패스라 불필요했다 |
| `clarify_policy` | 입력이 부족할 때 물어볼지, 가정을 명시하고 진행할지. 교정은 항상 진행이었다 |

---

## 2. 데이터 모델: PromptSpec

```ts
PromptSpec = {
  meta: { purpose: "dev" | "research" | "analysis" | "planning" | "writing" | "decision" | "other",
          title: string, target: "claude" | "chatgpt" | "generic", language: "ko" | "en" },
  role: string,                      // 1~2문장. 직함이 아니라 관점과 기준
  goal: string,                      // 이 프롬프트가 끝났을 때 손에 쥐는 것
  success_criteria: string[],        // 3~6개, 검증 가능한 문장
  inputs: { name: string; description: string; required: boolean; placeholder: string }[],
  context: string | null,            // 배경·제약 조건 중 "사실"에 해당하는 것
  hard_rules: string[],              // 절대 규칙 (하지 말 것 포함)
  process: string[] | null,          // 단계. 단일 패스면 null
  output_contract: { format: "markdown" | "json" | "table" | "code" | "prose"; structure: string; length: string },
  self_check: string[],              // 답하기 전에 스스로 확인할 항목
  failure_guards: string[],          // 이 목적에서 모델이 흔히 틀리는 지점 (환각, 범위 이탈, 추정을 사실처럼 말하기…)
  clarify_policy: "ask_first" | "assume_and_state" | "never_ask",
  examples: { input: string; output: string }[] | null,   // 있을 때만
  rationale: Record<string, string>  // 슬롯별 "왜 이렇게 썼는지" 1문장 (UI 카드 설명용)
}
```

- 슬롯마다 **길이 상한**을 두고 서버에서 검증한다(교정의 `CorrectionOutputStrict`와 같은 역할).
- `rationale`은 사용자 학습용이다. 교정 카드의 `reason_ko`와 같은 자리.

---

## 3. 파이프라인

```
사용자 입력(목적, 한 줄 목표, 옵션) ─▶ [1] 의도 정리 ─▶ [2] PromptSpec 생성 ─▶ [3] 렌더 ─▶ [4] 자기 점검 표시
```

### [1] 의도 정리 (LLM, 짧게)
목표 문장에서 빠진 것을 찾는다. 결과는 두 갈래.
- 필수 정보가 없으면 **선택형 질문 최대 3개**(자유 입력 아님, 버튼). 예: "코드 리뷰 프롬프트"라면 언어/리뷰 범위/엄격도.
- 채울 만하면 **가정을 명시하고 진행**. 가정은 결과 화면 상단에 "이렇게 가정했습니다"로 보이고, 하나씩 고치면 재생성.
- 어느 쪽이든 **사용자 데이터는 읽지 않는다.** 프로필·규칙·사전·기록 어느 것도 프롬프트에 넣지 않는다. 이것이 "중립"의 정의다.

### [2] PromptSpec 생성 (LLM, 구조화 출력)
- 모델: `claude-sonnet-5`, adaptive thinking, effort **medium**(교정의 low보다 한 단계 위. 프롬프트 작성은 계획이 필요한 작업).
- `output_config.format = json_schema(PromptSpec)` — 교정과 같은 `toOutputJsonSchema` 헬퍼 재사용.
- 시스템 프롬프트(메타 프롬프트)는 고정 블록 하나 + 목적별 블록 하나. 고정 블록은 캐시.
  - 고정 블록: "좋은 프롬프트의 조건"을 규칙으로. 목표는 결과물로 쓴다, 성공 기준은 검증 가능하게, 입력은 구분자로 감싼다, 절대 규칙은 5개 이하, 모델이 흔히 틀리는 지점을 방어한다, 역할은 직함이 아니라 판단 기준이다, 예시는 도움이 될 때만.
  - 목적별 블록(6종, 코드에 상수로): 개발(재현 절차·범위·테스트 기준·변경 최소화), 조사(출처 구분·확신도 표기·반대 근거·최신성), 분석(가정 명시·수치 단위·민감도), 기획(대안 3개·트레이드오프·결정 기준), 글쓰기(독자·톤·길이·구조), 의사결정(선택지·기준 가중치·되돌릴 수 있는가).

### [3] 렌더 (코드, 결정적)
PromptSpec → 텍스트. 대상별 템플릿 3종.
- **Claude**: `system`(role, hard_rules, output_contract, failure_guards) + `user`(goal, context, inputs를 XML 태그로 구분, process, self_check). 구조화 출력이 필요한 경우 JSON 스키마 블록을 별도로 내준다.
- **ChatGPT/일반**: 한 메시지. 제목 → 역할 → 목표 → 입력(구분자) → 규칙 → 출력 형식 → 점검 순.
- **문서용 Markdown**: 팀에 공유하는 프롬프트 가이드 형태. 각 블록에 `rationale`을 각주로.

렌더가 코드이므로 **같은 Spec은 항상 같은 텍스트**가 나오고, 블록 하나만 바꿔 재렌더할 수 있다.

### [4] 자기 점검 표시
Spec에서 계산되는 체크리스트를 결과 옆에 보여준다(교정의 `preserved_facts_check`처럼).
- 목표가 결과물로 쓰였는가 · 성공 기준이 3개 이상이고 검증 가능한가 · 입력이 구분자로 감싸였는가 · 절대 규칙이 5개 이하인가 · 출력 형식이 지정됐는가 · 모호할 때의 행동이 지정됐는가 · 예시가 있다면 입력·출력이 짝을 이루는가.
- 하나라도 실패하면 해당 블록 카드에 경고. LLM 판단이 아니라 **코드 규칙**이라 일관된다.

---

## 4. UI

사이드바에 "프롬프트" 추가. 에디터와 같은 2패널 문법을 쓴다.

```
┌ 왼쪽: 만들기 ───────────────┬ 오른쪽: 결과 ─────────────────────────────┐
│ 목적 [개발 | 조사 | 분석 |   │ [Claude ▾] [표준 ▾]          [복사] [보관]  │
│       기획 | 글쓰기 | 결정]  │ ┌ 이렇게 가정했습니다 ─────────────────┐  │
│ 한 줄 목표 ________________ │ │ · 언어: TypeScript  · 범위: 변경분만   │  │
│ 대상 모델 (Claude/ChatGPT)  │ └─────────────────────────────────────┘  │
│ 출력 형식 (자동/마크다운/…)  │ ▸ 역할        "…"              ✎ ↻ ⓘ    │
│ 길이 (짧게/표준/상세)        │ ▸ 목표        "…"              ✎ ↻ ⓘ    │
│ 모호할 때 (물어보기/가정)    │ ▸ 성공 기준   3개              ✎ ↻ ⓘ    │
│ □ 내 어투 규칙 포함(기본 꺼짐)│ ▸ 입력        {{code}} {{diff}}         │
│                             │ ▸ 절대 규칙   4개                        │
│ [프롬프트 만들기 ⌘↵]        │ ▸ 출력 형식   markdown, 표 1개          │
│                             │ ▸ 자기 점검   5개                        │
│                             │ ▸ 방어 지침   3개                        │
│                             │ ─ 점검 7/7 통과 ─────────────────────── │
│                             │ 렌더된 프롬프트 (읽기 전용, 접기 가능)    │
└─────────────────────────────┴───────────────────────────────────────────┘
```

- **블록 카드**는 교정의 변경 카드와 같은 부품이다. ✎ 직접 수정, ↻ 이 블록만 재생성(다른 블록은 고정), ⓘ 왜 이렇게 썼는지(`rationale`).
- **길이**는 교정의 L1/L2/L3와 같은 세그먼트. 짧게(역할·목표·출력만) / 표준 / 상세(과정·예시·방어 지침 포함).
- **입력 변수** `{{…}}`는 보관함에서 꺼내 쓸 때 폼으로 채워 넣는다. 프롬프트를 템플릿으로 재사용하는 핵심.
- **"내 어투 규칙 포함"** 토글은 기본 꺼짐. 켜면 글쓰기 목적에 한해 스타일 규칙 스냅샷을 `persistent_preferences`에 넣는다. 기본이 꺼져 있으므로 중립성이 유지된다.
- **보관함**: 저장한 프롬프트 목록(목적 태그, 대상, 마지막 사용), 버전(수정할 때마다), 복제, 내보내기(Markdown/JSON).

---

## 5. 학습 신호 (선택, 교정과 같은 방식)

중립 기능이지만 "이 사용자는 어떤 **구조**를 선호하는가"는 내용과 무관하게 배울 수 있다.

| 신호 | 언제 | 배우는 것 |
|---|---|---|
| 블록 직접 수정 | ✎ 후 저장 | 어떤 슬롯을 자주 고치는가(예: 항상 규칙을 줄임) |
| 블록 재생성 | ↻ | 어떤 슬롯의 첫 생성이 약한가 |
| 길이 선택 | 세그먼트 | 기본 길이 |
| 복사 전 수정 | 렌더 결과를 손으로 고침 | 렌더 템플릿 자체의 개선점 |

Phase 2 증류와 같은 방식으로 "프롬프트 구조 선호 규칙"을 뽑되, **내용(도메인 지식)은 학습하지 않는다.** 예: "성공 기준은 3개면 충분하다", "방어 지침은 짧게" 같은 구조 규칙만.

---

## 6. API · 스키마 · 저장

| 항목 | 설계 |
|---|---|
| `POST /api/prompts/plan` | 입력: 목적·목표·옵션 → 출력: 질문 목록 또는 가정 목록 (LLM 1회, Haiku 4.5 가능) |
| `POST /api/prompts/generate` | 입력: 위 + 답변/가정 → SSE로 PromptSpec 블록 단위 스트리밍(교정의 `edit` 이벤트처럼 슬롯이 닫힐 때마다) |
| `POST /api/prompts/regenerate-block` | 입력: Spec + 블록 이름 → 그 블록만. 나머지는 프롬프트에 "고정된 값"으로 넣어 일관성 유지 |
| `GET/POST/PUT /api/prompts` | 보관함 CRUD, 버전 |
| 테이블 | `prompts(id,user_id,title,purpose,target,spec json,rendered text,version,created_at)` · `prompt_versions` · `prompt_events(block, action)` |
| 코어 위치 | `packages/core/src/promptstudio/` — `spec.ts`(zod) · `meta-prompt.ts`(고정+목적별 블록) · `render/{claude,generic,markdown}.ts` · `checks.ts` |

교정과 공유하는 것: `toOutputJsonSchema`, `PartialCorrectionParser`(이름만 일반화), provider 인터페이스(cloud/local/fake), PII 마스킹(목표 문장에 고객명이 들어올 수 있으므로 통과시킨다), 캐시 배치 원칙.

---

## 7. 비용·지연

| 단계 | 토큰(추정) | Sonnet 5 비용 |
|---|---|---|
| 의도 정리 | 입력 800 · 출력 150 | ≈ ₩4 (Haiku면 ₩1) |
| Spec 생성 | 입력 1,800(고정 1,200 캐시) · 출력 700~1,200 | ≈ ₩12~20 |
| 블록 재생성 | 입력 1,500 · 출력 150 | ≈ ₩5 |

교정 1회(₩20~40)보다 싸다. 개인용 월 비용에 의미 있는 변화 없음.

---

## 8. 왜 이 방식인가 (대안과 비교)

| 대안 | 문제 |
|---|---|
| LLM에게 "좋은 프롬프트 써 줘"라고 시켜 텍스트를 받는다 | 매번 구조가 다르고, 블록 수정·재생성이 안 되며, 무엇이 빠졌는지 코드로 검사할 수 없다 |
| 목적별 고정 템플릿에 빈칸만 채운다(LLM 없음) | 목표 문장에서 성공 기준·방어 지침을 끌어내는 판단이 빠져 "양식"에 그친다 |
| **Spec 생성 + 코드 렌더 (제안)** | LLM은 판단(무엇을 넣을지), 코드는 형식(어떻게 배치할지). 교정에서 검증된 분업 |

---

## 9. 공수와 순서

| 단계 | 내용 | 공수 |
|---|---|---|
| 1 | `promptstudio` 코어: Spec 스키마, 메타 프롬프트(고정+6목적), 렌더 3종, 체크 7개, 단위 테스트(렌더 스냅샷·체크 규칙) | 1.5일 |
| 2 | API 3개 + 보관함 테이블·CRUD | 1일 |
| 3 | UI: 만들기 폼, 블록 카드, 가정 배너, 점검 표시, 보관함 | 2일 |
| 4 | fake provider 확장(결정적 Spec) + E2E | 0.5일 |
| | 합계 | **약 5일** |

의도 정리의 "선택형 질문"은 1차에서 빼고 "가정 명시 후 진행"만으로 시작해도 된다. 그러면 4일.

---

## 10. 결정이 필요한 것

1. **목적 6종**이 맞는가. 실제로 자주 쓰실 목적이 개발·조사 중심이면 둘을 먼저 깊게 만들고 나머지는 일반 블록으로 시작하는 게 낫다.
2. **대상 모델 렌더**를 Claude·ChatGPT 둘 다 처음부터 할지, Claude만 먼저 할지.
3. **선택형 질문 단계**를 1차에 넣을지(공수 +1일).
4. **보관함의 변수 채우기 폼**을 1차에 넣을지. 템플릿 재사용이 핵심이면 넣어야 한다.


---

## 11. 확정과 구현 (v0.2)

### 11-1. 결정 (§10에 대한 답)

| 항목 | 결정 |
|---|---|
| 분류 축 | **대분류 6종(범용) › 중분류 › 세부 유형.** 대분류 = 개발·리서치·분석·기획·글쓰기·의사결정. **개발의 중분류는 생애주기** 조사(investigate) → 계획(plan) → 구현(build) → 검토(review)이며 출력이 다음 단계의 입력(handoff)이 된다. 다른 대분류는 중분류 2~3개. 중분류마다 세부 유형, 반드시 물을 것, 성공 기준·방어 지침 씨앗, 기본 과정, 넘길 것을 코드로 둔다. (v0.2 초안은 생애주기만 상위 축이었으나 범용성을 위해 합침) |
| 대상 모델 렌더 | Claude만. |
| 질문 단계 | 1차 포함. 의도 정리(plan)가 `ready`면 가정을 명시하고 바로 생성, `ask`면 선택형 질문 최대 3개. "가정으로 진행" 버튼으로 답 없이도 생성 가능. |
| 보관함 변수 채우기 | 1차 포함. `{{name}}`을 폼으로 채워 복사하며 `fill` 이벤트를 남긴다. |
| 프롬프트 언어 | **한국어 / 영어 지시문** 선택. 영어일 때도 답변은 사용자 언어(한국어)로 하라는 규칙을 렌더가 항상 삽입한다. UI용 텍스트(제목·변수 라벨·rationale·질문)는 언제나 한국어. |
| 어투 규칙 | 기본 꺼짐(중립). 글쓰기 목적에서 사용자가 켤 때만 `내 어투` 규칙 스냅샷을 넣는다. |
| 실행 환경 (v0.4) | `claude_code`(저장소 직접 탐색) / `chat`(자료 붙여넣기). **개발 대분류 기본 = claude_code, 길이 기본 = short.** claude_code면 `{{변수}}` 대신 `starting_points`(URL·경로·메서드·키워드)를 주고 "저장소를 직접 읽어라"로 렌더한다. 첫 실사용에서 1,500자짜리 붙여넣기형 프롬프트가 나온 것을 보고 바꿈. |
| Jira 티켓 입력 (v0.4) | `POST /api/prompts/ticket`: Jira REST v3로 이슈를 가져와(`packages/core/src/promptstudio/ticket.ts`: ADF→텍스트, 정규화, 축약) LLM 1회로 `TicketPlanResult`(purpose/subtype/goal/starting_points/context/missing_inputs/questions)를 만들고, 검토 화면에서 사용자가 고친 뒤 기존 generate에 `ticket`(키)과 `hints`(확정 시작점·맥락)를 실어 보낸다. 서버가 티켓을 다시 가져와 `<ticket>` 블록(데이터, PII 마스킹)으로 넣는다. 보관함에 `ticket_key`. 첨부는 이름만. |
| 중복·어휘 (v0.4) | 한 아이디어는 한 슬롯에만(점검 `no_duplicates`), 설계 용어(결정 질문·심볼·handoff) 본문 사용 금지, '대신 Y'는 금지문에만. short는 코드가 개수 상한을 강제한다. |

### 11-2. 분류 (taxonomy.ts)

| 대분류 | 중분류 | 세부 유형 |
|---|---|---|
| **개발** (생애주기) | 조사 → 계획 → 구현 → 검토 | 조사: 소스 확인·로직 조사·구조 확인·구체화·비교 / 계획: 스펙·요구사항·설계·작업 분해 / 구현: 기능·버그 수정·리팩터링·테스트 / 검토: 코드 리뷰·검증·문서 |
| 리서치 | 자료 조사 · 비교·선정 · 사실 확인 | 개요 파악·심층 조사 / 선택지 비교 / 주장 검증 |
| 분석 | 데이터·수치 · 원인·문제 · 영향·리스크 | 지표 해석·계산·추정 / 근본 원인 / 리스크 평가 |
| 기획 | 제안·기획서 · 대안 설계 · 로드맵·일정 | 기획서 / 대안 비교 / 로드맵 |
| 글쓰기 | 업무 문서 · 설명·안내 · 요약·변환 | 보고·메일·회의록 / 가이드 / 요약·다듬기 |
| 의사결정 | 선택지 결정 · 결정 검토 | 기준 매트릭스 / 프리모템 |

개발 중분류에는 `next`(다음 단계)가 있어 "이 결과물은 다음 단계 X의 입력"이라고 메타 프롬프트가 말한다. 다른 대분류는 "받는 사람이 바로 쓸 수 있어야 한다"로 handoff를 요구한다. 씨앗은 LLM이 목표에 맞게 구체화할 뿐 빠뜨릴 수 없다 — 이것이 "최소 품질 보장"의 실체다. **분류와 씨앗 문구의 근거 등급은 [근거 자료](10-prompt-engineering-references.md) §4 참고(대부분 우리 판단·초안).**

### 11-3. 영어 지시문 옵션

- 요청 `promptLanguage: "ko" | "en"` → `StudioContext.language` → 메타 프롬프트 `<language>` 태그. 프롬프트 본문 슬롯(role, goal, success_criteria, inputs.description, context, hard_rules, process, output_contract, self_check, failure_guards, examples)만 그 언어로 쓴다.
- `PromptSpec.language`는 LLM 출력값과 무관하게 코드가 요청값으로 덮어쓴다.
- `renderClaude`는 언어별 제목·고정 문구 표를 쓰고, `en`일 때 출력 형식에 `Language: respond in Korean (the user's language) …` 한 줄을 항상 넣는다. 메타 프롬프트에는 "이 규칙은 프로그램이 넣으니 중복해 쓰지 말라"고 명시.
- 점검(`checks.ts`)의 결과물 명사·모호어 정규식은 한/영 모두 본다.

### 11-4. 구현 위치

| 층 | 경로 |
|---|---|
| 코어 | `packages/core/src/promptstudio/` — `spec.ts`(PromptSpec·PlanResult·StudioRequest), `taxonomy.ts`, `meta-prompt.ts`(고정 블록 캐시 + 단계 블록), `render/claude.ts`, `checks.ts`(9개), `partial.ts`(슬롯 스트리밍), `pipeline.ts`(plan/generate/regenerate, PII 마스킹) |
| 테스트 | `packages/core/src/promptstudio/__tests__/studio.test.ts` (분류 무결성, 렌더 ko/en, 점검, 파서, fake provider 파이프라인, PII 왕복) |
| DB | `prompts`, `prompt_versions`(스펙·렌더·점검 스냅샷, 생성/재생성/직접 수정 출처), `prompt_events`(view/copy/fill/regenerate/edit/archive) — 마이그레이션 `0002` |
| API | `POST /api/prompts/plan` · `POST /api/prompts/generate`(SSE: meta/slot/spec/rendered/checks/usage/done) · `POST /api/prompts/regenerate` · `GET/POST /api/prompts` · `GET/PATCH/DELETE /api/prompts/[id]` · `POST /api/prompts/[id]/versions` · `POST /api/prompts/events` |
| UI | `/prompts` — `components/studio/{CreateForm,AskStep,SlotCard,ResultPanel,LibraryPanel,useStudio}` |
| fake provider | `FAKE_PROVIDER=1`이면 스키마 모양으로 스튜디오 요청을 판별해 결정적 plan/spec을 돌려준다(E2E·키 없는 데모) |
| E2E | `apps/web/e2e/smoke.mjs` 뒤쪽 7개 항목: 질문 → 답변 생성 → 13 블록 → 보관 → 보관함 변수 채워 복사 → 영어 지시문 렌더 확인 |

### 11-5. 근거

슬롯·원칙·배치가 어디서 왔는지, 무엇이 공식 문서 근거이고 무엇이 우리 판단인지는 [docs/10-prompt-engineering-references.md](10-prompt-engineering-references.md)에 항목별로 적었다. 거기서 드러난 고칠 점(부정 표현 규칙, 예시 기본값, 영어 지시문 A/B)은 §5에 있다.

### 11-6. 남은 것

- 보관함 사용 신호(`prompt_events`)를 기록 페이지 그래프에 합치기(어떤 단계 프롬프트가 실제로 쓰이는지, 자주 고치는 슬롯).
- ChatGPT/일반 텍스트 렌더(원하면 `render/` 아래 한 파일 추가로 끝난다. Spec은 동일).
- 슬롯 직접 수정의 클라이언트 즉시 렌더(지금은 보관 시 서버가 다시 렌더한다).
