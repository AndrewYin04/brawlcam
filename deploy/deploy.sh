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
# throwhands.tech has a certificate since Oct 25 1:05 AM; always serve it (Caddy renews and retries www on its own).
HOSTS="throwhands.tech, www.throwhands.tech, 144-202-71-213.sslip.io"
void_ip=$IP
echo "caddy hosts: $HOSTS"
ssh "$HOST" "echo 'BRAWL_HOSTS=$HOSTS' > /etc/default/caddy"
ssh "$HOST" 'systemctl daemon-reload && systemctl enable -q brawlcam && systemctl restart brawlcam && systemctl restart caddy'
echo "deployed $(git rev-parse --short HEAD) at $(date)"
