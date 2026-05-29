# 26 — Deployment

## Targets

- **Dev**: PC / laptop, `npm run dev` in two terminals (api + web), or root-level orchestrator
- **Prod**: QNAP TS-253D, Container Station, docker-compose

## docker-compose (prod)

Two services:

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: inventaris
      POSTGRES_PASSWORD: <strong-password>
      POSTGRES_DB: inventaris
    volumes:
      - pgdata:/var/lib/postgresql/data
    # not exposed to host — only reachable from app

  app:
    build: .
    restart: unless-stopped
    depends_on:
      - db
    environment:
      DATABASE_URL: postgres://inventaris:<pw>@db:5432/inventaris
      NODE_ENV: production
      PORT: 3000
      UPLOADS_DIR: /data/uploads
    ports:
      - "3000:3000"
    volumes:
      - uploads:/data/uploads

volumes:
  pgdata:
  uploads:
```

## Dockerfile

Single image builds both web and api:

1. Stage 1: install + build web (`npm ci`, `npm run build` in `apps/web`)
2. Stage 2: install + build api (`tsc` in `apps/api`)
3. Stage 3 (runtime): node:20-alpine, copy api dist + web dist, run api which serves both

## Migrations

- Run on container start (prestart script) or as a separate one-off command
- Use Prisma `migrate deploy` or `node-pg-migrate up`

## Env

- `.env.development` — local dev
- `.env.production` — referenced by docker-compose
- Never commit secrets; provide `.env.example`

## Updating in prod

```
cd /share/Container/inventaris
git pull
docker-compose build app
docker-compose up -d app
```

DB upgrades automatically via migration on start.

## Backups

Parked — see `03-parked.md`.

## Health check

Expose `GET /api/health` returning `{ status: 'ok', dbConnected: true }`. Use as Docker healthcheck.
