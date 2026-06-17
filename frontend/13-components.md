# 13 — Components

## Mantine

Mantine v7 components throughout, `size="xs"`/`"sm"` for desktop density (see
`frontend/18-design-patterns.md` for modal/drawer sizing rules). Avoid custom
one-offs when Mantine has it.

## Layout (`/components/layout`)

| Component | Purpose |
|---|---|
| `AppLayout` | Desktop shell — sidebar + topbar + content, see `frontend/15-desktop-view.md` |

## Common (`/components/common`)

| Component | Purpose |
|---|---|
| `UserSelectScreen` | Full-screen user picker shown when no user in `stockmanager-user` |

## Raw materials (`/components/raw-materials`)

| Component | Purpose |
|---|---|
| `RawMaterialDrawer` | Detail/edit drawer opened from the Voorraad table |
| `RawMaterialForm` | Add/edit form (grade, profile, dimensions, length, location) |

## Articles (`/components/articles`)

| Component | Purpose |
|---|---|
| `ArticleForm` | Add/edit core article fields, Modal `size={720}` |
| `ArticleCalculator` | Cost calculator — Materialen/Bewerkingen/Uitbestedingen, see `features/38-article-calculator.md` |
| `ArticleInfoStrip` | Editable header strip on the article detail page |
| `ArticleFilesTab` | Setup-sheet attachments (Bestanden tab) |
| `ArticleHistoryTab` | Stock-movement history (Historie tab) |
| `calc-icons` | Shared icon set for the calculator UI |

## Relaties (`/components/relaties`)

| Component | Purpose |
|---|---|
| `RelatieGegevensTab` | Core relatie fields (Gegevens tab) |
| `RelatieContactenTab` | Contact persons CRUD (Contacten tab) |
| `RelatieArtikelenTab` | Articles linked to this relatie (Artikelen tab) |

## Settings (`/components/settings`)

| Component | Purpose |
|---|---|
| `MateriaalbeheerPage` | Sub-tabs: Locaties / Kwaliteiten / Profielen |
| `LocationsTab` | Locations CRUD |
| `GradesTab` | Grades CRUD (incl. `pricePerKg`) |
| `ProfilesTab` | Profiles CRUD (volume formula + dimension schema) |
| `OverheadPage` | Sub-tabs: Bedrijfskosten / Machines |
| `BedrijfskostenTab` | Overhead/Bedrijfskosten rates |
| `OverheadTab` / `MachinesTab` | Machines CRUD (rates, used by the calculator) |

## Mobile

Not built yet — `routes/mobile/index.tsx` renders placeholder text. See
`frontend/14-mobile-view.md` for the intended design.

## Rules

- Files small. If a component nears 150 lines, split it.
- No CSS modules — styling via global `st-*` classes in
  `apps/web/src/styles/tokens.css` (see `frontend/19-visual-design.md`)
- Props typed explicitly, no `any`
