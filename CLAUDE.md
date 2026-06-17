# CLAUDE.md — StockManager

## What this repo is

**StockManager** — an internal inventory app for a small CNC shop (~4 users). Docs and code live together in this directory.

## Read these first (in order)

1. [00-overview.md](./00-overview.md) — scope, users, glossary
2. [01-architecture.md](./01-architecture.md) — deployment topology (QNAP NAS, single Express process, LAN-only)
3. [02-tech-stack.md](./02-tech-stack.md) — stack, monorepo layout, conventions
4. Then the area you're working on (see index below)

## Monorepo layout

```
StockManager/
├── packages/shared/     ← @stockmanager/shared — Zod schemas + inferred TS types
├── apps/web/            ← @stockmanager/web — React + Vite + Mantine (Dutch UI, high density, xs sizing)
├── apps/api/            ← @stockmanager/api — Express + Prisma + Postgres
├── docker/
└── package.json         ← npm workspaces root, package "stockmanager"
```

Docs live at the repo root (this file, `00`-`03`, `frontend/`, `backend/`,
`features/`, `workflows/`, `decisions/`) — not under a `docs/` subfolder.

## Key decisions already made

- **No passwords** — user picked from dropdown, stored in `localStorage`
- **No WebSocket** — polling every 5–10 s for lock state (simple enough for 4 users)
- **Single Express process** serves both API (`/api/*`) and built frontend (`/`)
- **UI language: Dutch** — all labels, buttons, validation messages
- **Mantine v7**, `size="xs"` as default density
- **Zod** shared between frontend and backend via `@stockmanager/shared`
- **ORM**: Prisma (decided 2026-05-29, see `decisions/90-decisions-log.md`)
- **Response shape**: `{ data }` on success, `{ error: { code, message, details? } }` on failure
- **Weight** is computed on read (never stored) from profile formula + dimensions + grade density
- **Newer feature areas** (articles/relaties/machines/overhead/zaag) are
  built frontend-first as localStorage mocks before their backend routes
  exist — see the 2026-06-15 "mock phase" decision and
  `backend/20-backend-overview.md`

## Building rules

- TypeScript strict mode everywhere
- Routes thin, services hold business logic
- Components ≤ ~150 lines — split when larger
- All server state via TanStack Query + typed API wrappers in `apps/web/src/api/`
- Forms: Mantine `useForm` with a `validate` map (Dutch messages) — see `frontend/16-forms-validation.md`
- File naming: kebab-case files, PascalCase React components
- Log any non-obvious architectural choice in `decisions/90-decisions-log.md`

## Reference UI

Theme/layout extraction from `C:\ClaudeProjects\ToolManager-main` is done —
the result is `frontend/19-visual-design.md` (tokens, spec) plus
`apps/web/src/theme/index.ts` and `apps/web/src/styles/tokens.css`
(implementation). Use those as the reference now; ToolManager itself
shouldn't need revisiting.

## Doc index

| Area | Files |
|---|---|
| Backend | `backend/20-backend-overview.md` · `21-api-design.md` · `22-database-schema.md` · `23-users-roles.md` · `24-locking.md` · `25-file-storage.md` · `26-deployment.md` |
| Frontend | `frontend/10-frontend-overview.md` · `11-routing.md` · `12-state-management.md` · `13-components.md` · `14-mobile-view.md` · `15-desktop-view.md` · `16-forms-validation.md` · `17-styling-theme.md` · **`18-design-patterns.md`** ← code patterns · **`19-visual-design.md`** ← visual spec (read before touching UI) |
| Features | `features/30-items-raw.md` · `31-items-finished.md` · `32-stock-movements.md` · `33-locations.md` · `34-grades-profiles.md` · `35-labels.md` · `36-search.md` · `37-low-stock.md` · **`38-article-calculator.md`** ← calculator modal/UI patterns |
| Workflows | `workflows/40-user-flows.md` · `41-receive-material.md` · `42-adjust-stock.md` · `43-edit-locking-flow.md` · `44-mobile-scan-flow.md` |
| Decisions | `decisions/90-decisions-log.md` |
| Parked | `03-parked.md` — things not decided yet, do not implement |
| Newer areas (no doc yet) | Relaties: `api/relaties.ts`, `components/relaties/`, `routes/desktop/Relaties*Page.tsx` · Machines/Bedrijfskosten: `components/settings/{OverheadPage,OverheadTab,MachinesTab,BedrijfskostenTab}.tsx` · Zaag calculator/Reserveringen/Zaagflow: `routes/desktop/{ZaagCalculatorPage,ReserveringenPage,ZaagflowPage}.tsx` · Binnen boeken: `routes/desktop/BinnenBoekenPage.tsx` (see `workflows/41-receive-material.md` status note) |

## Sub-agent tips

When spawning sub-agents for parallel work (e.g. scaffold API routes while building frontend):
- Give the agent the relevant doc section(s) to read first
- The `packages/shared` Zod schemas must be defined before either app imports them
- Build order: shared → api (DB + routes) → web (pages + hooks)
