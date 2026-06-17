# 20 — Backend Overview

## Stack

- Node 20+
- Express
- PostgreSQL via **Prisma** (decided, see `decisions/90-decisions-log.md`) — schema at `apps/api/prisma/schema.prisma`
- Zod for validation (shared schemas)
- multer for uploads

## Folder layout

```
apps/api/src/
├── index.ts                 ← bootstrap, mount middleware + routes
├── config.ts                ← env vars, paths, port
├── db/
│   ├── client.ts            ← pg pool / prisma client
│   ├── migrations/          ← SQL or Prisma migrations
│   └── seed.ts              ← initial admin user, default profiles
├── routes/
│   ├── users.ts
│   ├── raw-materials.ts
│   ├── finished-goods.ts
│   ├── movements.ts
│   ├── locations.ts
│   ├── grades.ts
│   ├── profiles.ts
│   ├── labels.ts
│   ├── locks.ts
│   └── uploads.ts
├── services/                ← business logic (weight calc, lock state, label numbering)
├── middleware/
│   ├── error.ts
│   ├── user-context.ts      ← reads x-user-id header, attaches user to req
│   └── require-admin.ts
└── lib/                     ← helpers
```

## Conventions

- Routes thin, services hold logic
- Validate body with Zod at route entry, return 400 on fail
- Wrap async route handlers with an error helper to forward to error middleware
- All responses shape: `{ data }` on success, `{ error: { code, message, details? } }` on fail
- Status codes: 200 OK, 201 Created, 400 Validation, 403 Forbidden (non-admin), 404 Not Found, 409 Conflict (lock held), 500 Server

## Static frontend

In production, Express serves the Vite build output from `apps/web/dist` at `/`, and the API at `/api/*`.

## Newer frontend areas with no backend yet

Articles (recipe/operations/estimate), Relaties, Machines, Overhead/
Bedrijfskosten, and the Zaag calculator/reserveringen are built
frontend-first as localStorage mocks (`apps/web/src/api/articles.ts`,
`relaties.ts`, `machines.ts`, `overhead.ts`, `estimate.ts`,
`reservations.ts`) — there are no `apps/api/src/routes/*` for these yet. See
the 2026-06-15 "mock phase" entry in `decisions/90-decisions-log.md` before
adding real routes for them.
