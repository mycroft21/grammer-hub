#!/usr/bin/env bash
# SQLite 백업(온라인 안전 복사) + 14일 보관. cron이 매일 돌린다. 원문이 들어 있는 파일이니 권한 600.
set -euo pipefail
APP_DIR=${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
DB="$APP_DIR/apps/web/data/grammer.db"
OUT=${BACKUP_DIR:-/var/backups/grammer-hub}
[ -f "$DB" ] || { echo "DB 없음: $DB"; exit 0; }
sudo mkdir -p "$OUT" && sudo chown "$(id -un)" "$OUT"
stamp=$(date +%F)
sqlite3 "$DB" ".backup '$OUT/grammer-$stamp.db'"
chmod 600 "$OUT/grammer-$stamp.db"
find "$OUT" -name 'grammer-*.db' -mtime +14 -delete
echo "$(date -Is) backup ok → $OUT/grammer-$stamp.db ($(du -h "$OUT/grammer-$stamp.db" | cut -f1))"
