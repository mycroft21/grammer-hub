# 코딩 에이전트 프롬프트 벤치마크 (2026-09-22)

> 질문: 사람이 아니라 **Claude Code·Codex 같은 코딩 에이전트**에게 줄 "스타터 프롬프트"는 어떻게 써야 하는가. 공개된 지침이 무엇을 권하고, 우리 스튜디오의 슬롯·질문 정책·프로필은 거기서 무엇을 가져왔는가.
> 방법: 소스군 5개를 병렬로 조사(1차 출처만: 벤더 공식 문서·엔지니어링 블로그·논문·제품 도움말) → 규칙마다 원문 인용 → 종합 → 반대 검토. 조사 에이전트는 Sonnet, 종합·검토는 Opus.
> 한계: 이 세션의 네트워크 프록시가 `www.anthropic.com`, `developers.openai.com`, `docs.github.com`, `cursor.com`, `docs.devin.ai` 등을 막아 일부는 GitHub 원본 저장소·미러·검색 요약으로만 확인했다. 부록 A에 `직접 확인 / 간접`을 표시했고, 간접 인용은 정확도가 낮다.
> 근거 등급은 [docs/10](10-prompt-engineering-references.md)과 같다: **[1차]** 공식 문서·논문이 직접 권고 / **[경험칙]** 벤더 템플릿·커뮤니티 관행 / **[우리 판단]** 출처 없음.

---

## 0. 한 줄 결론

두 벤더(Anthropic, OpenAI)와 Copilot·Devin·Jules의 지침은 놀랄 만큼 같은 말을 한다: **결과물과 "끝난 상태"를 관찰 가능하게 쓰고, 에이전트가 스스로 돌릴 수 있는 검증을 주고, 범위를 잠그고, 저장소에서 알 수 있는 것은 적지 말고 찾게 하고, 저장소 상식은 프롬프트가 아니라 저장소 옆의 파일(CLAUDE.md / AGENTS.md)에 두라.** 스튜디오 v0.5는 이 다섯을 코드로 강제하도록 바꿨다(§5).

## 1. 소스군과 신뢰도

| 소스군 | 핵심 자료 | 확인 | 이 문서에서의 무게 |
|---|---|---|---|
| Anthropic / Claude Code | *Best practices for Claude Code*, CLAUDE.md·Skills 문서, *Prompting best practices*(Claude 5 세대 모델별 지침), claude-code-action 문서 | 직접 | 가장 높음. 우리 1차 대상 |
| OpenAI / Codex | AGENTS.md 형식(agents.md 저장소), *Codex prompting guide*·*GPT-5 / GPT-5.1 prompting guide*(cookbook 원본 노트북), Codex CLI의 실제 모델 지시문(`codex-rs/core/*.md`), *Using PLANS.md* | 직접(문서 사이트는 미러) | 높음. 우리 2차 대상 |
| Copilot · Cursor · Devin · Gemini CLI · Jules · Aider · Amp | Copilot *Get the best results*(이슈-as-프롬프트), custom instructions, Aider conventions, GEMINI.md, Jules 프롬프트 예시, Amp 컨텍스트 가이드 | Copilot·Aider·Gemini·Jules·Amp 직접 / Cursor·Devin 간접 | 보조. "좋은 작업이란"의 교차 확인 |
| 연구·스펙 주도 개발 | SWE-bench Verified의 "underspecified" 판정 기준, 이슈 명세 품질 연구, Kiro specs·spec-kit 구조 | §부록 | 근거의 실험적 뒷받침(약함) |
| 질문 시점 | ClarifyGPT·*Learning to Ask* 계열, 벤더의 "묻기 vs 가정" 지침 | §부록 | 질문 정책의 근거 |

## 2. 공통 규칙 (교차 확인된 것만)

각 항목: 규칙 → 어디서 → 스튜디오 반영. 원문 인용은 부록 B.

| # | 규칙 | 근거 | 등급 | 스튜디오 v0.5 |
|---|---|---|---|---|
| R1 | **목표는 증상·위치·"고쳐진 상태"로.** 동사+파일이 아니라 무엇이 어떻게 보이면 끝인지 | Claude Code BP(Describe the symptom… what "fixed" looks like), Codex(Good tasks have a clear outcome), Copilot(clear description of the problem) | [1차] | `goal` 규칙에 "관찰 가능한 끝 상태 + 왜" |
| R2 | **끝 조건은 에이전트가 스스로 보일 수 있게.** 테스트·빌드·재현 명령·화면. "검증 수단이 없으면 사람이 검증 루프가 된다" | Claude Code BP(Give Claude a way to verify), `/goal`(one measurable end state + a stated check), Codex(Done when: tests passing, behavior changed), Devin(CI green), Copilot(acceptance criteria… should there be unit tests?) | [1차] | `success_criteria`→**완료 조건**: 실행 가능한 확인 최소 1개 · 새 점검 `verification_runnable` · 프로필의 `verify` 명령 주입 |
| R3 | **주장이 아니라 증거로 보고.** 실행한 명령과 출력, 못 한 것·건너뛴 검증을 따로 | Claude Code BP(Require evidence… not an assertion), Codex(report evidence; honesty about skipped verification; Done/Blocked/Cancelled) | [1차] | 보고 형식에 코드가 고정 한 줄 삽입(`AGENT_REPORT_LINE`) |
| R4 | **범위를 잠근다.** 요청된 변경만, 무관한 버그는 후속 항목, 리팩터링 금지, 기존 테스트 삭제·변조 금지 | Claude Code(Avoid over-engineering 블록, "pre-existing bugs are follow-ups"), Codex CLI 지시문(ignore unrelated bugs, minimal changes), Copilot(security/PII는 사람 몫) | [1차] | 목적별 **범위 유지 한 줄**을 코드가 첫 규칙으로 삽입(`AGENT_DEFAULTS.scope`) |
| R5 | **위임하되 앵커를 준다.** 파일·심볼·따를 패턴을 가리키고, 어떤 파일을 읽고 무엇을 실행할지는 에이전트가 정하게 | Claude Code BP(Delegate, don't dictate; point to sources; reference existing patterns), Copilot(files to change… an anchor, not a requirement), Amp(if you know which files, say so) | [1차] | `starting_points`는 **'저장소: 대상'** 형태, 단어 하나는 점검 실패 · 시작점 고정 한 줄("어떤 파일을 읽을지는 스스로 정한다") |
| R6 | **저장소에서 알 수 있는 것은 적지 말고 찾게.** CLAUDE.md/AGENTS.md는 "코드로 유추할 수 없는 것"만 | Claude Code memory 문서(only what Claude can't infer; "would removing this cause mistakes?"), Codex(AGENTS.md is a README for agents; prompt overrides it), Copilot(repo instructions broadly applicable, never task-specific) | [1차] | 질문 정책의 `agent_can_find` 상태(§4) · 작업 공간 프로필(§3) |
| R7 | **모호하면 가정하고 진행, 되돌리기 어려운 것만 멈춘다.** 상반된 지시("묻지 말고 진행" + "먼저 확인")를 함께 넣지 않는다 | Claude Code(autonomous: proceed on reversible in-scope actions; state assumption at the end), GPT-5 가이드(persistence; never include contradictory instructions), Codex(ends with an edit or an explicit blocker + one targeted question) | [1차] | 에이전트용 "정보가 부족할 때" 문구 3종을 이 원칙으로 재작성 |
| R8 | **계획 요구는 필요할 때만.** 여러 파일·불확실할 때만 계획 먼저; Codex에는 "계획을 보여 달라"를 넣지 않는다(거기서 멈춤) | Claude Code BP(plan first only when approach is uncertain; skip when the diff fits one sentence), Codex guide(do NOT ask for an upfront plan/preambles) | [1차] | `process`는 2~5개 결과 이정표, Codex면 계획 단계 금지 |
| R9 | **짧고 구조적으로.** 헤더·불릿, 한 개념 한 용어, "철저히·빠짐없이" 같은 강조 금지(과잉 탐색) | Claude Code(headers and bullets… dense paragraphs followed less), GPT-5(anti-pattern: "be THOROUGH"), Codex("less is more") | [1차] | 어휘 규칙에 강조어 금지 · short 모드 700자(고정 문장 제외) |
| R10 | **결과물 분량은 작업 종류가 정한다.** 조사 목록·설계안·변경 요약·검토 항목은 길이 단위가 다르다 | Codex(size the final report to the change), Claude Code(calibrate deliverable length; no filler) | [1차 발상]+[우리 판단 수치] | 목적별 분량 표(`AGENT_DEFAULTS.report.length`)를 코드가 통일 |
| R11 | **되묻기 보일러플레이트 금지.** "다시 확인하라", "최종 검증 단계를 추가하라"는 과잉 검증을 부른다(Opus 5 지침) — 대신 **구체적인** 검증 명령 | Anthropic 모델별 지침(contested: Claude Code BP는 "항상 검증 수단을 주라") → 절충: 일반적 되묻기 대신 구체적 명령 | [1차·절충] | `self_check`→**끝내기 전에 검증**: 명령·증거만, '…했는가?' 금지 |

부록 C에 출처끼리 어긋나는 점(계획 요구, 파일 지정의 의무성, 검증 지시의 양, 규칙 파일 길이 단위)을 그대로 남겼다.

## 3. 저장소 지식은 어디에 두나 → 작업 공간 프로필

모든 벤더가 "매 프롬프트에 반복하는 것은 저장소 옆 파일로 올려라"고 한다(Claude Code: promote a fact when re-explained twice; Codex: if you keep reusing the same prompt, make it AGENTS.md or a skill; Cursor: promote repeated chat prompts into rules). 그 파일에 들어갈 것도 일치한다: **빌드·테스트 명령, 비표준 관례, 함정, 저장소 구조의 비자명한 부분**. 넣지 말 것: 코드에서 유추되는 것, 파일별 설명, 일반 상식.

우리 도구는 저장소 **밖**(티켓 → 프롬프트)에서 돌기 때문에 CLAUDE.md를 읽을 수 없다. 그래서 같은 내용을 `studio.workspace.json`으로 받는다(docs/05 §A-3″). 필드 선택의 근거:

| 필드 | 근거 | 쓰이는 곳 |
|---|---|---|
| `repos[].name/what/stack` | Copilot custom-instructions("project overview, tech stack"), AGENTS.md 관례 | 작업 공간 블록, 저장소 질문 선택지 |
| `repos[].aliases` | [우리 판단] — 세 실사용 티켓 모두 병목이 "어느 레포인가"였고, 티켓은 `[partner]` 같은 태그로만 가리킴 | **코드가** 제목·라벨·컴포넌트에서 확정 → where 질문 소거 |
| `repos[].verify` | R2. Codex("if test commands are listed in AGENTS.md the agent will run them"), Copilot("make sure the agent knows how to build, test and validate — the biggest lever") | 완료 조건·검증 재료 |
| `repos[].entry/notes` | Claude Code memory(gotchas, non-default conventions), Amp AGENT.md(Architecture & Structure) | 시작점·맥락·규칙 재료 |
| `conventions` (≤5) | Claude Code(CLAUDE.md 짧게; emphasize at most one line), Cursor(start minimal, add after a repeated mistake) | hard_rules 후보(모델이 관련된 것만) |
| `glossary` | Codex 태스크 문서 지침(define every non-ordinary term), Claude Code(one consistent term per concept) | 텍스트에 나온 용어만 삽입 |
| `projects` | [우리 판단] — Jira 프로젝트 키(ES=보안 점검)가 분류 힌트 | 분류 프롬프트 |

프로필은 "무엇을 넣지 말 것"도 따른다: 디렉터리 트리·의존성 목록·아키텍처 개요는 받지 않는다(에이전트가 저장소에서 읽는다).

## 4. 질문 정책 — 무엇을 묻고 무엇을 가정하고 무엇을 넘기나

벤더 지침과 연구가 가리키는 기준은 세 갈래다.

1. **저장소를 읽어 알 수 있는 것은 묻지 않는다.** Claude Code: "direct Claude to the source that can answer instead of asking the question bare"; Copilot 온보딩 프롬프트: "trust the instructions and only perform a search if incomplete"; Codex: 코드값·구현 위치는 에이전트가 찾는다. → 장부 상태 `agent_can_find` = 프롬프트의 "확인할 것"으로 이동.
2. **사람만 아는 것 중 결과물을 바꾸는 것만 묻는다.** ClarifyGPT 계열의 기준은 "그럴듯한 해석들이 서로 다른 출력을 낳을 때"(부록 B·질문 시점 항 참고), Claude Code는 "가정이 결과를 크게 바꿀 때"; 그 외는 가정을 명시하고 진행. → `ask` 조건 = 어느 저장소 / 업무 규칙·범위 결정 / 첨부에만 있는 핵심 정보, **그리고** 답에 따라 결과물이 달라질 때.
3. **질문은 적게, 한 번에.** Claude Code: "batch your questions"; Codex: "one targeted question"; 우리 목표: 스타터. → 상한 2개, 초과분은 가정으로 내려 검토 화면에서 고치게.

이 셋을 모델 재량에 맡기지 않고 **장부(needs ledger)**로 강제한다(`needs.ts`): 항목마다 `filled / ask / assume / agent_can_find` 중 하나. 항목은 개발 공통 6개(where·deliverable·done·scope·external·policy) + 세부 유형의 mustKnow. 같은 항목이 질문과 가정에 동시에 나올 수 없고, `where`는 프로필이 확정하면 모델 판단을 덮어쓴다. 첫 실사용(EP-1174·ES-476·EP-1161)에서 세 티켓의 질문 행동이 제각각이던 원인이 "판단을 통째로 위임"이었다는 진단에 대한 답이다.

**한계(정직하게):** "질문 상한 2"와 "우선순위 where > external > policy > deliverable > done > scope"는 [우리 판단]이다. 연구 문헌은 "언제 물어야 하는가"의 기준은 주지만 개수 상한은 주지 않는다.

## 5. 스튜디오 v0.5에 반영한 것 (요약)

| 영역 | 변경 | 근거 |
|---|---|---|
| 슬롯 의미(에이전트) | 성공 기준→완료 조건 / 절대 규칙→범위와 제약 / 출력 형식→보고 형식 / 자기 점검→끝내기 전에 검증 / 과정→진행 | R2·R3·R4·R11, Codex 4부(Goal/Context/Constraints/Done when) |
| 코드 삽입 고정 문장 | 목적별 범위 유지 한 줄, 보고 한 줄, 시작점 한 줄 | R3·R4·R5 |
| 결과물 분량 표 | 조사 20~40줄 / 설계 1,000~1,500자 / 구현 10줄+검증 출력 / 검토 항목당 2~3줄 | R10 |
| 점검 추가 | `starting_points`(검색어 한 단어 실패), `verification_runnable` | R2·R5 |
| 질문 정책 | 장부·상한 2·`agent_can_find` | §4 |
| 프로필 | `studio.workspace.json` | §3 |
| 런타임 | `codex` 추가(system 없이 한 덩어리) | Codex CLI에는 system 프롬프트가 없고 AGENTS.md가 그 자리 |
| 이름 치환 | Jira 사람 이름→역할명 | Copilot("keep PII out of agent tasks"), 우리 로그 정책 |

실측(Claude Code 경유, DEMO-1/DEMO-2, 프로필 켬): 분류 18~29초, 생성 15~28초, 점검 11/11, 질문 각 1개(업무 판단), 저장소는 코드가 확정. 렌더 2,049자/1,486자 — 고정 문장(~300자)과 티켓 맥락 때문에 short 목표(700자+고정)보다 여전히 길다. 다음 손질 후보.

## 6. 하지 않은 것과 왜

- **파일 앵커의 의무화**: Copilot은 "파일 지정은 앵커일 뿐 필수 아님"이라 하고 Cursor는 에이전트 검색을 선호한다. 우리는 시작점을 필수로 두되(점검), 형태만 강제한다('저장소: 대상').
- **예시 기본 포함**: 코딩 에이전트 프롬프트에서 예시는 "따를 기존 패턴 파일"로 대체된다(R5). 스타일 민감 작업이 아니면 null 유지.
- **훅·권한으로 경계 강제**: Claude Code는 "'don't touch' 한 줄은 권고일 뿐, 반드시 지켜야 하면 훅으로"라 한다. 그건 저장소 쪽 설정이라 이 도구 범위 밖. 문서에만 적는다.
- **프롬프트 안에 검증 명령을 항상 박기**: Codex는 "AGENTS.md에 있으면 프롬프트에 반복하지 말라"고 한다. 우리는 프로필의 `verify`가 있으면 완료 조건에 쓰고, 없으면 "기존 테스트가 있으면 통과"로 위임한다.

---
