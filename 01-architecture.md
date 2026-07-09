# 01 — Architecture

## High-level

```
┌─────────────────────────────────────────────────────┐
│  Browsers on LAN (PC, tablet, phone)                │
│  - Auto-detect → mobile or desktop UI                │
└─────────────────────────────────────────────────────┘
                       │ HTTPS (LAN) — https://shop.<domein>.nl
                       ▼
┌─────────────────────────────────────────────────────┐
│  QNAP TS-253D — Container Station                   │
│  ┌──────────────────────┐                           │
│  │ proxy (Caddy)        │  TLS termination,         │
│  │ :80 → redirect       │  Let's Encrypt DNS-01     │
│  │ :443 → app:3000      │                           │
│  └──────────┬───────────┘                           │
│  ┌──────────▼───────────┐  ┌──────────────────────┐ │
│  │ app                  │  │ db                   │ │
│  │ Node + Express       │──│ PostgreSQL           │ │
│  │ Serves built React   │  │ Persistent volume    │ │
│  │ /uploads volume      │  │ (not published)      │ │
│  └──────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Environments

| Env | Where | Purpose |
|---|---|---|
| dev | PC / laptop | Daily development, hot reload |
| prod | QNAP TS-253D, Container Station | Production for the shop |

Same codebase, environment selected by `.env.development` / `.env.production`.

## Network

- LAN-only (no internet exposure) — this does **not** change with HTTPS
- **HTTPS since 2026-07**: a Caddy container terminates TLS in front of the app
  (see `backend/26-deployment.md` and `decisions/90-decisions-log.md`)
- Clients reach the app at `https://shop.<companydomain>.nl` — an **internal**
  DNS A record (split-horizon) points that name at the NAS LAN IP
- Certificates: Let's Encrypt via the **DNS-01 challenge**, obtained
  **manually** roughly every 60 days (`docker/renew-cert.sh`) — no DNS/ACME
  credential of any kind is stored on the NAS or sent to any third party
- Plain-HTTP requests (old bookmarks, raw IP) get a 301 to the https URL
- Extra motivation: the future mobile scan flow (`workflows/44-mobile-scan-flow.md`)
  needs `getUserMedia`, which browsers only allow in a secure context
- Hardening bundled with the HTTPS change: Postgres (5432) and the app (3000)
  are no longer published to the LAN — only the proxy's 80/443 are

## Single-process app

The Express server hosts both:
1. REST API under `/api/*`
2. Static frontend (Vite build output) under `/`

No separate frontend server. The Caddy proxy in front is TLS-termination
only — it holds no app logic and serves no files. Simpler for 4 users on LAN.

## Realtime strategy

Polling every 5–10 seconds for lock state. No WebSocket / SSE. Picked for simplicity given user count.

## Data flow summary

- Reads: frontend → `/api` → Postgres
- Writes: frontend → `/api` → Postgres + filesystem (uploads)
- Lock heartbeat: frontend → `/api/locks/heartbeat` every ~30 sec while editing
- Lock state for read-only viewers: poll `/api/locks/:itemId` every 5–10 sec
