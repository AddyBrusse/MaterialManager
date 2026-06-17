# 12 — State Management

## Server state — TanStack Query

All data goes through TanStack Query, via typed wrappers in `apps/web/src/api/`
(one module per resource: `raw-materials.ts`, `articles.ts`, `grades.ts`,
`profiles.ts`, `locations.ts`, `machines.ts`, `overhead.ts`, `relaties.ts`,
`estimate.ts`, plus `users` for the user picker).

Query keys actually in use:
```
['raw-materials']
['grades']
['profiles']
['locations']
['machines']
['articles']
['relaties']
['relaties', id]
['users']
```

Mutations call `qc.invalidateQueries({ queryKey: [...] })` on success — usually
the list key for the resource just changed (e.g. saving a Relatie contact
invalidates both `['relaties', id]` and `['relaties']`).

`['lock', itemId]` / `['movements', ...]` / `['lowStock']` are not used yet —
remove once locking/movements/low-stock are wired up, or implement them then.

## Client state — Zustand (light)

- `useUserStore` (`apps/web/src/stores/user.ts`) — currently selected user,
  persisted via `zustand/middleware persist` under localStorage key
  `stockmanager-user`. Shape: `{ user: { id, name, role } | null }`.

There is no `useDeviceStore` — device mode (mobile/desktop) is computed
inline in `App.tsx` from `window.innerWidth` on mount/resize, not stored.

## localStorage

| Key | Value |
|---|---|
| `stockmanager-user` | zustand-persisted `{ user: { id, name, role } }` |
| `sm_zaag_reservations` | Zaag calculator reservations (mock-phase data — see `decisions/90-decisions-log.md`) |

Several `apps/web/src/api/*.ts` modules (relaties, articles, estimate,
machines, overhead, reservations) are themselves localStorage-backed mocks
with no backend route yet — see the 2026-06-15 "mock phase" decision log
entry. They still go through TanStack Query so swapping in real `fetch` calls
later doesn't change calling code.
