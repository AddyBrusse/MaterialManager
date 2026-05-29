# 33 — Locations

## Model

Two top-level kinds:

- `rack` → has rows (level1)
- `cabinet` → has shelves (level1) → has boxes (level2)

Single `locations` table for the top-level container (rack/cabinet) and a `location_slots` table for the fine-grained slot.

A raw material references a `location_slots.id` of kind rack/row.  
A finished good references a `location_slots.id` of kind cabinet/shelf/box.

## Admin UI

In Settings → Locaties:

- Tabbed: **Rekken** | **Kasten**
- Rack tab: list of racks, each editable to add/remove rows
- Cabinet tab: list of cabinets, each editable to add shelves; each shelf editable to add boxes

## Location picker (used on item forms)

A cascading select component:

- Raw material: `<Select>` rack → `<Select>` row
- Finished good: `<Select>` cabinet → `<Select>` shelf → `<Select>` box

Shows occupied slots greyed out (or as a hint), since one item = one location and box = atomic.

## Display

Format consistently:
- Raw: `R1 / R2` (rack 1, row 2) or `Rack 1 — Rij 2`
- Finished: `K1 / S3 / B12` or `Kast 1 — Plank 3 — Bak 12`

Decide canonical format during build.
