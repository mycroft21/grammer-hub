# grammer-hub

상황 프로필에 맞춰 문법·오탈자·어투를 교정하고, 내 선택을 학습해 어투가 점점 나에게 맞춰지는 개인용 글쓰기 교정 페이지.

## 문서
- [제품 기획서](docs/01-product-plan.md)
- [레퍼런스 리서치](docs/00-references.md)
- [실현 가능성 · 가성비 판정](docs/02-feasibility.md)
- [로컬 LLM 판정 (Mac 32GB)](docs/03-local-llm.md)
- [Phase 1 구현 스펙](docs/04-spec-phase1.md)
- [구동 · 배포 가이드](docs/05-run-deploy.md)
- [UI · UX 검토와 디자인 방향](docs/06-ui-review.md)
- [디자인 토큰 v1 — 팔레트](docs/07-design-tokens.md)
- [학습 데이터 수집과 기록 그래프](docs/08-learning-data.md)

## 구조
```
apps/web        Next.js 16 + Ant Design v6 에디터 + API 라우트 (SSE)
packages/core   스키마 · 프롬프트 · 앵커 해소 · PII 마스킹 · provider(cloud/local/fake) · 파이프라인
packages/db     Drizzle + SQLite 스키마 · 마이그레이션 · 리포지토리
tools/          비용/지연 모델, 주간 리포트
```

## 실행
Node 22 + pnpm 10 필요. 자세한 내용은 [구동 · 배포 가이드](docs/05-run-deploy.md).
```bash
pnpm install
cp .env.example .env            # ANTHROPIC_API_KEY 입력
pnpm build && pnpm start        # http://localhost:3000  (개발 중엔 pnpm dev)
```
⚠️ 인증이 없습니다. 외부에 노출하지 말고 로컬에서만 쓰세요.
- 키 없이 UI만 보려면 `.env`에 `FAKE_PROVIDER=1` (결정적 가짜 교정, 품질 무관).
- 로컬 LLM: `llama-server -m gemma-4-26B-A4B-it-qat-q4_0.gguf -c 8192 --cache-reuse 256 --slot-save-path ./slots --swa-full --port 8080` 후 에디터의 provider 배지를 `local`로 전환.
- DB는 `apps/web/data/grammer.db`(SQLite). 원문 저장을 끄려면 `STORE_DRAFTS=false`.

## 검증
```bash
pnpm test        # core 77 · db 2
pnpm typecheck
pnpm build
pnpm --filter @grammer-hub/web e2e     # FAKE_PROVIDER 서버를 띄워 에디터 흐름 검증 (Chromium 필요)
node tools/report-week.mjs             # 최근 7일 비용·수락률·무수정 복사율
```

## 데모 데이터
실제 교정 없이 기록 그래프와 수집 화면을 보고 싶을 때. 실제 데이터는 건드리지 않는다.
```bash
pnpm seed:demo     # 8주치 데모 주입
pnpm seed:clear    # 데모만 삭제 (실제 교정 시작 전에 실행할 것)
```

## 상태
Phase 1 구현 완료(스펙 WBS 1~13, 15) + UI B안(Ant Design v6, 팔레트 v1, 다크모드) 적용. WBS 14(내 실제 메시지 30건 골든셋)는 사용자 데이터가 필요해 미착수.
