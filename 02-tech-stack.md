# 02 — Tech Stack

## Runtime

- **Node.js** — LTS (>=20)
- **npm** — package manager
- **PostgreSQL** — 16+

## Frontend

- **React** + **TypeScript**
- **Vite** — build tool, dev server
- **Mantine** — UI components (latest v7)
- **React Router** — routing
- **Zod** — validation (shared with backend)
- **TanStack Query** — server state, caching, polling
- Visual reference: `frontend/19-visual-design.md` plus the implementation in
  `apps/web/src/theme/index.ts` and `apps/web/src/styles/tokens.css`. The
  extraction from ToolManager is done; that project needn't be revisited

## Backend

- **Express** — HTTP server
- **Prisma** — ORM + migrations against PostgreSQL (decided, see `decisions/90-decisions-log.md`)
- **Zod** — request/response validation
- **multer** — multipart uploads (photos, PDFs)

## Shared

- Monorepo with npm workspaces, package names `@stockmanager/web`, `@stockmanager/api`, `@stockmanager/shared`
- `/packages/shared` exports Zod schemas + inferred TS types used by both apps, imported as `@stockmanager/shared`

## Repo layout

```
StockManager/
├── 00-overview.md … 03-parked.md   ← docs (this repo root)
├── frontend/ · backend/ · features/ · workflows/ · decisions/
├── packages/
│   └── shared/              ← Zod schemas, shared types (@stockmanager/shared)
├── apps/
│   ├── web/                 ← React + Vite + Mantine
│   └── api/                 ← Express + Prisma + Postgres
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile
├── .env.development         ← gitignored, zie .env.example
└── package.json             ← workspaces root
```

## Conventions

- TypeScript strict mode on, both apps
- ESLint + Prettier
- File naming: kebab-case for files, PascalCase for React components
- API responses: `{ data }` on success, `{ error: { code, message, details? } }` on failure
- Dates: ISO 8601 strings on the wire, `Date` in TS
- UI language: Dutch (component labels, button text, validation messages)
- Density: high — Mantine `size="xs"` defaults where it fits, compact spacing
