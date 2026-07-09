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
- **`proxy`** — stock `caddy:2` image (no custom build — see below for why).
  Publishes host ports 80/443 (`HTTP_PORT`/`HTTPS_PORT` overridable). Config
  in `docker/Caddyfile` (bind-mounted, editable without restart-only reload).

## TLS / certificaten

- **Caddy terminates TLS** and reverse-proxies to `app:3000`. Port 80 serves
  only 301 redirects to the https URL.
- **Certificates are obtained manually — no automation, no credentials
  stored anywhere.** Our registrar (Versio) has no DNS-01 API, and rather
  than route around that with a third-party service or store a Versio
  account password on the NAS, certs are issued by hand via
  `docker/renew-cert.sh`:
  1. Run `./renew-cert.sh` (from `docker/`). It runs a one-off `certbot`
     container that prints a TXT record value and waits.
  2. Add that TXT record at Versio under `_acme-challenge.<DOMAIN>`, wait a
     few minutes for it to be visible, then press Enter in the terminal.
  3. certbot saves the cert under `docker/certs/live/<DOMAIN>/`; the script
     restarts the `proxy` container so Caddy picks it up. Remove the TXT
     record afterward (optional — it's inert until the next renewal).
  - Test the flow without hitting Let's Encrypt rate limits or touching a
    real cert: `STAGING=1 ./renew-cert.sh`.
  - **Not automatic**: Let's Encrypt certs are valid 90 days — re-run the
    script roughly every 60 days. Put a recurring reminder on a calendar;
    nothing in the app will warn you.
  - The very **first** run must happen before `docker compose up -d` starts
    `proxy` — Caddy needs a cert file on disk to bind port 443.
- **Caddy never talks to Let's Encrypt or any DNS API itself** — no ACME
  account state to persist, so the stock `caddy:2` image is enough (no
  `xcaddy`/custom build, unlike a fully-automated Caddy setup).
- **QNAP note**: the QTS admin UI claims 443 by default. Either move it (e.g.
  to 8443) in Control Panel → General Settings so the app can own 80/443, or
  just set `HTTP_PORT`/`HTTPS_PORT` in `docker/.env` to unused ports and skip
  touching QNAP's own admin config entirely.

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
  `ACME_EMAIL`, `HTTP_PORT`/`HTTPS_PORT`
- Never commit secrets (the DB password lives only on the NAS; there is no
  DNS/ACME credential at all with the manual renewal flow)

## Updating in prod

```
cd /share/Container/stockmanager
git pull
docker compose build        # builds app (proxy uses the stock caddy image)
docker compose up -d
```

DB upgrades automatically via migration on start.

## Backups

Parked — see `03-parked.md`.

## Health check

Expose `GET /api/health` returning `{ status: 'ok', dbConnected: true }`. Use as Docker healthcheck.
