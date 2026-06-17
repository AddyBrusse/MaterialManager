# 30 — Raw Materials

## Identity

- Code: `#NNNNN`, zero-padded, unique
- Generated from the label print flow, not from item creation directly
- Each row in `raw_materials` corresponds to one physical piece

## Fields

| Field | Source | Notes |
|---|---|---|
| code | Label batch | `#NNNNN` |
| grade | Admin-managed list | e.g. S355 |
| profile | Admin-managed list | e.g. Rond |
| dimensions | User input on receive | matches profile schema |
| length_mm | User input on receive | numeric mm |
| location | User input on receive | Rack → Row |
| photo | Camera capture | optional |
| min_stock | Optional, item-level | falls back to grade-level default if set |
| current_stock | Movements update this | starts at received quantity |

## Weight calculation

Computed on read, never stored — see `features/34-grades-profiles.md` for the
per-profile formula table and the `computeWeight` service description.

Admin can add new profiles via Settings → Materiaalbeheer → Profielen
(`ProfilesTab`). Custom (non-built-in) volume formulas remain parked.

## Stock model

`raw_materials.current_stock` is a real column (`Decimal`, default `0`) on the
`RawMaterial` Prisma model — one row per code, `current_stock` tracks the
quantity at that code (usually 0 or 1 for unique pieces, but supports grouped
identical pieces under one code).

## Lifecycle

- Created via receive flow (consume a printed label)
- Edited under lock
- Stock changed via movements
- Deleted only by admin (rare — usually marked scrapped via movement)
