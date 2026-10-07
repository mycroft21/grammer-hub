#!/usr/bin/env bash
# 코드 갱신: 받기 → 서비스 멈춤(메모리 확보) → 설치·빌드 → 재시작 → 상태 확인. 실패하면 서비스를 다시 올린다.
set -euo pipefail
APP_DIR=${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
BRANCH=${BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}
PORT=${PORT:-3000}
cd "$APP_DIR"
before=$(git rev-parse --short HEAD)
git fetch -q origin "$BRANCH" && git pull -q --ff-only origin "$BRANCH"
after=$(git rev-parse --short HEAD)
if [ "$before" = "$after" ] && [ "${FORCE:-0}" != 1 ]; then echo "변경 없음 ($after). 강제로 다시 빌드하려면 FORCE=1"; exit 0; fi
echo "▶ $before → $after"
sudo systemctl stop grammer-hub
trap 'sudo systemctl start grammer-hub' EXIT
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=1536 pnpm build
trap - EXIT
sudo systemctl start grammer-hub
for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && { echo "▶ 올라옴: $(curl -fsS "http://127.0.0.1:$PORT/api/health" | head -c 160)"; exit 0; }; sleep 1; done
echo "! 30초 안에 응답이 없습니다: journalctl -u grammer-hub -n 50"; exit 1
