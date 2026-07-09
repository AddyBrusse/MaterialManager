#!/bin/sh
# Manually (re)issue the HTTPS certificate via Let's Encrypt DNS-01.
# No credentials are stored anywhere: you'll be prompted to add one TXT
# record by hand at Versio, then the cert is issued once it's visible.
#
# Run from anywhere on the NAS, roughly every 60 days (certs are valid 90).
# The very first run must happen BEFORE `docker compose up -d` starts the
# proxy, since Caddy needs a cert on disk to bind port 443.
#
# Test run without touching production certs or Let's Encrypt rate limits:
#   STAGING=1 ./renew-cert.sh
set -eu
cd "$(dirname "$0")"

if [ -f .env ]; then
  DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
  ACME_EMAIL=$(grep -E '^ACME_EMAIL=' .env | cut -d= -f2-)
fi
: "${DOMAIN:?Set DOMAIN in docker/.env, e.g. shop.example.nl}"
: "${ACME_EMAIL:?Set ACME_EMAIL in docker/.env}"

STAGING_FLAG=""
if [ "${STAGING:-}" = "1" ]; then
  echo "Using Let's Encrypt STAGING — resulting cert will NOT be browser-trusted."
  STAGING_FLAG="--test-cert"
fi

mkdir -p certs

docker run -it --rm \
  -v "$(pwd)/certs:/etc/letsencrypt" \
  certbot/certbot certonly \
  --manual --preferred-challenges dns \
  -d "$DOMAIN" \
  --email "$ACME_EMAIL" --agree-tos --no-eff-email \
  --config-dir /etc/letsencrypt --work-dir /etc/letsencrypt --logs-dir /etc/letsencrypt \
  $STAGING_FLAG

echo
echo "Certificate obtained for $DOMAIN (valid ~90 days — renew again in ~60)."

if [ -n "$(docker compose ps -q proxy 2>/dev/null)" ]; then
  echo "Reloading the proxy so Caddy picks up the new files..."
  docker compose restart proxy
else
  echo "Proxy isn't running yet. Start everything with: docker compose up -d"
fi
