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
- Visual reference: `C:\ClaudeProjects\ToolManager-main` (extract theme + layout when building)

## Backend

- **Express** — HTTP server
- **pg** — PostgreSQL client (or **Prisma** — TBD when building; lean toward Prisma for type-safe queries shared with frontend types)
- **Zod** — request/response validation
- **multer** — multipart uploads (photos, PDFs)

## Shared

- Monorepo with npm workspaces
- `/packages/shared` exports Zod schemas + inferred TS types used by both apps

## Repo layout (target)

```
inventaris/
├── docs/                    ← this folder
├── packages/
│   └── shared/              ← Zod schemas, shared types
├── apps/
│   ├── web/                 ← React + Vite + Mantine
│   └── api/                 ← Express + Postgres
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile
├── .env.development
├── .env.production
└── package.json             ← workspaces root
```

## Conventions

- TypeScript strict mode on, both apps
- ESLint + Prettier
- File naming: kebab-case for files, PascalCase for React components
- API responses: `{ data, error }` shape
- Dates: ISO 8601 strings on the wire, `Date` in TS
- UI language: Dutch (component labels, button text, validation messages)
- Density: high — Mantine `size="xs"` defaults where it fits, compact spacing
