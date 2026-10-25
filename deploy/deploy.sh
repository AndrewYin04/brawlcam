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
ssh "$HOST" 'systemctl daemon-reload && systemctl enable -q brawlcam && systemctl restart brawlcam && systemctl reload caddy || systemctl restart caddy'
echo "deployed $(git rev-parse --short HEAD) at $(date)"
