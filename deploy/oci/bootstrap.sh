#!/usr/bin/env bash
# Grammar Hub 팀 서버 부트스트랩 — Ubuntu 24.04, 메모리 1GB VM(OCI VM.Standard.E2.1.Micro) 기준. 여러 번 실행해도 안전하다.
#
#   사용(서버에서, ubuntu 사용자로):   bash bootstrap.sh                       # 기본 HOST=grammer-hub.duckdns.org
#                                    HOST=grammar.example.com bash bootstrap.sh   # 다른 도메인. 다시 실행하면 Caddy 설정만 바뀐다
#                                    HOST= bash bootstrap.sh                 # 도메인이 없으면 비워서 <ip-with-dashes>.sslip.io 로
#   HOST는 이 서버의 공인 IP를 가리키고 있어야 한다(DuckDNS면 사이트에서 IP를 갱신). 아니면 Caddy가 인증서를 못 받는다.
#
# 하는 일: 스왑 → 패키지 → Node 22 + pnpm → Caddy(HTTPS) → 방화벽 80/443 → 코드 받기 → .env 초안 → 빌드 → systemd → 백업 cron
# 끝나면 .env 에 채울 값과 IdP에 등록할 콜백 URL을 알려 준다. 비밀값은 이 스크립트가 만들지 않는다(AUTH_SECRET만 생성).
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/mycroft21/grammer-hub.git}
REPO_SSH=${REPO_SSH:-git@github.com:mycroft21/grammer-hub.git}
BRANCH=${BRANCH:-claude/grammar-correction-project-gr3qnk}
APP_DIR=${APP_DIR:-/opt/grammer-hub}
SWAP_GB=${SWAP_GB:-3}
PORT=${PORT:-3000}
APP_USER=$(id -un)
export DEBIAN_FRONTEND=noninteractive
BOOTSTRAP_LOG=${BOOTSTRAP_LOG:-$HOME/bootstrap.log}

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# DPkg::Lock::Timeout은 dpkg 잠금만 기다린다. 부팅 직후 apt-daily(자동 업데이트)가 잡는 목록 잠금은 기다리지 않고 바로 실패하므로 직접 기다린다
wait_apt() {
  local i=0
  while sudo fuser /var/lib/apt/lists/lock /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
    [ "$i" -eq 0 ] && log "자동 업데이트(apt)가 끝나길 기다리는 중"
    i=$((i + 1))
    [ "$i" -lt 120 ] || { warn "10분이 지나도 apt 잠금이 풀리지 않습니다. 잠시 뒤 다시 실행하세요."; exit 1; }
    sleep 5
  done
}
apt_get() { wait_apt; sudo -E apt-get -o DPkg::Lock::Timeout=600 -y -q "$@"; }

if [ "$(id -u)" = 0 ]; then warn "root가 아니라 일반 사용자(ubuntu)로 실행하세요. 필요한 곳만 sudo를 씁니다."; exit 1; fi

# 실행할 때마다 같은 로그 파일에 이어 쓴다(다시 실행해도 이전 기록이 남는다)
exec > >(tee -a "$BOOTSTRAP_LOG") 2>&1
printf '\n===== %s bootstrap 시작 =====\n' "$(date -Is)"

# ── 0. 호스트 이름 ──
PUBLIC_IP=$(curl -fsS --max-time 5 https://api.ipify.org || curl -fsS --max-time 5 https://ifconfig.me || true)
HOST=${HOST-grammer-hub.duckdns.org}
if [ -z "$HOST" ]; then
  [ -n "$PUBLIC_IP" ] || { warn "공인 IP를 알 수 없습니다. HOST=... 를 직접 주세요."; exit 1; }
  HOST="$(echo "$PUBLIC_IP" | tr . -).sslip.io"
fi
log "호스트: https://$HOST  (공인 IP $PUBLIC_IP, 앱 디렉터리 $APP_DIR, 브랜치 $BRANCH)"
RESOLVED=$(getent ahostsv4 "$HOST" | awk 'NR==1{print $1}' || true)
if [ -n "$PUBLIC_IP" ] && [ "$RESOLVED" != "$PUBLIC_IP" ]; then
  warn "$HOST 가 ${RESOLVED:-아무 데도} 를 가리킵니다(이 서버는 $PUBLIC_IP). DNS를 먼저 맞추지 않으면 HTTPS 인증서 발급이 실패합니다. 계속 진행합니다 — DNS가 맞으면 Caddy가 알아서 재시도합니다."
fi

# ── 1. 스왑 (1GB 메모리에서 next build 가 죽지 않게) ──
if ! swapon --show --noheadings | grep -q '^/swapfile'; then
  log "스왑 ${SWAP_GB}GB 만들기"
  sudo fallocate -l "${SWAP_GB}G" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/90-grammer-hub.conf >/dev/null
  sudo sysctl -q -p /etc/sysctl.d/90-grammer-hub.conf
else
  log "스왑 있음: $(swapon --show --noheadings | awk '{print $1, $3}')"
fi

# ── 2. 패키지 ──
log "패키지 설치"
apt_get update
apt_get install git curl ca-certificates gnupg build-essential python3 openssl sqlite3 debian-keyring debian-archive-keyring apt-transport-https

# ── 3. Node 22 + pnpm (better-sqlite3 네이티브 모듈이 Node 메이저에 묶여 있어 22 고정) ──
if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  log "Node 22 설치"
  wait_apt   # NodeSource 설치 스크립트도 안에서 apt-get update를 부른다
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  apt_get install nodejs
fi
sudo corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@10 --activate >/dev/null
log "node $(node -v) · pnpm $(pnpm -v)"

# ── 4. Caddy (HTTPS 자동 인증서 + 리버스 프록시) ──
if ! command -v caddy >/dev/null; then
  log "Caddy 설치"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt_get update
  apt_get install caddy
fi

# ── 5. 방화벽: OCI Ubuntu 이미지는 iptables로 22번만 연다. 80/443을 맨 앞에 넣고 저장 ──
log "방화벽 80/443 열기"
for p in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save >/dev/null; else apt_get install iptables-persistent >/dev/null && sudo netfilter-persistent save >/dev/null; fi
warn "OCI 콘솔의 보안 리스트(study-tutor-subnet)에도 0.0.0.0/0 → TCP 80, 443 인그레스가 있어야 밖에서 보입니다."

# ── 6. 코드 ──
if [ ! -d "$APP_DIR/.git" ]; then
  log "저장소 받기"
  sudo mkdir -p "$APP_DIR" && sudo chown "$APP_USER:$APP_USER" "$APP_DIR"
  if git ls-remote --exit-code -h "$REPO_URL" >/dev/null 2>&1; then
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  else
    # 비공개 저장소: 이 서버의 ssh 키를 GitHub Deploy key(읽기 전용)로 등록해야 한다
    [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -C "grammer-hub@$HOST" -f ~/.ssh/id_ed25519 >/dev/null
    export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"
    if ! git ls-remote --exit-code -h "$REPO_SSH" >/dev/null 2>&1; then
      warn "저장소가 비공개라 Deploy key가 필요합니다. 아래 공개키를 https://github.com/mycroft21/grammer-hub/settings/keys 에 '읽기 전용'으로 추가한 뒤 이 스크립트를 다시 실행하세요."
      echo; cat ~/.ssh/id_ed25519.pub; echo
      exit 2
    fi
    git clone --branch "$BRANCH" "$REPO_SSH" "$APP_DIR"
  fi
fi
cd "$APP_DIR"
git fetch -q origin "$BRANCH"
git checkout -q "$BRANCH"
git pull -q --ff-only origin "$BRANCH"
log "코드 $(git rev-parse --short HEAD) ($(git log -1 --format=%cd --date=short))"

# ── 7. .env 초안 ──
if [ ! -f .env ]; then
  log ".env 만들기 (.env.example 기반)"
  cp .env.example .env
  sed -i "s|^APP_URL=.*|APP_URL=https://$HOST|" .env
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:./data/grammer.db|" .env
  chmod 600 .env
  ENV_NEW=1
else
  grep -q "^APP_URL=https://$HOST" .env || sed -i "s|^APP_URL=.*|APP_URL=https://$HOST|" .env
  ENV_NEW=0
fi

# ── 8. 설치·빌드 (서비스는 멈추고 — 1GB에서 빌드와 서버를 같이 돌리면 OOM) ──
sudo systemctl stop grammer-hub 2>/dev/null || true
log "의존성 설치"
pnpm install --frozen-lockfile
log "빌드 (1GB VM에서 5~10분, 스왑을 씁니다)"
NODE_OPTIONS=--max-old-space-size=1536 pnpm build

# ── 9. systemd + Caddy ──
log "systemd 서비스"
sed -e "s|@APP_DIR@|$APP_DIR|g" -e "s|@APP_USER@|$APP_USER|g" -e "s|@PORT@|$PORT|g" -e "s|@PNPM@|$(command -v pnpm)|g" deploy/oci/grammer-hub.service | sudo tee /etc/systemd/system/grammer-hub.service >/dev/null
sudo systemctl daemon-reload
# 로그인 모드는 OIDC 세 값이 모두 있을 때만 켜진다(env.ts authEnabled). 꺼진 채 공개되면 설정 화면(.env 쓰기)까지 누구나 쓸 수 있으므로,
# 세 값이 비어 있으면 서비스를 끄고 부팅 때도 뜨지 않게 해 둔다. update.sh도 꺼진(disabled) 서비스는 다시 올리지 않는다.
# 값 뒤의 "# 주석"과 따옴표·공백은 dotenv처럼 무시하고 비었는지만 본다.
env_set() { [ -n "$(sed -nE "s/^$1=//p" .env | tail -1 | sed -E 's/(^|[[:space:]]+)#.*$//; s/[[:space:]"'\'']//g')" ]; }
if env_set OIDC_ISSUER && env_set OIDC_CLIENT_ID && env_set OIDC_CLIENT_SECRET; then
  sudo systemctl enable --now grammer-hub >/dev/null
  AUTH_READY=1
else
  sudo systemctl disable --now grammer-hub >/dev/null 2>&1 || true
  AUTH_READY=0
  warn "OIDC_ISSUER · OIDC_CLIENT_ID · OIDC_CLIENT_SECRET 중 비어 있는 값이 있어 서비스를 시작하지 않았습니다(로그인 없이 공개되는 것을 막기 위해)."
fi
log "Caddy: https://$HOST → 127.0.0.1:$PORT"
sed -e "s|@HOST@|$HOST|g" -e "s|@PORT@|$PORT|g" deploy/oci/Caddyfile | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl enable caddy >/dev/null 2>&1 || true
sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy

# ── 10. 백업 cron (매일 03:10, 14일 보관) ──
chmod +x deploy/oci/backup.sh deploy/oci/update.sh
( crontab -l 2>/dev/null | grep -v 'deploy/oci/backup.sh' ; echo "10 3 * * * $APP_DIR/deploy/oci/backup.sh >> /var/tmp/grammer-hub-backup.log 2>&1" ) | crontab -

# ── 11. 확인 ──
if [ "$AUTH_READY" = 1 ]; then
  for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
  HEALTH=$(curl -fsS "http://127.0.0.1:$PORT/api/health" || echo '{}')
  log "상태: $(echo "$HEALTH" | python3 -c 'import json,sys; h=json.load(sys.stdin); c=h.get("cloud",{}); a=h.get("auth",{}); print(f"backend={c.get(\"backend\")} ready={c.get(\"ready\")} · login={\"on\" if a.get(\"enabled\") else \"off\"} admins={a.get(\"admins\")} · build={ (h.get(\"build\") or {}).get(\"id\") }")' 2>/dev/null || echo "$HEALTH" | head -c 200)"
fi

cat <<MSG

────────────────────────────────────────────────────────────
주소          https://$HOST
IdP 콜백 URL  https://$HOST/api/auth/callback     ← 구글/Okta/Azure 앱 등록의 리디렉션 URI에 이 값
.env          $APP_DIR/.env  (지금 상태: $([ "$ENV_NEW" = 1 ] && echo "새로 만듦 — 아래 값을 채우세요" || echo "기존 파일 유지"))

채울 것:  ANTHROPIC_API_KEY · OIDC_ISSUER · OIDC_CLIENT_ID · OIDC_CLIENT_SECRET
         AUTH_ALLOWED_DOMAINS(예: example.com) · AUTH_ADMIN_EMAILS(본인 이메일 — 비우면 설정 화면을 아무도 못 엽니다)
채운 뒤:  $([ "$AUTH_READY" = 1 ] && echo "sudo systemctl restart grammer-hub" || echo "sudo systemctl enable --now grammer-hub   ← 서비스가 아직 꺼져 있습니다")
         (.env를 직접 고친 값은 재시작해야 반영됩니다. 화면의 설정 메뉴로 바꾼 값만 즉시 반영)
코드 갱신: $APP_DIR/deploy/oci/update.sh
로그:     journalctl -u grammer-hub -f        인증서·프록시: journalctl -u caddy -f
설치 로그: $BOOTSTRAP_LOG (실행할 때마다 이어 씀)
────────────────────────────────────────────────────────────
MSG
