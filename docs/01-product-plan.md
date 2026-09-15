# Grammar Hub — 제품 기획서 (v0.1, 2026-09-15)

> 한 줄 요약: 내가 쓴 메시지·보고서를 **상황 프로필**에 맞춰 문법·오탈자·어투를 교정하고 대안을 제시하며, 내가 고른 것과 고친 것을 보고 **내 어투를 계속 학습**하는 개인용 웹 페이지.

레퍼런스 근거는 [`00-references.md`](./00-references.md) 참고.

---

## 1. 문제 정의

| 현재 고통 | 기존 도구의 한계 |
|---|---|
| 슬랙·메일·보고서마다 요구되는 격식이 다른데 매번 손으로 톤을 맞춤 | 네이버/부산대 검사기는 맞춤법만, 톤·존대 단계는 못 봄 |
| 이중 존대, 개조식/서술식 혼용, 해요체/합쇼체 섞임을 스스로 놓침 | LLM 채팅은 매번 "격식 있게 바꿔줘"를 다시 설명해야 하고 결과가 내 말투가 아님 |
| 교정 결과가 내 말투와 달라 결국 다시 고침 | Grammarly Voice는 한국어 미지원, Jasper/Writer는 한 번 만든 보이스가 갱신 안 됨 |
| 업무 메시지에 고객·거래 정보가 섞여 외부 무료 검사기에 넣기 꺼려짐 | 스크래핑형 라이브러리는 약관 위반·차단 상태 |

**핵심 가설**: "상황 프로필 × 내 편집 로그"를 프롬프트에 주입하면, 파인튜닝 없이도 몇 주 안에 재수정 없이 보낼 수 있는 비율이 눈에 띄게 오른다.

---

## 2. 목표와 비목표

**목표**
1. 붙여넣기 → 5초 내 교정 결과(변경 하이라이트 + 이유) + 톤 대안 3안.
2. 상황 프로필 6종 기본 제공, 사용자 정의 가능.
3. 수락/거절/수정/선택 이벤트를 전부 기록하고, 그 로그에서 **읽고 고칠 수 있는 자연어 규칙**으로 내 어투를 증류.
4. 한국어 1급 지원(존대 단계, 이중 존대, 개조식, 띄어쓰기, 외래어 표기). 영어는 2급.
5. 개인정보 마스킹 후에만 외부 LLM 호출.

**비목표(초기)**
- 브라우저 확장·슬랙 앱 등 입력창 내장(2단계 이후 검토).
- 다중 사용자·팀 스타일가이드(스키마만 `user_id` 스코프로 대비).
- 자체 모델 파인튜닝(선호 쌍 2k+ 축적 후 재검토).
- 문서 전체 구조 재작성(문장·문단 단위까지만).

---

## 3. 핵심 개념

### 3.1 상황 프로필 (Situation Profile)
Grammarly Goals의 4축과 DeepL의 style/tone 분리를 결합. 프로필은 **기본값 묶음**이며 사용자가 축을 조정할 수 있다.

| 축 | 값 |
|---|---|
| 대상(audience) | 상급자 / 동료 / 부하·후배 / 고객·외부 / 불특정 다수 |
| 채널(channel) | 슬랙·메신저 / 이메일 / 보고서·문서 / 공지 / 회의록 |
| 언어(language) | ko / en / 혼용 |
| 높임 단계(ko) | 하십시오체 / 해요체 / 해체 / 개조식(명사형 종결) |
| 격식(formality) | 1~5 |
| 길이 성향 | 간결 / 보통 / 상세 |
| 의도(intent) | 보고 / 요청 / 사과·해명 / 설득 / 안내·공지 / 감사 |
| 톤(1개만) | 중립 / 정중 / 단호 / 친근 / 완곡 |

**기본 프로필 6종**
1. `boss-slack` 상급자·슬랙·해요체·격식3·간결·보고
2. `boss-report` 상급자·보고서·개조식·격식5·보통·보고
3. `peer-slack` 동료·슬랙·해요체·격식2·간결·요청
4. `customer-email` 고객·이메일·하십시오체·격식5·보통·안내
5. `partner-email-en` 외부·이메일·en·formality 4·보통·요청
6. `team-notice` 불특정·공지·하십시오체·격식4·보통·안내

### 3.2 교정 강도 (센텐시파이 3단계 차용)
- **L1 교정만**: 맞춤법·띄어쓰기·문장부호·명백한 문법. 의미·톤 불변.
- **L2 다듬기**: L1 + 프로필 높임 단계 통일, 이중 존대 제거, 구어 제거, 문장 간결화.
- **L3 다시 쓰기**: L2 + 톤 대안 3안(예: 더 정중 / 더 단호 / 더 간결). 사실·숫자·약속은 보존 검증.

### 3.3 오류 카테고리 (KAGAS + 자체 확장)
`SPACING` 띄어쓰기 · `SPELLING` 철자/외래어 · `GRAMMAR` 조사·어미·호응 · `PUNCTUATION` · `HONORIFIC` 높임 단계/이중 존대/압존법 · `REGISTER` 문어·구어/개조식 혼용 · `WORD_CHOICE` · `CLARITY` · `CONCISENESS` · `TONE`

각 카테고리는 사용자별 수락률 통계의 축이 되며, "이 카테고리 제안 끄기"의 단위가 된다.

### 3.4 스타일 프로필 (학습 대상)
Grammarly Voice + PRELUDE/CIPHER 방식. 사용자가 **읽고 고칠 수 있어야** 한다.

```
규칙(style_rule)
  text:       "슬랙에서 상급자에게도 '~습니다'보다 '~요'를 선호한다"
  scope:      {channel: slack, audience: boss, lang: ko}
  confidence: 0.83   (Beta 분포 α/β, 반감기 75일)
  evidence:   12건   (근거 이벤트 링크)
  status:     active | pinned | demoted
  created_by: user | distill
예시(exemplar)
  before → after, 상황 태그, 임베딩, 마지막 사용 시각
```

---

## 4. 사용자 흐름

### 4.1 메인 화면 (에디터)
```
┌──────────────────────────────────────────────────────────────┐
│ [프로필 ▾ boss-slack] [강도 ● L1 ○ L2 ○ L3]   [교정 ⌘↵]      │
├────────────────────────────┬─────────────────────────────────┤
│ 원문 (편집 가능)            │ 결과                             │
│                            │ ┌ 변경 하이라이트 뷰 ────────┐   │
│ 팀장님 어제 말씀하신 자료   │ │ 팀장님, 어제 말씀하신 자료  │   │
│ 정리해서 보내드릴께요.      │ │ 정리해서 보내드릴게요.      │   │
│ 커피 나오셨습니다 ㅎㅎ      │ │ ~~커피 나오셨습니다~~ →     │   │
│                            │ │ 커피 나왔습니다             │   │
│                            │ └────────────────────────────┘   │
│                            │ 변경 3건  [모두 수락] [원문 보기] │
│                            │ ① SPELLING 드릴께요→드릴게요     │
│                            │    "-ㄹ게요"가 표준 (한글맞춤법  │
│                            │    53항) [수락][무시][이런 제안 끄기]│
│                            │ ② HONORIFIC 나오셨습니다→나왔습니다│
│                            │    사물에 -시- 사용은 과잉 존대  │
│                            │ ③ REGISTER "ㅎㅎ" 제거            │
│                            │    상급자 슬랙 프로필 격식3 기준  │
│                            ├─────────────────────────────────┤
│                            │ 톤 대안 (L3)                     │
│                            │ [A 더 정중] [B 더 간결] [C 더 친근]│
│                            │ ⓘ 수신자 관점: "보내드릴게요"만   │
│                            │   있으면 시점이 없어 재질문 가능  │
│                            ├─────────────────────────────────┤
│                            │ [최종본 복사]  ← 복사 시점의 텍스트│
│                            │   를 최종본으로 기록              │
└────────────────────────────┴─────────────────────────────────┘
```

**학습 신호가 발생하는 지점**
- 변경 카드의 수락/무시 → `accept | reject`
- 결과 패널에서 직접 고친 뒤 복사 → `edit(final_text)` (가장 강한 신호)
- 톤 대안 A/B/C 중 선택 → `prefer(chosen, rejected[])`
- "이런 제안 끄기" → 카테고리×scope 규칙 즉시 생성(demoted)
- "사전에 추가" → 개인 사전(고유명사·사내 용어·제품명)

### 4.2 "내 어투" 화면
- 활성 규칙 목록(신뢰도 막대, 근거 건수, scope 배지). 항목별 **고정 / 수정 / 삭제**.
- 주간 증류 결과가 "제안된 규칙 변경"으로 도착 → 사용자가 승인해야 활성화(Grammarly Voice 특성 삭제 UX + 버전 스냅샷).
- 부트스트랩: 내가 쓴 글 샘플 300~500단어 붙여넣기(Writer 방식) → 초기 규칙 초안 생성.
- 대시보드: 주간 수락률, 제안-최종 편집거리 추이, 카테고리별 수락률, 프로필별 무수정 복사율.

### 4.3 "취향 묻기" (선택, Phase 3)
충돌 규칙이 생기거나 신뢰도 낮은 규칙이 5건 이상이면, 두 문장을 나란히 보여주고 "어느 쪽이 더 당신답나요?"를 하루 최대 3회 질문. Bradley-Terry로 점수화.

---

## 5. 시스템 설계 요약

```mermaid
flowchart LR
  UI[Next.js 에디터] -->|SSE| API[/api/correct/]
  API --> M[PII 마스킹 · NFC 정규화 · 문장 분할]
  M --> K[kiwipiepy 규칙층<br/>띄어쓰기 · 종결어미(높임 단계) 판별]
  K --> R[Retriever: pgvector<br/>같은 scope 수락 편집 top-k]
  R --> P[Prompt Builder<br/>cached: 지침+규칙 스냅샷<br/>dynamic: 예시+프로필+초안]
  P --> C[claude-sonnet-5<br/>JSON Schema 출력]
  C --> A[Anchor Resolver<br/>exact→context→fuzzy→diff]
  A --> UI
  UI -->|accept/reject/edit/prefer| F[(feedback_events<br/>preference_pairs)]
  F --> E[임베딩 → exemplars]
  F --> D[주간 증류 Job<br/>claude-opus-5 Batch]
  D --> V[(style_rules / profile_versions)]
  V --> P
  F --> X[지표 · 홀드아웃 평가]
```

**설계 원칙**
1. **LLM에 오프셋을 맡기지 않는다.** 인용 앵커 + 전체 교정문을 받고 서버가 위치를 복원한다(NFC 정규화 필수, macOS NFD 입력 주의).
2. **규칙층 + LLM층.** 띄어쓰기·종결어미 판별처럼 결정적인 것은 kiwipiepy로, 문맥·톤은 LLM으로. LLM 과교정 완화.
3. **학습은 프롬프트로.** 자연어 규칙(신뢰도·scope) + 수락 편집 RAG + 주기 증류. 파인튜닝은 보류.
4. **프로필은 투명하다.** 사용자가 모든 규칙을 읽고 고칠 수 있고, 증류 결과는 승인 후 적용.
5. **외부 검사기 스크래핑 금지.** 규칙 엔진이 더 필요해지면 바른한글 기업 API 정식 계약 또는 Sapling(ko) 검토.
6. **PII 마스킹.** 이메일·전화·계좌·카드·주민번호 패턴은 LLM 호출 전 토큰으로 치환, 응답 후 복원.

**스택**: Next.js App Router + TypeScript + Tailwind + shadcn/ui / Postgres(Supabase 또는 Neon) + pgvector + Drizzle / Auth.js 이메일 화이트리스트 / Claude API(`claude-sonnet-5` 인터랙티브, `claude-opus-5` Batch 증류, `claude-haiku-4-5` 실시간 오탈자 옵션) / voyage-4-lite 임베딩 / kiwipiepy는 Python 마이크로서비스(FastAPI) 또는 WASM 빌드 검토.

**비용**: 건당 약 $0.02~0.03, 월 300회 기준 $6~9 + 증류 $1~2.

---

## 6. 데이터 모델 (핵심 테이블)

| 테이블 | 주요 컬럼 |
|---|---|
| `users` | id, email |
| `situation_profiles` | id, user_id, name, audience, channel, lang, honorific_level, formality, length, intent, tone, is_default |
| `drafts` | id, user_id, profile_id, text_nfc, lang, created_at |
| `correction_runs` | id, draft_id, level(L1/L2/L3), model, prompt_version, profile_version_id, tokens(in/cached/out), cost_usd, latency_ms |
| `suggestions` | id, run_id, kind(edit/rewrite), start_utf16, end_utf16, original, replacement, category, severity, reason, alt_label, resolve_method |
| `feedback_events` | id, suggestion_id, action(accept/reject/edit/prefer/mute), final_text, created_at |
| `preference_pairs` | id, user_id, profile_id, context, chosen, rejected, source(edit/ab), split(train/holdout) |
| `exemplars` | id, user_id, before, after, scope jsonb, embedding vector(1024), weight, last_used_at |
| `style_rules` | id, user_id, text, scope jsonb, alpha, beta, confidence, status, evidence_ids, created_by |
| `profile_versions` | id, user_id, snapshot jsonb, distill_run_id, holdout_metrics jsonb, activated_at |
| `personal_dictionary` | id, user_id, term, note |

---

## 7. LLM 출력 스키마 (초안)

```json
{
  "corrected_text": "전체 교정문",
  "edits": [{
    "id": "e1",
    "sentence_index": 0,
    "original": "보내드릴께요",
    "context_before": "정리해서 ",
    "context_after": ".",
    "replacement": "보내드릴게요",
    "category": "SPELLING",
    "severity": "error",
    "reason_ko": "'-ㄹ게요'가 표준 표기입니다(한글 맞춤법 제53항).",
    "rule_ref": "https://korean.go.kr/kornorms/...",
    "confidence": 0.95
  }],
  "rewrites": [
    {"label": "더 정중", "text": "...", "rationale": "..."},
    {"label": "더 간결", "text": "...", "rationale": "..."},
    {"label": "더 친근", "text": "...", "rationale": "..."}
  ],
  "reader_view": "수신자 관점에서 이렇게 읽힐 수 있음: ...",
  "preserved_facts_check": {"numbers": true, "dates": true, "commitments": true}
}
```

---

## 8. 학습 루프 상세

| 단계 | 트리거 | 동작 |
|---|---|---|
| 즉시 | 모든 피드백 이벤트 | `feedback_events` 기록, `edit`이면 preference_pair 생성(20%는 holdout) |
| 즉시 | `edit`/`prefer` | before→after를 임베딩해 `exemplars` upsert, 해당 규칙 α/β 갱신 |
| 즉시 | "이런 제안 끄기" | category×scope demoted 규칙 생성 |
| 주 1회 또는 신규 이벤트 ≥30 | 증류 Job | Opus 5 Batch: 기존 규칙 + 신규 쌍 → 추가/강화/약화/병합/충돌 표기 → `profile_versions` 초안 |
| 증류 후 | 회귀 게이트 | holdout 문맥 재생성 → 실제 최종문과 편집거리가 이전 버전보다 작아야 "승인 가능" 표시 |
| 사용자 승인 | "내 어투" 화면 | 스냅샷 활성화, 프롬프트 캐시 프리픽스 갱신 |
| 상시 | 감쇠 | 근거 이벤트 반감기 75일, confidence<0.4 & n≥5 → demoted, ≥0.8 → 프롬프트 상단 고정 |

**프롬프트 배치(캐싱)**: `[고정 지침 + 카테고리 정의 + 출력 규칙] [활성 규칙 스냅샷(버전 고정)]` 까지 cache_control → 그 뒤 `[검색된 예시 k=3~5] [상황 프로필] [개인 사전] [초안]`.

---

## 9. 성공 지표

| 지표 | 정의 | 목표(8주) |
|---|---|---|
| 무수정 복사율 | 결과를 고치지 않고 복사한 비율 | 40% → 70% |
| 제안-최종 편집거리 | NFC 문자 Levenshtein / 길이, 주간 롤링 | 지속 감소 |
| 수락률(카테고리별) | accept / (accept+reject) | HONORIFIC·REGISTER 80%+ |
| 리라이트 1안 채택률 | A/B/C 중 첫 번째 채택 | 상승 추세 |
| 프로필 순효과 | 요청 10% 프로필 OFF 블라인드 대비 수락률 차 | +15%p |
| 응답 시간 | 500자 기준 첫 토큰 / 완료 | <1.5s / <6s |

---

## 10. 단계별 계획

### Phase 1 — MVP (2~3주): "교정이 된다"
- [ ] Next.js 스캐폴딩, Auth.js 이메일 화이트리스트
- [ ] 상황 프로필 6종 시드 + 편집 UI
- [ ] `/api/correct`: PII 마스킹 → NFC → Sonnet 5 JSON Schema 스트리밍
- [ ] 앵커 해소 라이브러리 + 한국어 픽스처 테스트(띄어쓰기, 조사, 높임 어미, 영문 혼용, NFD, 이모지)
- [ ] 변경 하이라이트 / 카드(이유·근거 링크) / 수락·무시 / 원문 토글 / 톤 대안 3안
- [ ] 모든 이벤트·토큰·비용 로깅
- [ ] 스타일 프로필은 사용자가 직접 쓰는 규칙 텍스트만(학습 없음)

### Phase 2 — 학습 루프 (2~3주): "내 말투를 기억한다"
- [ ] feedback → exemplars 임베딩 → 검색 삽입
- [ ] "내 어투" 화면: 규칙 목록, 신뢰도, 고정/수정/삭제, 부트스트랩 샘플 입력
- [ ] 주간 증류 Job(Opus 5 Batch) + 버전 스냅샷 + 승인 흐름
- [ ] 프롬프트 캐싱 적용·검증(`cache_read_input_tokens`)
- [ ] 지표 대시보드
- [ ] kiwipiepy 규칙층(띄어쓰기·높임 단계 판별) 연결

### Phase 3 — 고도화: "점점 나아진다"
- [ ] 페어와이즈 "취향 묻기" + Bradley-Terry
- [ ] 규칙 감쇠·scope 분할·충돌 해소
- [ ] 홀드아웃 회귀 게이트 자동화, LLM 판정자 보조
- [ ] Haiku 4.5 실시간 오탈자 패스
- [ ] 브라우저 확장 / 슬랙 앱 진입점
- [ ] (쌍 2k+ 시) LoRA 리라이트 생성기 실험

---

## 11. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| LLM 과교정(멀쩡한 문장을 고침) | L1은 kiwipiepy 규칙층 우선, LLM edits에 confidence 임계, AI허브 과교정 검증 데이터로 회귀 테스트 |
| 톤 변경 시 의미·숫자 이탈 | `preserved_facts_check` + 숫자·날짜·고유명사 diff 검증, 실패 시 대안 폐기 |
| 앵커 해소 실패로 하이라이트 어긋남 | 5단계 폴백 + 실패 로그, 실패 시 전체 교정문 diff 뷰로 대체 |
| 학습이 "일반적으로 좋은 글"로 수렴해 내 말투가 아님 | 편집 로그 우선, 프로필 OFF 블라인드 A/B로 순효과 측정, 규칙 투명 편집 |
| 업무 데이터 외부 전송 | PII 마스킹, 고객명 개인 사전은 로컬 치환, 로그 보관 기간 설정 |
| 외부 검사기 약관 | 스크래핑 배제. 필요 시 바른한글 기업 API 또는 Sapling 계약 |

---

## 12. 열린 결정 사항 (사용자 확인 필요)

1. **배포 형태**: 로컬 실행(SQLite/Turso)으로 시작할지, Vercel + Supabase로 바로 갈지. 권장: Vercel + Supabase(임베딩 검색이 Phase 2에 필요).
2. **kiwipiepy 연결 방식**: Python 마이크로서비스 vs Phase 1에서는 생략. 권장: Phase 1 생략, Phase 2에서 FastAPI 사이드카.
3. **영어 비중**: 영어 메일이 실제로 얼마나 되는지에 따라 `partner-email-en` 프로필 우선순위 조정.
4. **초기 프로필 6종의 실제 사용 채널**: 슬랙인지 다른 메신저(카카오워크, 팀즈)인지에 따라 채널 관례 규칙이 달라짐.
5. **PII 마스킹 범위**: 사내 규정상 LLM에 보내면 안 되는 항목 목록.
