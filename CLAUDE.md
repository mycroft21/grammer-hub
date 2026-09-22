# Grammar Hub — 에이전트용 저장소 안내

한국어 업무 메시지 교정 + 프롬프트 스튜디오(Claude Code·Codex용 스타터 프롬프트 생성). pnpm 모노레포. 코드 주석·문서는 한국어.

## 명령 (루트에서)
- 설치·빌드: `pnpm install` → `pnpm build` (E2E는 빌드 결과를 쓴다)
- 타입: `pnpm typecheck` · 단위 테스트: `pnpm test` (core 129, db 2) · 한 패키지만: `pnpm --filter @grammer-hub/core test`
- E2E(빌드 후): `cd apps/web && CHROMIUM_PATH=<chrome 실행 파일> node e2e/smoke.mjs` — FAKE_PROVIDER로 서버를 직접 띄우고 35개 항목을 본다. 실제 `.env`는 건드리지 않는다(GH_ENV_FILE 임시 파일)
- 상태 진단: `pnpm health` (`--probe`로 백엔드 실제 호출). `pnpm doctor`는 pnpm 자체 명령이라 쓰지 않는다
- DB 스키마를 바꾸면 `pnpm --filter @grammer-hub/db generate`로 마이그레이션 파일을 만든다(손으로 SQL 쓰지 않기)

## 구조
- `packages/core` — 순수 TS. 교정 파이프라인, PII 마스킹, **프롬프트 스튜디오**(`src/promptstudio/`: spec·taxonomy·needs·workspace·agent-defaults·ticket·meta-prompt·render·checks·pipeline). Node 전용(claude-cli 프로바이더)은 `src/node.ts`에서만 export — 브라우저 번들에 `node:child_process`가 섞이면 빌드가 깨진다
- `packages/db` — Drizzle + better-sqlite3. 마이그레이션은 `drizzle/`
- `apps/web` — Next 16 App Router, React 19, Ant Design v6, Tailwind 유틸만(Preflight 끔). 서버 전용 모듈은 `import "server-only"`
- 문서: `docs/05`(실행·설정), `docs/09`(스튜디오 설계·결정), `docs/10`(프롬프트 근거), `docs/11`(코딩 에이전트 벤치마크). 동작을 바꾸면 해당 §를 같이 고친다

## 지켜야 할 것
- `exactOptionalPropertyTypes`가 켜져 있다. 선택 속성에 `undefined`를 넣지 말고 조건부 스프레드(`...(x ? { k: x } : {})`)로
- 환경 변수는 `apps/web/lib/env.ts`의 게터로만 읽는다(설정 화면이 런타임에 바꾼다). `process.env`를 직접 읽지 않는다
- 로그(`serverLog`)에 원문·개인정보·비밀값을 넣지 않는다. 글자 수·건수만
- 프롬프트 스튜디오에서 "코드가 보장"하는 것(질문 선택, 저장소 확정, 범위 문장, 보고 분량, 점검)은 모델에게 넘기지 않는다. 모델 출력 스키마(`PromptSpec`·`Need`·`TicketPlanRaw`)를 바꾸면 `providers/fake.ts`의 가짜 응답과 테스트·E2E를 같이 고친다
- 다크 모드 색은 `apps/web/lib/theme/tokens.ts`의 `DARK`(v2)만 고친다. 컴포넌트에 색을 직접 박지 않는다
- 커밋하지 않는 것: `.env`, `studio.workspace.json`, `data/`. 예시는 `.env.example`, `studio.workspace.example.json`
- 임시 스크립트는 `apps/web/e2e/_*.mjs`에 만들지 말고 저장소 밖에 둔다(커밋에 섞인 적 있음)

## 끝내기 전에
`pnpm typecheck && pnpm test && pnpm build` 통과, UI를 건드렸으면 E2E까지. 보고에는 실행한 명령과 결과를 붙인다.
