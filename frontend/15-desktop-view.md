# 15 — Desktop View

## When

Viewport width > 900px → `AppLayout` (`apps/web/src/components/layout/AppLayout.tsx`).

For pixel-level specs (colors, spacing, table/card anatomy per screen), see
`frontend/19-visual-design.md` — this doc covers structure/navigation only, to
avoid duplicating that spec.

## Layout

Custom layout (not Mantine `AppShell`) using `st-*` classes from
`apps/web/src/styles/tokens.css`:

- **Sidebar** (`st-sidebar`, left) — brand mark, org switcher, grouped nav,
  user pill + notifications icon at the bottom
- **Topbar** (`st-topbar`) — breadcrumb derived from the route
  (`ROUTE_LABELS` in `AppLayout.tsx`) + a help icon
- **Content** (`st-content`) — routed page

## Navigation groups

| Group | Items |
|---|---|
| Materiaal beheer | Voorraad, Binnen boeken, Instellingen |
| Artikelen | Artikelen, Relaties |
| Productie | Zaag calculator, Reserveringen, Zaagflow |

"Voorraad" shows a count badge (total raw-material rows). "Reserveringen"
shows a count badge read from `localStorage['sm_zaag_reservations']`.

## Pages

See `frontend/11-routing.md` for the full route table. Brief notes:

- **Voorraad** (`/voorraad`) — raw materials table; row click opens a detail
  drawer (not a route)
- **Binnen boeken** (`/binnenboeken`) — receiving workflow, see
  `workflows/41-receive-material.md`
- **Artikelen** (`/artikelen`, `/artikelen/:id`) — list + dedicated detail
  page with Calculatie/Bestanden/Historie tabs, see
  `features/31-items-finished.md` and `features/38-article-calculator.md`
- **Relaties** (`/relaties`, `/relaties/:id`) — customers/suppliers list +
  detail with Gegevens/Contacten/Artikelen tabs
- **Zaag calculator / Reserveringen / Zaagflow** — saw-cutting pipeline: plan
  cuts from stock, review reservations, execute with quality checks
- **Instellingen** (`/instellingen`, admin-gated) — tabbed:
  - **Algemeen** — org info, units, timezone
  - **Materiaalbeheer** — sub-tabs Locaties / Kwaliteiten / Profielen
    (`LocationsTab`, `GradesTab`, `ProfilesTab`)
  - **Bedrijfskosten** — `OverheadPage`, sub-tabs Bedrijfskosten / Machines
    (`BedrijfskostenTab`, `OverheadTab`)
  - **Gebruikers & rollen**, **Nummering**, **Meldingen**, **Integraties**

There is no Dashboard (`/`) or global Historie route — `/` redirects to
`/voorraad`. Per-article history lives on the article detail page's
"Historie" tab.

## Density

- Tables use the global `st-tbl` CSS class (custom, dense)
- Forms in Mantine modals/drawers use `size="sm"` (see
  `frontend/18-design-patterns.md`)
