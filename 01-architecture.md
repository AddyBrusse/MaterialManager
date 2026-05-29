# 01 — Architecture

## High-level

```
┌─────────────────────────────────────────────────────┐
│  Browsers on LAN (PC, tablet, phone)                │
│  - Auto-detect → mobile or desktop UI                │
└─────────────────────────────────────────────────────┘
                       │ HTTP (LAN)
                       ▼
┌─────────────────────────────────────────────────────┐
│  QNAP TS-253D — Container Station                   │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ app                  │  │ db                   │ │
│  │ Node + Express       │──│ PostgreSQL           │ │
│  │ Serves built React   │  │ Persistent volume    │ │
│  │ /uploads volume      │  │                      │ │
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

- LAN-only for now (no internet exposure)
- No HTTPS required initially (consider later if ever exposed)
- Clients reach the app at `http://<qnap-ip>:<port>`

## Single-process app

The Express server hosts both:
1. REST API under `/api/*`
2. Static frontend (Vite build output) under `/`

No nginx, no separate frontend server. Simpler for 4 users on LAN.

## Realtime strategy

Polling every 5–10 seconds for lock state. No WebSocket / SSE. Picked for simplicity given user count.

## Data flow summary

- Reads: frontend → `/api` → Postgres
- Writes: frontend → `/api` → Postgres + filesystem (uploads)
- Lock heartbeat: frontend → `/api/locks/heartbeat` every ~30 sec while editing
- Lock state for read-only viewers: poll `/api/locks/:itemId` every 5–10 sec
