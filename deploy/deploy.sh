#!/usr/bin/env bash
# Build locally and push the frontend and server bundle to the Vultr VM.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${DEPLOY_HOST:-brawlvm}
npm run build >/dev/null
rsync -az --delete dist/ "$HOST:/srv/brawlcam/dist/"
rsync -az --delete dist-server/ "$HOST:/srv/brawlcam/dist-server/"
rsync -az server/certs/ "$HOST:/srv/brawlcam/certs/"
rsync -az deploy/Caddyfile "$HOST:/etc/caddy/Caddyfile"
rsync -az deploy/brawlcam.service "$HOST:/etc/systemd/system/brawlcam.service"
# Only ask for certificates for throwhands.tech once its DNS points here (failed ACME attempts get rate-limited).
IP=144.202.71.213
HOSTS="144-202-71-213.sslip.io"
for d in throwhands.tech www.throwhands.tech; do
  if [ "$(dig +short "$d" @1.1.1.1 | tail -1)" = "$IP" ]; then HOSTS="$d, $HOSTS"; fi
done
echo "caddy hosts: $HOSTS"
ssh "$HOST" "echo 'BRAWL_HOSTS=$HOSTS' > /etc/default/caddy"
ssh "$HOST" 'systemctl daemon-reload && systemctl enable -q brawlcam && systemctl restart brawlcam && systemctl restart caddy'
echo "deployed $(git rev-parse --short HEAD) at $(date)"
