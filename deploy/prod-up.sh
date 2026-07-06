#!/bin/sh
# Bring Helio production back to life after ANY interruption
# (Docker quit, sleep, reboot). Idempotent — safe to run when
# everything is already up. Usage:  ./deploy/prod-up.sh
set -e
cd "$(dirname "$0")/.."

echo "1/5 Docker daemon…"
if ! docker info > /dev/null 2>&1; then
  open -a Docker
  until docker info > /dev/null 2>&1; do
    printf "."
    sleep 2
  done
  echo " up"
else
  echo "   already running"
fi

echo "2/5 Stack…"
docker compose --env-file .env.production.local -p helio-prod up -d --wait --wait-timeout 180

echo "3/5 Demo host (caddy)…"
docker start helio-demo-caddy > /dev/null 2>&1 || echo "   caddy container missing — see runbook §3"

echo "4/5 Tunnel…"
launchctl kickstart gui/"$(id -u)"/com.helio.tunnel 2>/dev/null || \
  launchctl load ~/Library/LaunchAgents/com.helio.tunnel.plist 2>/dev/null || true

echo "5/5 Sleep blocker…"
pgrep -f "caffeinate -sim" > /dev/null || (nohup caffeinate -sim > /dev/null 2>&1 &)

echo "Verifying public URLs…"
sleep 3
for url in https://api.dineshbhadane.com/health https://helio.dineshbhadane.com/login https://demo.dineshbhadane.com/; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "$url")
  echo "  $code  $url"
done
echo "Done. All three should read 200."
