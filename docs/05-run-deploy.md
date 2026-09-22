# 구동 · 배포 가이드 (v0.1, 2026-09-16)

> 대상: macOS(M5 32GB) 개인 사용. 슬랙 보고용.
> 결론부터: **내 Mac에서 로컬 실행이 정답**입니다. 인증이 없고 업무 메시지가 들어가므로 외부에 그대로 올리면 안 됩니다.

---

## 0. 어떤 방식을 고를까

| 방식 | 언제 | 난이도 | 비고 |
|---|---|---|---|
| **A. 내 Mac 로컬 실행** | 기본. 지금 바로 | 낮음 | 데이터가 Mac 밖으로 안 나감(클라우드 provider 쓸 때는 마스킹된 본문만 Anthropic으로) |
| **B. A + 로그인 시 자동 시작** | 매일 쓰기 시작하면 | 낮음 | launchd 등록, 브라우저 즐겨찾기로 바로 접속 |
| **C. A + 로컬 LLM** | 데이터를 아예 밖으로 안 보내고 싶을 때 | 중간 | llama-server + Gemma 4, 15GB 다운로드 |
| **D. 집 안 다른 기기에서도 접속** | 아이패드·다른 노트북에서 쓸 때 | 중간 | **인증 추가 후에만.** 현재는 비권장 |
| **E. 인터넷 배포(Vercel 등)** | 남에게 보여줄 때 | 높음 | 인증·Postgres 전환 필요. Phase 2 이후 |

---

## A. 내 Mac에서 실행하기

### A-1. 준비물 (한 번만)

```bash
# 1. Node 22 (better-sqlite3 네이티브 모듈이 메이저 버전에 묶여 있음)
node -v            # v22.x 이어야 함
# 없으면: brew install node@22   또는   nvm install 22 && nvm use

# 2. pnpm
corepack enable && corepack prepare pnpm@10 --activate

# 3. Xcode 커맨드라인 도구 (네이티브 모듈 빌드용)
xcode-select --install     # 이미 있으면 에러 메시지가 나고 넘어가면 됨
```

### A-2. 설치

```bash
git clone https://github.com/mycroft21/grammer-hub.git
cd grammer-hub
git checkout claude/grammar-correction-project-gr3qnk
pnpm install
cp .env.example .env
```

### A-3. `.env` 채우기 — 또는 화면의 **설정** 메뉴에서

터미널이 낯선 사람에게 줄 때는 `.env`를 손으로 만들지 않아도 됩니다. 서버를 띄우고(A-4) 왼쪽 메뉴 **설정**에 들어가면 아래 항목을 폼으로 바꿀 수 있고, 저장하면 루트 `.env`에 쓰이며 대부분 즉시 반영됩니다(DB 파일·사용자 이메일만 재시작 필요). API 키·토큰은 저장 후 끝 4자만 보입니다. 같은 화면 아래에 **작업 공간 프로필**(A-3″) 편집기가 있어 예시를 불러와 팀 값으로 고쳐 저장하면 됩니다. "연결 확인" 버튼은 `pnpm health --probe`와 같은 일을 합니다. 이 앱은 인증 없이 로컬에서 쓰는 단일 사용자용이라, 다른 사람에게 줄 때는 각자 자기 컴퓨터에서 설정하게 하세요.

직접 파일로 채우려면:

> `.env`는 **저장소 루트**에 둡니다(`apps/web/.env`가 아니라). 앱이 루트 `.env`를 읽도록 되어 있고, 두 곳에 다 있으면 같은 키는 루트가 이깁니다. 값 뒤의 `# 주석`은 있어도 됩니다.
>
> API 키를 아직 안 만들었고 Claude Code 구독으로 먼저 써 보고 싶으면 [C′](#c-claude-code-구독으로-테스트하기-개인용-선택)를 보세요.

```bash
ANTHROPIC_API_KEY=sk-ant-...        # https://console.anthropic.com 에서 발급
DEFAULT_PROVIDER=cloud
ALLOWED_EMAIL=croft@eximbay.com
STORE_DRAFTS=true                   # 원문을 로컬 SQLite에 저장(학습 신호용)
PII_BLOCK=                          # 비워두면 전부 마스킹 후 복원. 특정 종류를 막으려면 RRN,CARD 처럼
DATABASE_URL=file:./data/grammer.db
```

API 키가 아직 없어도 UI는 볼 수 있습니다. `.env`에 `FAKE_PROVIDER=1`을 넣으면 규칙 기반 가짜 교정으로 전체 흐름이 돌아갑니다(품질은 무의미, 흐름 확인용).

### A-4. 실행

```bash
# 개발 모드 (코드 고치면 자동 반영, 느림)
pnpm dev                    # http://localhost:3000

# 실사용 모드 (빠름, 권장)
pnpm build && pnpm start    # http://localhost:3000
```

첫 실행 때 `apps/web/data/grammer.db`가 만들어지고 프로필 6종이 자동으로 들어갑니다.

### A-3′. Jira 티켓에서 프롬프트 만들기 (선택)

프롬프트 페이지 › 만들기 › **Jira 티켓** 탭에 이슈 URL이나 키(`EP-1174`)를 넣으면, 앱이 Jira에서 제목·본문·댓글·첨부 이름을 가져와 분류(개발/리서치/…)·목표·시작점·맥락을 정리해 보여줍니다. 틀린 곳을 고치고 질문에 답한 뒤 만들면, 티켓 키가 붙은 프롬프트가 보관함에 들어갑니다.

`.env`:
```
JIRA_BASE_URL=https://xxx.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=…                  # https://id.atlassian.com/manage-profile/security/api-tokens
```

- 읽기 전용입니다(이슈 조회만). 티켓 본문은 개인정보 마스킹을 거쳐 모델에 전달되고, 보고자·담당자·댓글 작성자·멘션의 **이름은 역할명("담당자", "댓글 작성자1")으로 바뀝니다**(검토 화면의 "이름 n곳 역할명으로 바꿈"이 그 수).
- 첨부(이미지·PDF)는 읽지 않습니다. 핵심 정보가 첨부에만 있으면 "티켓 밖에 있는 정보"로 표시되고 질문으로 물어봅니다 — 그때 요약을 직접 적어 주세요.
- **질문은 최대 2개**이고 기준이 고정돼 있습니다: 저장소를 읽어서 알 수 있는 것(코드값·구현 위치·호출부·테스트 유무)은 묻지 않고 프롬프트의 "코드에서 확인할 것"으로 넘깁니다. 사람만 아는 것(어느 저장소인지, 업무 규칙·범위 결정, 첨부에만 있는 정보) 중 결과물을 바꾸는 것만 묻고, 나머지는 가정으로 두어 검토 화면에서 고치게 합니다. 검토 화면 아래 **필요 정보 장부**를 펼치면 항목마다 채움/질문/가정/코드에서 확인 중 어디로 갔고 왜 그런지 나옵니다.
- 토큰 없이 흐름만 보려면 키에 `DEMO-1`(자세한 티켓) 또는 `DEMO-2`(제목 한 줄뿐인 보안 티켓).
- 실측(Claude Code 경유): 가져오기+분류 14초, 생성 26초.

### A-3″. 작업 공간 프로필 — 매번 되돌아오는 질문을 미리 적어 두기 (선택, 권장)

"어느 저장소인가", "검증은 무엇으로 하나", "팀 규칙은 무엇인가"는 티켓마다 반복되는데 티켓에는 잘 안 적혀 있습니다. Claude Code가 저장소 안의 `CLAUDE.md`로, Codex가 `AGENTS.md`로 푸는 문제를 이 도구는 **저장소 밖**(티켓 → 프롬프트 단계)에서 풀어야 하므로, 루트에 프로필 파일 하나를 둡니다.

```bash
cp studio.workspace.example.json studio.workspace.json   # git에 올라가지 않습니다
```

| 필드 | 무엇을 적나 | 어디에 쓰이나 |
|---|---|---|
| `repos[].name` / `what` / `stack` | 저장소 이름, 한 줄 설명, 스택 | 분류·생성 프롬프트의 "작업 공간" 블록. 저장소 질문의 선택지 |
| `repos[].aliases` | 티켓에서 이 저장소를 가리키는 말 — `"[partner]"`, `"리포터"` | **코드가** 제목·라벨·컴포넌트(다음은 본문)에서 찾아 대상 저장소를 확정합니다. 확정되면 "어느 저장소?"를 묻지 않습니다 |
| `repos[].entry` | 어디부터 보면 되는지 관례 (`*.do → *Controller`) | 시작점 재료 |
| `repos[].verify` | 검증 명령 (`./gradlew test`) | 성공 기준·자기 점검 재료 |
| `repos[].notes` | 저장소별 주의 | 맥락·규칙 재료 |
| `projects` | Jira 프로젝트 키의 뜻 (`ES` = 보안 점검) | 분류 힌트 |
| `conventions` | 모든 개발 프롬프트의 규칙 후보. **5개 이하** | 모델이 이 목표에 걸리는 것만 절대 규칙으로 고릅니다 |
| `glossary` | 용어 → 뜻 | 텍스트에 나오는 용어만 넣습니다 |
| `defaults` | 실행 환경·분량·언어 기본값 | 검토 화면 초기값 |

- 파일을 고치면 서버 재시작 없이 다음 요청부터 반영됩니다(mtime 감지). 문법이 틀리면 만들기 화면 상단과 `pnpm health`에 오류가 그대로 나옵니다.
- 직접 입력 모드에서도 개발 목적을 고르면 **대상 저장소** 선택이 프로필 목록으로 뜹니다. 고르면 저장소를 묻지 않습니다.
- 다른 위치에 두려면 `.env`에 `WORKSPACE_PROFILE=경로`(루트 기준).

### A-4″. 진행 로그

교정·프롬프트 생성이 어디까지 갔는지 두 곳에서 볼 수 있습니다.

- **화면**: 진행 줄 아래 `로그 n` 을 누르면 `+0.0s 요청 보냄 → +0.9s 모델 검토 시작 → +13.2s 교정 작성 시작 → +19.9s 카드 1 · 보내드릴께요 → 보내드릴게요 → +21.5s 완료 · 21.5초 · 출력 1928토큰` 식으로 시각별 이벤트가 남습니다. 실행 중엔 자동으로 펼쳐지고, 끝나도 남아 있습니다.
- **서버 터미널(`pnpm start`)**: 실행마다 `HH:MM:SS.mmm correct    첫 카드 도착  id=79b61f87 t=+19.9s category=SPELLING` 형태로 찍힙니다. claude-cli 백엔드면 프로세스 기동·검토 시작·작성 시작·재시도·result 턴 수까지 나옵니다. `.env`에 `LOG_FILE=/tmp/grammer-hub.log`를 주면 같은 줄이 파일에도 쌓여서 `tail -f`로 볼 수 있습니다. 원문·개인정보는 로그에 넣지 않습니다(글자 수·건수만).

### A-4′. 상태 진단 — `pnpm health`

(`doctor`가 아니라 `health`인 이유: `pnpm doctor`는 pnpm 자체 명령이라 겹칩니다.)

무엇이 잘못됐는지 감이 안 올 때 먼저 돌립니다. 코드가 원격과 같은지, `.env`가 어떻게 읽히는지(어떤 백엔드로 도는지), 빌드가 마지막 커밋보다 새로운지, DB 마이그레이션, 그리고 서버가 떠 있으면 서버가 실제로 보는 설정까지 한 화면에 나옵니다.

```bash
pnpm health            # 오프라인 점검
pnpm health --probe    # 서버(localhost:3000)에 백엔드 실제 호출까지 확인 (claude --version / API 키 검증)
```

서버만 직접 보려면 `curl localhost:3000/api/health?probe=1` (비밀값은 안 나옵니다). `✘` 항목의 화살표 뒤가 해결 방법입니다.

### A-5. 확인

1. http://localhost:3000 접속
2. 슬랙에 보낼 메시지를 붙여넣고 `⌘+Enter`
3. 변경 카드가 뜨면 `a`(수락) / `x`(무시), `j`/`k`로 이동
4. `최종본 복사` 누르고 슬랙에 붙여넣기
5. http://localhost:3000/runs 에서 지연·비용 확인

---

## B. 로그인하면 자동으로 떠 있게 (launchd)

매번 터미널을 여는 게 번거로우면 등록해 둡니다.

```bash
pnpm build     # 먼저 빌드해 둘 것

mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.grammerhub.web.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.grammerhub.web</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd ~/repos/grammer-hub &amp;&amp; pnpm start</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/YOURNAME/repos/grammer-hub</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/grammerhub.log</string>
  <key>StandardErrorPath</key><string>/tmp/grammerhub.err</string>
</dict>
</plist>
PLIST

# YOURNAME과 경로를 실제 값으로 고친 뒤
launchctl load ~/Library/LaunchAgents/com.grammerhub.web.plist
```

- 중지: `launchctl unload ~/Library/LaunchAgents/com.grammerhub.web.plist`
- 로그: `tail -f /tmp/grammerhub.log`
- 코드를 고친 뒤에는 `pnpm build` 후 unload/load 하거나 `launchctl kickstart -k gui/$(id -u)/com.grammerhub.web`

**Raycast·Alfred·Safari 즐겨찾기**에 `http://localhost:3000`을 단축키로 걸어두면 슬랙 쓰다가 바로 열 수 있습니다. (Phase 2의 전역 단축키 유틸이 이걸 대체합니다.)

---

## C. 로컬 LLM 붙이기 (선택)

업무 메시지를 Anthropic에도 보내고 싶지 않을 때. M5 32GB 기준 300자 교정에 7~16초 걸립니다.

### C-1. llama.cpp 설치와 모델 받기

```bash
brew install llama.cpp          # llama-server 포함

# Gemma 4 26B-A4B (MoE) 4비트 QAT, 약 15GB
huggingface-cli download google/gemma-4-26B-A4B-it-qat-q4_0-gguf \
  --local-dir ~/models/gemma4-26b-a4b
```

### C-2. 서버 띄우기

```bash
llama-server \
  -m ~/models/gemma4-26b-a4b/*.gguf \
  -c 8192 \
  --cache-reuse 256 \
  --slot-save-path ~/models/slots \
  --swa-full \
  --port 8080
```

- `--cache-reuse`: 고정 시스템 프롬프트(약 2,500토큰)를 재사용해 매 요청 15~25초를 아낍니다. **이게 없으면 쓸 만한 속도가 안 나옵니다.**
- `--swa-full`: Gemma 계열의 슬라이딩 윈도 어텐션 때문에 필요합니다.
- `--slot-save-path`: 서버를 껐다 켜도 캐시를 복원합니다.

### C-3. 앱에서 전환

에디터 상단의 `☁ cloud · Sonnet 5` 배지를 눌러 `💻 local · Gemma 4`로 바꾸면 됩니다. 기본값을 로컬로 하려면 `.env`에 `DEFAULT_PROVIDER=local`.

로컬은 출력 토큰이 병목이라 교정문을 모델이 만들지 않고 앱이 합성하며, L3 대안도 1개만 만듭니다. 서버가 안 떠 있으면 에디터에 "클라우드로 전환" 버튼이 나오는데, **누르면 원문이 외부로 나가므로** 자동 전환은 하지 않습니다.

---

## C′. Claude Code 구독으로 테스트하기 (개인용, 선택)

API 키 없이 **이미 로그인된 Claude Code(Pro/Max)** 로 교정·프롬프트 스튜디오를 돌려 보는 옵션입니다. 앱이 `claude -p --output-format json --json-schema …`를 서브프로세스로 부릅니다.

> 언제 쓰나: 크레딧을 넣기 전에 품질을 보고 싶을 때. **기본값은 API 키**이고, 이 모드는 개인 Mac에서 본인 계정으로만 쓰세요. Anthropic은 제3자 제품에 claude.ai 로그인·한도를 제공하는 것을 허용하지 않습니다(Agent SDK 문서). 범용 배포로 가면 API 키로 돌아가야 합니다.

### 설정

```bash
which claude                  # Claude Code가 설치되어 있고 로그인돼 있어야 한다 (claude 실행 → /login)
```

`.env`:

```
CLOUD_BACKEND=claude-cli
CLAUDE_CLI_PATH=claude        # which claude 결과. launchd로 띄우면 PATH가 짧으니 절대 경로 권장
CLAUDE_CLI_MODEL=claude-sonnet-5
```

그다음 평소처럼 `pnpm start`. 에디터의 `☁ cloud` 자리에서 그대로 동작하고, 기록에는 모델이 `claude-sonnet-5`, provider가 `cloud`로 남습니다(비용은 API 요금 기준 **추정치**, 실제 청구는 구독 한도에서 차감).

### 알아둘 것

| 항목 | API 키 | claude-cli |
|---|---|---|
| 첫 카드까지 | 1~2초 | **10~20초** (프로세스 기동 1초 + 모델 검토 10초 남짓; 이후는 실시간) |
| 슬롯·카드 스트리밍 | 있음 | 있음 (stream-json의 input_json_delta를 그대로 흘림) |
| 프롬프트 캐시 | 앱이 제어 | Claude Code가 알아서 |
| 사용량 | 크레딧 차감 | Claude Code와 **같은 5시간 창** 공유 — 코딩 중 한도에 걸리면 교정도 멈춤 |
| 도구 | 없음 | 앱이 `--tools ""`로 내장 도구를 전부 끄고 MCP·스킬도 막는다. 구조화 출력용 내부 도구 1회만 허용(`--max-turns 2`) |
| 요청당 컨텍스트 | 앱 프롬프트만(약 2.5K) | 앱 프롬프트 + Claude Code 기본 프롬프트 ≈ **2K 추가**(도구를 끈 덕에 26K→2K) |

- `--bare`를 쓰지 않습니다. bare 모드는 구독 로그인을 읽지 않고 API 키를 요구하기 때문입니다. 대신 앱이 빈 임시 디렉터리에서 실행해 프로젝트 CLAUDE.md·훅이 섞이지 않게 합니다. `~/.claude`의 사용자 설정은 로드됩니다.
- "claude CLI를 찾을 수 없습니다"가 나오면 `CLAUDE_CLI_PATH`에 `which claude`의 절대 경로를 넣으세요.
- "Not logged in" 류 오류는 터미널에서 `claude`를 한 번 열어 `/login` 하면 풀립니다.
- API 키로 돌아가려면 `CLOUD_BACKEND=api`(또는 줄 삭제) 후 재시작.
- 생성이 평소보다 20~30초 더 걸리고 로그에 `구조화 출력 재시도`가 찍히면: 모델의 첫 도구 호출이 비정상(빈 인자)이어서 Claude Code가 스키마 검증에 걸린 뒤 다시 쓴 것. 앱은 재시도를 감지해 파서를 초기화하고 두 번째 출력을 쓴다. 결과 품질과 무관.
- `claude 실패(error_max_turns)`: 사용량 한도가 아니라 **앱이 건 턴 제한**입니다. 구조화 출력이 스키마 검증에 걸리면 모델이 다시 시도하는데 그 횟수가 한도를 넘은 것. 앱은 한도를 6으로 두고, 한도를 넘었어도 JSON을 받았으면 성공으로 처리합니다. 반복되면 `.env`에 `CLAUDE_CLI_LOG=/tmp/claude-cli.log`를 넣고 재시작해 원문(stream-json)을 보세요. 사용량 한도는 오류 메시지에 `사용량 창 five_hour: …`로 따로 표시됩니다.
- 설정이 먹었는지는 `pnpm health --probe` 또는 `curl localhost:3000/api/health?probe=1`에서 `"backend":"claude-cli"`, `"health":{"ok":true}`로 확인.
- 실측(2026-09-21, Claude Code 2.1.278, 세 문장 L2): 0.9초에 "모델이 검토하는 중", 13초에 "작성 중", 20초에 첫 카드, 21.5초 완료. 검토(thinking) 구간이 대부분이라 `--effort low`를 넘겨도 API 직접 호출(첫 토큰 1~2초)보다 확실히 느리다. 진행 줄이 단계·경과·예상 소요를 보여준다.

---

## D. 집 안 다른 기기에서 쓰기 — 지금은 하지 마세요

현재 인증이 없습니다. `pnpm start`는 기본적으로 모든 인터페이스에 바인딩되므로, 같은 와이파이에 있는 사람이 `http://내맥주소:3000`으로 들어오면 **내 업무 메시지와 API 키로 하는 호출을 그대로 쓸 수 있습니다.**

당장 필요하면 최소한 이것만:

```bash
# 루프백에만 바인딩 (외부에서 접속 불가)
pnpm --filter @grammer-hub/web start -H 127.0.0.1
```

다른 기기에서 정말 써야 하면 Tailscale 같은 사설망을 쓰거나, Phase 2에서 Auth.js 이메일 로그인을 붙인 뒤에 하세요.

---

## E. 인터넷 배포 — Phase 2 이후

지금 구조로는 바로 안 됩니다. 필요한 작업:

1. **인증**: Auth.js 매직링크 + 이메일 화이트리스트.
2. **DB 교체**: `better-sqlite3`는 서버리스에서 못 씁니다. Supabase/Neon Postgres로. Drizzle 스키마는 그대로 쓰고 드라이버만 바꾸면 됩니다(`packages/db/src/client.ts`).
3. **스트리밍**: Vercel 함수 타임아웃이 SSE 응답보다 짧지 않은지 확인(Pro 기준 여유 있음).
4. **개인정보**: 다른 사람 데이터를 받게 되면 처리방침과 보관 기간이 필요합니다.

남에게 보여주기만 할 거면 `FAKE_PROVIDER=1`로 띄운 데모가 더 안전합니다.

---

## 운영 메모

**백업**: DB는 파일 하나입니다. 학습 데이터가 쌓이면 이것만 챙기면 됩니다.
```bash
cp apps/web/data/grammer.db ~/Dropbox/backup/grammer-$(date +%F).db
```

**비용 확인**: 실측 비용과 수락률을 봅니다. 기획 단계 추정치(건당 ₩20~40)와 대조하세요.
```bash
node tools/report-week.mjs
```

**업데이트**:
```bash
git pull && pnpm install && pnpm build
```
DB 스키마가 바뀌면 앱 시작 시 마이그레이션이 자동 적용됩니다.

**초기화**: `rm -rf apps/web/data` 후 재시작하면 프로필 6종부터 다시 시작합니다. 학습 기록도 같이 사라집니다.

**흔한 문제**

| 증상 | 원인 · 해결 |
|---|---|
| `better-sqlite3` 설치·로드 실패 / "Could not locate the bindings file" | pnpm 10이 네이티브 빌드 스크립트를 막았거나 Node 메이저 버전이 바뀐 것. `pnpm approve-builds`에서 better-sqlite3 선택 후 `pnpm rebuild better-sqlite3` (루트 package.json의 `pnpm.onlyBuiltDependencies`에 넣어 두어 새 설치에서는 자동 승인) |
| `ANTHROPIC_API_KEY가 설정되지 않았습니다` | `.env`에 키가 없거나 서버를 재시작 안 함. `CLOUD_BACKEND=claude-cli`를 넣었는데도 나오면 코드·빌드가 오래된 것 → `git pull && pnpm install && pnpm build` 후 재시작. `pnpm health`가 어느 쪽인지 알려준다 |
| 포트 3000 충돌 | `pnpm start -p 3010` |
| 변경 카드가 안 뜸 | `/runs`에서 상태 확인. `schema_invalid`면 모델 출력 문제, `provider_unavailable`이면 키·네트워크 |
| 로컬 provider가 느림 | `--cache-reuse`를 빠뜨렸을 가능성. `/runs`의 캐시 토큰이 0이면 캐시가 안 걸린 것 |
