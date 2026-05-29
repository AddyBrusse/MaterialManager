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

Computed on read, never stored. Formula depends on profile.

| Profile | Formula (volume in mm³) |
|---|---|
| `round` | `π × (Ø/2)² × length` |
| `square` | `side² × length` |
| `flat` | `width × thickness × length` |
| `tube` | `π × ((OD/2)² − (ID/2)²) × length` |

Convert to m³ (`/ 1e9`), multiply by `grade.density_kg_m3`, return kg with 2 decimals.

Admin can add new profiles. Each profile declares:
- `dimension_schema` (jsonb): which fields to ask the user for
- `volume_formula`: identifier the backend recognizes. For new profiles, allow `custom` with a stored formula string evaluated server-side (parked — start with the four above).

## Stock model

Even though each raw material row is a unique physical piece, `current_stock` exists because:
- Sometimes you have multiple identical pieces grouped under one code (decide during build whether each piece is its own row or a code = quantity)
- TBD during build — current default: one code = one piece, `current_stock` is 0 or 1

Confirm with Addy when starting the data model.

## Lifecycle

- Created via receive flow (consume a printed label)
- Edited under lock
- Stock changed via movements
- Deleted only by admin (rare — usually marked scrapped via movement)
