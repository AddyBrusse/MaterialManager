# 11 — Routing

## Device detection

In `App.tsx`, detect viewport on mount and on resize:

- `window.innerWidth <= 900` (`MOBILE_BREAKPOINT`) → `<MobileLayout />`
- Otherwise → `<AppLayout />`

Each layout mounts its own `<Routes>` tree. Paths differ between mobile and
desktop (desktop uses `/voorraad`, `/artikelen`, …; mobile uses `/raw`,
`/finished`, `/movements`).

## Desktop routes (`AppLayout`)

| Path | Page | Notes |
|---|---|---|
| `/` | — | Redirects to `/voorraad` |
| `/voorraad` | `VoorraadPage` | Raw materials list, table + filters; detail/edit via drawer (not a route) |
| `/binnenboeken` | `BinnenBoekenPage` | Receive raw material — see `workflows/41-receive-material.md` |
| `/artikelen` | `ArtikelenPage` | Articles list, search + filters |
| `/artikelen/:id` | `ArtikelDetailPage` | Article detail — full page, tabs (Calculatie/Bestanden/Historie), see `features/31-items-finished.md` |
| `/relaties` | `RelatiesPage` | Customers/suppliers list |
| `/relaties/:id` | `RelatieDetailPage` | Relatie detail — tabs (Gegevens/Contacten/Artikelen) |
| `/instellingen` | `InstellingenPage` | Admin settings — Materiaalbeheer (Locaties/Kwaliteiten/Profielen) + Overhead (Bedrijfskosten/Machines) |
| `/zaagcalculator` | `ZaagCalculatorPage` | Plan saw cuts from stock |
| `/reserveringen` | `ReserveringenPage` | Reserved cut plans (badge count from `sm_zaag_reservations` in localStorage) |
| `/zaagflow` | `ZaagflowPage` | Execute reserved cuts, per-bar flow with quality checks |
| `*` | — | Redirects to `/voorraad` |

Nav is grouped into **Materiaal beheer** / **Artikelen** / **Productie** (see
`AppLayout.tsx`'s `Sidebar`/`NAV`), which also drives the topbar breadcrumb
(`ROUTE_LABELS`).

## Mobile routes (`MobileLayout`, `routes/mobile/index.tsx`)

**Status: stub, not yet built.** A Mantine `AppShell` with a bottom
`SegmentedControl` (Grondstof / Artikel / Mutaties) routes between three
placeholder pages that currently just render "nog te bouwen" (yet to be
built):

| Path | Page | Notes |
|---|---|---|
| `/` | — | Redirects to `/raw` |
| `/raw` | placeholder | Grondstoffen |
| `/finished` | placeholder | Eindproducten |
| `/movements` | placeholder | Mutaties |
| `*` | — | Redirects to `/raw` |

See `frontend/14-mobile-view.md` for the intended richer design (scan/search/
adjust) once this gets built.

## User select

Pre-route gate: if no user in the `useUserStore` (zustand `persist`,
localStorage key `stockmanager-user`), render `<UserSelectScreen />` instead
of either layout. After pick, the store persists the user and the app
re-renders into the normal layout.

## Lock-aware detail pages

**Status: backend exists, frontend not wired up yet.** `apps/api` implements
the full lock lifecycle (`backend/24-locking.md`), but no frontend route
currently queries lock state, shows a lock banner, or sends heartbeats — see
`workflows/43-edit-locking-flow.md` for the intended integration.
