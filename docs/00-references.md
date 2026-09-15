# 레퍼런스 리서치 (2026-09 기준)

> 본 문서는 웹 리서치 결과를 정리한 것으로, 일부 도메인은 세션 네트워크에서 직접 열람이 차단되어 검색 스니펫과 공식 문서 URL에 근거한다. 계약·약관·라이선스는 실제 사용 전 원문 재확인이 필요하다.

---

## A. 글로벌 AI 글쓰기 보조 도구 — 톤 · 프로필 · 개인화

### A1. Grammarly (2025.10 사명 Superhuman으로 변경)
- **Tone detector**: 단어 선택·구두점 등으로 20+ 톤(Formal, Confident, Worried…)을 이모지+라벨로 표시. https://www.grammarly.com/tone
- **Tone rewrite suggestions**: 과도하게 공격적/캐주얼한 문장을 문장 단위로 재작성 제안. https://www.grammarly.com/blog/product/tone-rewrite-suggestions/
- **Goals**: Audience / Formality / Domain / Intent 4축 사전 설정 → 제안 필터링. https://www.grammarly.com/blog/product/tone-suggestions/
- **Voice(개인 스타일 프로필)**: 사용자의 글에서 자동 추출·지속 갱신. **문서용/메시지용 프로필 분리**. AI가 생성한 프로필 특성 중 맞지 않는 항목을 사용자가 삭제 가능. https://support.grammarly.com/hc/en-us/articles/23153676821773-Introducing-voice-features
- **Style guide / Brand tones**: 규칙 직접 작성 또는 업로드, on/off-brand 톤 지정. https://www.grammarly.com/business/styleguide
- **제안 UI**: 밑줄 → 카드 → Accept / Dismiss / Learn more / "Turn off suggestions like this" / Add to dictionary. https://support.grammarly.com/hc/en-us/articles/360003474732-Grammarly-Editor-user-guide
- **Text Editor SDK는 2024.1 종료** → 외부 문법 API 종속 위험의 사례. https://techcrunch.com/2023/07/13/grammarly-to-shut-down-the-text-editor-sdk-in-january/

### A2. DeepL Write
- Style(simple/business/academic/casual) × Tone(enthusiastic/friendly/confident/diplomatic), **API에서 둘 중 하나만 지정**. https://developers.deepl.com/api-reference/improve-text
- UI: 변경부 하이라이트, 단어 클릭 → 대안, 문장 클릭 → 문장 전체 대안, "Show changes" diff 토글. https://support.deepl.com/hc/en-us/articles/9710730337820-Customize-your-text-with-DeepL-Write
- **한국어 미지원**(6개 언어).

### A3. Wordtune
- Rewrite / Casual / Formal / Shorten / Expand 5모드, 모드당 5~10개 후보 리스트. https://www.wordtune.com/blog/wordtune-guide
- 개인 스타일 프로필 없음. 일부 후보의 의미 이탈 문제 보고.

### A4. Microsoft / Google / Apple
- **Copilot in Outlook**: Draft 시 Tone × Length 드롭다운. **Coaching**은 Tone / Reader sentiment / Clarity 3축 코멘트(자동 교체 아님). https://support.microsoft.com/en-us/outlook/copilot-pages/get-email-coaching-with-copilot-in-outlook
- **Gmail Help me write / Polish**: Formalize / Elaborate / Shorten 칩 + 자유 텍스트 refine. https://workspaceupdates.googleblog.com/2024/10/polish-shortcut-gmail-web-and-mobile.html
- **Apple Writing Tools Proofread**: 변경마다 밑줄 + **변경 이유 설명**, Original 토글, 개별 되돌리기. Rewrite는 Friendly/Professional/Concise + 자유 지시. https://support.apple.com/guide/iphone/find-the-right-words-with-writing-tools-iph6f08da1d2/ios

### A5. 지속 보이스 프로필 보유 제품
- **Jasper Brand Voice**: 샘플 최대 8개 업로드 → 프로필 생성. https://help.jasper.ai/hc/en-us/articles/18618693085339-Brand-Voice
- **Writer.com Voice**: 최소 300단어(500+ 권장) 샘플. "샘플 기반 프로필이 수기 설명보다 일관되게 우수"라고 자체 공개. 채널/대상별 복수 Voice. https://writer.com/blog/voice-feature/
- 두 제품 모두 **사용자 피드백으로 프로필이 갱신되지 않는다**는 리뷰. https://www.atomwriter.com/blog/writer-com-brand-voice-style-guide-review/
- **Lex**: 검사 로직이 fine-tune이 아닌 **사용자가 열람·수정 가능한 프롬프트**. https://buttondown.com/lex/archive/lex-annual-letter-why-dont-more-writers-use-ai/

### A6. 개인화 연구
- **PRELUDE/CIPHER** (Gao et al., NeurIPS 2024): 사용자 **편집**에서 선호를 자연어로 추론·저장, 유사 문맥 선호를 검색해 프롬프트 주입. fine-tune 없이 편집거리 최소화. https://arxiv.org/abs/2404.15269 , https://github.com/gao-g/prelude
- **LaMP** (ACL 2024): 개인 프로필 검색 증강이 비개인화 대비 일관되게 우수, RAG가 PEFT보다 이득 큼. https://arxiv.org/abs/2304.11406
- **Aligning LLMs with Individual Preferences via Interaction** (COLING 2025). https://arxiv.org/abs/2410.03642
- **InMyStyle** (2026.7): 개인 글로 페어 자동 생성 후 소형 모델 LoRA. https://arxiv.org/abs/2607.29238
- Post-editing 연구 (2026.4): LLM 초안을 사용자가 후편집하면 본인 스타일 유사도 회복 → **편집 로그가 최고의 스타일 신호**. https://arxiv.org/abs/2604.24444
- 드러난 선호(pairwise 선택)가 설문식 진술 선호보다 개인 보상모델 정확도 높음(75.8% vs 62.4%). https://www.emergentmind.com/topics/personalized-creative-writing-llms

### A7. 외부 API 현황 (한국어 관점)
| API | 한국어 | 비용/조건 |
|---|---|---|
| Grammarly SDK | – | 2024.1 종료 |
| DeepL Write API | 미지원 | Developer/Growth 플랜 |
| LanguageTool | 미지원 | 공개 API 20 req/분, 자체 호스팅 가능 |
| Sapling | **지원(ko)** | 개발 키 50,000자/일 무료, 종량제. https://sapling.ai/docs/components/languages/ |

### A8. 기능 비교표
| 제품 | 톤 감지 | 톤 재작성 | 상황 프로필 | 개인 보이스 | 팀 규칙 | 학습 신호 |
|---|---|---|---|---|---|---|
| Grammarly | ◎ | ◎ | Goals 4축 | ◎ 자동추출·문서/메시지 분리 | ◎ | 수락/거절·끄기·사전 |
| DeepL Write | ✗ | ◎ 택1 | ✗ | ✗ | ✗ | ✗ |
| Wordtune | ✗ | ○ | ✗ | ✗ | ✗ | ✗ |
| Copilot Outlook | ○ Coaching | ○ | ✗ | ✗ | ✗ | ✗ |
| Apple | ✗ | ○ | ✗ | ✗ | ✗ | ✗ |
| Jasper/Writer | ✗ | ○ | 채널별 Voice | ◎ 샘플 업로드 | ◎ | ✗ |
| Lex | ✗ | ○ | ✗ | 프롬프트 편집 | ✗ | 수락 집계 |

---

## B. 한국어 맞춤법·문법·어투 도구

### B1. 기존 맞춤법 검사기
| 서비스 | 엔진 | API | 약관·리스크 |
|---|---|---|---|
| **바른한글(구 부산대)** https://nara-speller.co.kr/speller/ | 규칙/사전 기반(PnuNlp), 1994~ | **공식 유료 API 있음** https://nara-speller.co.kr/order/ | 개인·비상업만 무료. **회사 업무 포함 상업 목적은 별도 라이선스** |
| **네이버** | 자체 엔진 | 없음. 2023.9 passportKey 도입 후 비공식 라이브러리 전멸 | py-hanspell(https://github.com/ssut/py-hanspell) 2025~26 사실상 사용 불가 |
| **다음(카카오)** https://alldic.daum.net/grammar_checker.do | 자체 엔진 | 없음 | 카카오 자체 서비스 한정 |
| 인크루트·잡코리아·사람인 | 모두 부산대 엔진 임베드 | 없음 | 웹 UI만 |

**판단**: 무료 웹 검사기 스크래핑은 전부 약관 위반. 규칙 엔진이 필요하면 바른한글 기업 API 정식 계약이 유일한 합법 경로.

### B2. 한국어 AI 글쓰기/어투 도구
- **카카오워크 "AI 문장 다듬기"**: 메시지 전송 전 맞춤법·말투 정리. **우리 제품과 가장 유사한 컨셉**. https://kakaowork.gitbook.io/kakao-work/2.0-beta/2.0-ai/ai_add
- **엔그램**: AI 문맥 교정 + 다듬기(격식체/쉽게/짧게), API 상품 있음. https://www.engram.us/ko/spell-check
- **센텐시파이**: 교정 강도 3단계(맞춤법/다듬기/새로쓰기), Gmail·Docs 확장. https://sentencify.ai/ko
- **바른AI(bareun.ai)**: 형태소·교정 NLP API. https://bareun.ai/correct
- **뤼튼**: 범용 LLM 래퍼, 프로필 학습 없음.
- **네이버 HyperCLOVA X / 업스테이지 Solar**: 상용 API, 전용 교정 엔드포인트 없음(프롬프트 처리).
- **존댓말 변환 OSS**: `j5ng/et5-formal-convertor`(반말→해요체), `kcbert-formal-classifier`, BanmalMode, KoreanF2I. **해요체↔합쇼체 3단계 변환을 제대로 하는 공개 도구는 없음.** 스타일 데이터: Smilegate SmileStyle 17문체 https://github.com/smilegate-ai/korean_smile_style_dataset

### B3. 오픈소스 한국어 NLP
- **KoGEC (Sionic AI, 2025.6)**: NLLB 파인튜닝, 52만 쌍 학습, GPT-4o·HCX-3보다 GEC 우수. https://huggingface.co/sionic-ai/nllb-200-ko-gec-600M , https://arxiv.org/html/2506.11432v1 (라이선스 상용 가능 여부 확인 필요)
- **Standard Korean GEC + KAGAS 오류 유형 태깅** https://github.com/soyoung97/Standard_Korean_GEC — 데이터 비상업, 코드 MIT. 오류 분류 체계 차용 가치.
- **AI허브** 고빈도 오류 교정 데이터, **과교정 검증 데이터**(LLM 과교정 문제의 근거).
- **국립국어원**: 어문 규범 https://korean.go.kr/kornorms , 외래어 표기 API https://www.data.go.kr/data/15104999/openapi.do , 우리말샘 API, **표준 언어 예절(경어법)**.
- **kiwipiepy** https://github.com/bab2min/kiwipiepy — LGPL, `space()` 띄어쓰기 교정, 오타 교정, 종결어미(EF) 태그로 **높임 단계 판별기 자체 제작 가능**.

### B4. 규칙으로 인코딩할 한국어 비즈니스 글쓰기 관례
1. **상대 높임 단계**: 하십시오체(-ㅂ니다: 보고·상급자·고객) / 해요체(-요: 동료) / 해체(반말). 한 문서 내 혼용 감지 → 프로필 목표 단계로 통일.
2. **과잉·이중 존대**: "말씀이 계시겠습니다"(X), "커피 나오셨습니다"(사물 존대 X), 간접 높임은 신체·소유물 등에만. https://www.urimal.org/1278
3. **압존법**: 직장에서는 적용하지 않는 것이 표준 예절. https://m.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&qna_seq=308483
4. **띄어쓰기/표기**: 의존명사("할 수 있다"), "-ㄹ게요"(할께요 X), 단위·조사·수 표기.
5. **외래어 표기**: 콘텐츠/컨텐츠, 메시지/메세지 → 국립국어원 용례 룩업.
6. **보고서 개조식 vs 서술식**: "~함/~임/~음" 명사형 종결, 문서 내 혼용 금지.
7. **이메일 관례**: 호칭+인사 → 소속 소개 → 본문 → 맺음 + "OOO 드림", 제목 말머리.
8. **슬랙 관례**: 독자별 톤, 짧은 메시지 여러 개 대신 한 메시지, 스레드 사용.
9. **문어/구어 혼용**: 보고서 내 "근데/되게/진짜", 이모티콘, 개조식·서술식 혼용 탐지.

---

## C. 기술 설계 근거

### C1. 구조화 교정 출력
- Claude API `output_config.format = json_schema` 사용(순수 데이터 추출에는 tool use보다 단순). https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- 스키마 제약: minLength/pattern 등 미지원, `additionalProperties:false` 필수 → **앵커 검증은 서버 코드에서**.
- **LLM에 숫자 오프셋을 내게 하지 않는다**(환각 잦음). 대신 인용 앵커(original + context_before/after + sentence_index)를 내게 하고 서버가 위치 복원.
- 참고 포맷: LanguageTool match, Sapling edit(역순 적용 권고 https://sapling.ai/docs/api/applying-edits/ ), Harper Lint/Suggestion.
- 앵커 해소: NFC 정규화 → 정확 일치 → 문맥 소거 → 퍼지(Levenshtein ≤15%) → corrected_text와 diff-match-patch 정렬 → 폐기+로그. macOS 유래 NFD 입력 주의. https://unicode.org/reports/tr15/

### C2. 파인튜닝 없는 선호 학습
- 스타일 프로필 = 편집 가능한 자연어 규칙(scope·confidence·근거 수) + few-shot 예시(before→after).
- 선호 쌍 수집: accept / reject / edit(final) / prefer(A-B) 이벤트.
- RAG: 문장 단위 임베딩(voyage-4-lite, 다국어, 무료 한도 큼 https://docs.voyageai.com/docs/pricing ), 같은 언어·채널·격식 필터, top-k 3~5.
- 주기적 증류: 새 이벤트 ≥30개 또는 주 1회, Opus 5 Batch로 규칙 추가/강화/약화/병합/충돌 표기 → 버전 스냅샷 → 사용자 승인.
- 신뢰도: Beta(α=수락+1, β=거부+1), 반감기 60~90일 감쇠. 충돌은 scope 분할 → 안 되면 pairwise 질문.
- Pairwise A/B: 2안 나란히(위치 무작위) → Bradley-Terry 점수.

### C3. 경량 파인튜닝(보류)
- 후보: Qwen3-8B, Kanana, HyperCLOVA X SEED, EXAONE 4.0. 8B QLoRA 1만 예시 ≈ $5~30. 실제 부담은 **서빙 GPU 상시 비용**. 쌍 2k+ 축적 후 리라이트 생성기만 대체 검토.

### C4. 스택
| 항목 | 권장 |
|---|---|
| 프론트/서버 | Next.js App Router + TS + Tailwind + shadcn/ui, SSE 스트리밍 |
| 인터랙티브 모델 | `claude-sonnet-5` ($2/$10 MTok), adaptive thinking, effort low |
| 빠른 경로 | `claude-haiku-4-5` 타이핑 중 오탈자 1차 패스(캐시 최소 4,096토큰 주의) |
| 증류/평가 | `claude-opus-5` + Batch API(50% 할인) |
| DB | Postgres(Supabase/Neon) + pgvector + Drizzle. 대안 Turso 네이티브 벡터 |
| 인증 | Auth.js, 이메일 화이트리스트(단일 사용자), 스키마는 user_id 스코프 |
| 비용 | 건당 ≈ $0.02~0.03(Sonnet), 월 300회 ≈ $6~9 |

### C5. 평가
1. 운영 지표: 수락률, 정규화 편집거리(제안 vs 최종), 무수정 전송률, 리라이트 1안 채택률.
2. 홀드아웃 선호 쌍 20% 격리 → 새 프로필 버전마다 편집거리 감소해야 활성화(회귀 게이트).
3. 역사실 A/B: 요청 10%를 프로필 OFF로 생성해 순효과 분리.
4. LLM-as-judge(Opus 5, 위치 스왑 2회)는 보조. https://arxiv.org/html/2508.06374

---

## D. 종합: 빌릴 것 / 피할 것

**빌릴 것**
1. 프로필 = Grammarly Goals + DeepL 프리셋 결합. 상황 프로필마다 격식·대상·의도 기본값을 묶고 톤은 1개만.
2. Grammarly Voice의 "문서 vs 메시지 분리" + 편집 가능한 자연어 프로필(PRELUDE 방식 프롬프트 주입).
3. Apple Proofread식 변경별 이유 설명 + Original 토글, Grammarly식 Accept/Dismiss/"이런 제안 끄기"/개인 사전.
4. Wordtune/Copilot식 복수 후보 3안, 선택 자체를 pairwise 선호 신호로 저장.
5. 편집 로그를 최우선 학습 신호로. 초기 부트스트랩은 Writer처럼 샘플 300~500단어.
6. Copilot Coaching의 "수신자에게 이렇게 읽힐 수 있음" 코멘트.
7. 카카오워크 "전송 직전 다듬기" UX, 센텐시파이 교정 강도 3단계.
8. 바른한글식 오류별 근거 설명 + 국립국어원 규범 링크.
9. KAGAS식 오류 유형 태깅 → 사용자별 학습 통계 기반.
10. kiwipiepy 결정적 규칙층 + LLM 층 결합. 존대 단계 변환·이중 존대·압존법 판정을 차별점으로.

**피할 것**
1. 한국어를 2급 시민으로 두는 언어별 기능 격차.
2. Jasper/Writer식 갱신되지 않는 정적 프로필.
3. Hemingway식 크레딧 소모 UX.
4. 톤 변경 시 의미 이탈 → "사실/숫자/약속 보존" 검증 단계 필수.
5. 외부 문법 API 종속(Grammarly SDK 종료 사례). 핵심은 자체 LLM 파이프라인.
6. 네이버/다음/부산대 무료 웹 스크래핑.
7. 비상업 데이터셋(Kor-Lang8 등) 무단 사용.
8. LLM 단독 교정의 과교정·미세 오류 누락 → 규칙층 결합.
9. 개인정보 섞인 업무 메시지를 외부 무료 검사기로 전송하는 구조.
