# 26 — Deployment

## Targets

- **Dev**: PC / laptop, `npm run dev` in two terminals (api + web), or root-level orchestrator
- **Prod**: QNAP TS-253D, Container Station, docker-compose

## docker-compose (prod)

Three services — see `docker/docker-compose.yml` (the source of truth):

- **`db`** — postgres:16, persistent `pgdata` volume. **Not published to the
  host**: only reachable on the compose network. Ad-hoc access:
  `docker compose exec db psql -U stockmanager`.
- **`app`** — the Express+React image (see Dockerfile below). **Not published
  to the host** either (`expose: 3000` only); reached exclusively via the proxy.
- **`proxy`** — Caddy (custom image `docker/Dockerfile.caddy`, built with the
  DNS provider module via `xcaddy`). Publishes host ports 80/443
  (`HTTP_PORT`/`HTTPS_PORT` overridable). Config in `docker/Caddyfile`
  (bind-mounted, editable without rebuild).

## TLS / certificaten

- **Caddy terminates TLS** and reverse-proxies to `app:3000`. Port 80 serves
  only 301 redirects to the https URL.
- **Let's Encrypt, DNS-01 challenge**: Caddy proves domain ownership by
  writing a TXT record via the DNS provider's API (`DNS_API_TOKEN` in
  `docker/.env`). Nothing is exposed to the internet; app stays LAN-only.
- **Renewal is automatic** — Caddy renews at ⅔ of cert lifetime, no cron.
- **`caddy_data` volume must persist**: it holds the certs and the ACME
  account. Losing it forces re-issuance and can hit Let's Encrypt rate limits.
- **First-run tip**: uncomment the staging `acme_ca` line in the Caddyfile
  while debugging DNS/token issues, then switch back and
  `docker compose restart proxy`.
- The DNS provider module is a build arg (`CADDY_DNS_MODULE`). Fallback if the
  registrar has no caddy-dns module: CNAME-delegate
  `_acme-challenge.shop.<domein>.nl` to a zone that does (e.g. free Cloudflare).
- **QNAP note**: the QTS admin UI claims 443 by default — move it (e.g. to
  8443) in Control Panel → General Settings so the app can own 80/443.

## Dockerfile

Single image builds both web and api:

1. Stage 1: install + build web (`npm ci`, `npm run build` in `apps/web`)
2. Stage 2: install + build api (`tsc` in `apps/api`)
3. Stage 3 (runtime): node:20-alpine, copy api dist + web dist, run api which serves both

## Migrations

- Run on container start (prestart script) or as a separate one-off command
- `prisma migrate deploy`

## Env

- `.env.development` — local dev
- `docker/.env` — prod values, referenced by docker-compose (git-ignored)
- Template: `docker/.env.example` — documents `DB_PASSWORD`, `DOMAIN`,
  `ACME_EMAIL`, `DNS_API_TOKEN`, `CADDY_DNS_MODULE`, `HTTP_PORT`/`HTTPS_PORT`
- Never commit secrets (the DNS API token and DB password live only on the NAS)

## Updating in prod

```
cd /share/Container/stockmanager
git pull
docker compose build        # builds app + proxy images
docker compose up -d
```

DB upgrades automatically via migration on start.

## Backups

Parked — see `03-parked.md`.

## Health check

Expose `GET /api/health` returning `{ status: 'ok', dbConnected: true }`. Use as Docker healthcheck.
