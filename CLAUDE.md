# CLAUDE.md — StockManager

## What this repo is

**StockManager** — an internal inventory app for a small CNC shop (~4 users). Docs and code live together in this directory.

## Read these first (in order)

1. [00-overview.md](./00-overview.md) — scope, users, glossary
2. [01-architecture.md](./01-architecture.md) — deployment topology (QNAP NAS, single Express process, LAN-only)
3. [02-tech-stack.md](./02-tech-stack.md) — stack, monorepo layout, conventions
4. Then the area you're working on (see index below)

## Monorepo target layout

```
inventaris/
├── packages/shared/     ← Zod schemas + inferred TS types (source of truth for both apps)
├── apps/web/            ← React + Vite + Mantine (Dutch UI, high density, xs sizing)
├── apps/api/            ← Express + Postgres
├── docker/
└── package.json         ← npm workspaces root
```

## Key decisions already made

- **No passwords** — user picked from dropdown, stored in `localStorage`
- **No WebSocket** — polling every 5–10 s for lock state (simple enough for 4 users)
- **Single Express process** serves both API (`/api/*`) and built frontend (`/`)
- **UI language: Dutch** — all labels, buttons, validation messages
- **Mantine v7**, `size="xs"` as default density
- **Zod** shared between frontend and backend via `@shared` workspace package
- **ORM**: lean toward Prisma for type safety, but document the choice in `decisions/90-decisions-log.md`
- **Response shape**: `{ data }` on success, `{ error: { code, message, details? } }` on failure
- **Weight** is computed on read (never stored) from profile formula + dimensions + grade density

## Building rules

- TypeScript strict mode everywhere
- Routes thin, services hold business logic
- Components ≤ ~150 lines — split when larger
- All server state via TanStack Query + typed API wrappers in `apps/web/src/api/`
- Forms: Mantine `useForm` + Zod resolver
- File naming: kebab-case files, PascalCase React components
- Log any non-obvious architectural choice in `decisions/90-decisions-log.md`

## Reference UI

`C:\ClaudeProjects\ToolManager-main` — extract theme config and layout patterns from here when building the frontend.

## Doc index

| Area | Files |
|---|---|
| Backend | `backend/20-backend-overview.md` · `21-api-design.md` · `22-database-schema.md` · `23-users-roles.md` · `24-locking.md` · `25-file-storage.md` · `26-deployment.md` |
| Frontend | `frontend/10-frontend-overview.md` · `11-routing.md` · `12-state-management.md` · `13-components.md` · `14-mobile-view.md` · `15-desktop-view.md` · `16-forms-validation.md` · `17-styling-theme.md` · **`18-design-patterns.md`** ← code patterns · **`19-visual-design.md`** ← visual spec (read before touching UI) |
| Features | `features/30-items-raw.md` · `31-items-finished.md` · `32-stock-movements.md` · `33-locations.md` · `34-grades-profiles.md` · `35-labels.md` · `36-search.md` · `37-low-stock.md` |
| Workflows | `workflows/40-user-flows.md` · `41-receive-material.md` · `42-adjust-stock.md` · `43-edit-locking-flow.md` · `44-mobile-scan-flow.md` |
| Decisions | `decisions/90-decisions-log.md` |
| Parked | `03-parked.md` — things not decided yet, do not implement |

## Sub-agent tips

When spawning sub-agents for parallel work (e.g. scaffold API routes while building frontend):
- Give the agent the relevant doc section(s) to read first
- The `packages/shared` Zod schemas must be defined before either app imports them
- Build order: shared → api (DB + routes) → web (pages + hooks)
