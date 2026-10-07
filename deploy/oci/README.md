# OCI 팀 서버 배포 (sandbox-2, Ubuntu 24.04, 1 OCPU / 1GB)

맥에서 세 줄. 저장소 루트에서 실행한다(`git pull` 먼저).

```bash
KEY=~/IdeaProjects/infra/oci-study-tutor/instance_key
scp -i $KEY deploy/oci/bootstrap.sh ubuntu@161.33.32.93:
ssh -i $KEY ubuntu@161.33.32.93 'bash bootstrap.sh'          # HOST 기본값 grammer-hub.duckdns.org
```

`bootstrap.sh`가 스왑(3GB) → 패키지 → Node 22·pnpm → Caddy → iptables 80/443 → 코드(`/opt/grammer-hub`) → `.env` 초안 → 빌드 → systemd → 백업 cron까지 한다. 여러 번 실행해도 안전하다. 저장소가 비공개면 중간에 Deploy key 공개키를 찍고 멈춘다 → GitHub › Settings › Deploy keys에 읽기 전용으로 넣고 다시 실행.

끝나면 `.env`를 채운다:

```bash
ssh -i $KEY ubuntu@161.33.32.93
nano /opt/grammer-hub/.env       # ANTHROPIC_API_KEY, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, AUTH_ALLOWED_DOMAINS, AUTH_ADMIN_EMAILS
sudo systemctl restart grammer-hub
curl -s localhost:3000/api/health | python3 -m json.tool | grep -A8 '"auth"'
```

| 항목 | 값 |
|---|---|
| 주소 | https://grammer-hub.duckdns.org |
| IdP 콜백 URL | `https://grammer-hub.duckdns.org/api/auth/callback` |
| 앱 디렉터리 | `/opt/grammer-hub` (브랜치 `claude/grammar-correction-project-gr3qnk`) |
| 서비스 | `grammer-hub.service` → `127.0.0.1:3000`, 앞단 Caddy가 HTTPS |
| DB | `/opt/grammer-hub/apps/web/data/grammer.db`, 백업 `/var/backups/grammer-hub/` (매일 03:10, 14일) |
| 코드 갱신 | `ssh … '/opt/grammer-hub/deploy/oci/update.sh'` (멈춤 → 빌드 → 재시작, 1GB라 5~10분 다운타임) |
| 로그 | `journalctl -u grammer-hub -f` · `journalctl -u caddy -f` |

## 꼭 확인할 것

- **OCI 보안 리스트**: study-tutor-subnet의 인그레스에 `0.0.0.0/0 → TCP 80`, `TCP 443` 추가. 서버 iptables는 스크립트가 열지만 보안 리스트가 막혀 있으면 인증서 발급부터 실패한다.
- **DuckDNS**: `grammer-hub.duckdns.org`가 `161.33.32.93`을 가리키는지. 스크립트가 시작할 때 비교해서 다르면 경고한다.
- **구글 OAuth**(Workspace 내부 앱 권장): 승인된 리디렉션 URI에 위 콜백 URL. `OIDC_ISSUER=https://accounts.google.com`. 외부 앱으로 만들면 duckdns 도메인의 소유 확인을 요구할 수 있으니 "내부"로.
- **관리자**: `AUTH_ADMIN_EMAILS`에 본인 이메일을 넣지 않으면 설정 화면·팀 화면을 아무도 못 연다.

## 메모리 1GB

- 빌드는 서비스를 멈추고 스왑 위에서 한다(`update.sh`도 같다). 서비스는 `MemoryMax=700M`, Node 힙 512MB.
- 느리면 `free -h`, `journalctl -u grammer-hub -n 50`. OOM으로 죽으면 systemd가 3초 뒤 다시 올린다.

## 되돌리기

```bash
sudo systemctl stop grammer-hub && sudo systemctl disable grammer-hub
sudo rm /etc/systemd/system/grammer-hub.service && sudo systemctl daemon-reload
sudo systemctl stop caddy                      # 또는 /etc/caddy/Caddyfile 에서 블록 제거
crontab -l | grep -v grammer-hub | crontab -
```
