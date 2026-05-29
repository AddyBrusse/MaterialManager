# 22 — Database Schema

PostgreSQL. UUIDs as primary keys (except where natural keys make sense).

## Tables

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | unique |
| role | text | enum: `admin`, `user` |
| avatar_path | text | nullable |
| created_at | timestamptz | default now |

### `locations`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| kind | text | enum: `rack`, `cabinet` |
| label | text | "Rack 1", "Kast 2" |
| created_at | timestamptz | |

### `location_slots`
The fine-grained slot. Rack→Row OR Cabinet→Shelf→Box. Single table with nullable depth.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| location_id | uuid FK locations | |
| level1 | text | row (for rack) / shelf (for cabinet) |
| level2 | text | nullable, box (for cabinet only) |
| created_at | timestamptz | |

### `grades`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | unique, e.g. "S355", "AISI 304" |
| density_kg_m3 | numeric | for weight calc |
| created_at | timestamptz | |

### `profiles`
Shape of raw material. Admin-defined.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | "Rond", "Vierkant", "Plat", "Buis" |
| dimension_schema | jsonb | declares which dimensions to ask for, e.g. `[{"key":"diameter","label":"Ø","unit":"mm"}]` |
| volume_formula | text | identifier for a built-in formula: `round`, `square`, `flat`, `tube` |
| created_at | timestamptz | |

### `raw_materials`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | text | unique, format `#NNNNN` |
| grade_id | uuid FK grades | |
| profile_id | uuid FK profiles | |
| dimensions | jsonb | matches profile.dimension_schema |
| length_mm | numeric | |
| location_slot_id | uuid FK location_slots | |
| photo_path | text | nullable |
| min_stock | numeric | nullable |
| current_stock | numeric | denormalized for fast reads; updated by movements |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Computed `weight_kg` is derived on read, not stored. Formula uses profile's `volume_formula` + `dimensions` + `length_mm` + grade's density.

### `finished_goods`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| art_no | text | unique, format `ART-NNNN` |
| name | text | |
| customer | text | nullable |
| photo_path | text | nullable |
| drawing_path | text | nullable |
| location_slot_id | uuid FK location_slots | |
| min_stock | numeric | nullable |
| current_stock | numeric | denormalized |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `stock_movements`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| item_type | text | enum: `raw`, `finished` |
| item_id | uuid | references raw_materials or finished_goods |
| user_id | uuid FK users | |
| kind | text | enum: `delta`, `overwrite` |
| amount | numeric | delta: signed; overwrite: new value |
| previous_stock | numeric | snapshot |
| new_stock | numeric | snapshot |
| reason | text | enum: `received`, `used`, `scrapped`, `correction`, `other` |
| note | text | nullable |
| created_at | timestamptz | index on this |

### `labels`
Tracks reserved/printed labels.

| Column | Type | Notes |
|---|---|---|
| number | text PK | `#NNNNN` |
| batch_id | uuid | groups 10 |
| status | text | enum: `printed_unused`, `consumed`, `voided` |
| printed_at | timestamptz | |
| printed_by | uuid FK users | |
| consumed_at | timestamptz | nullable |
| consumed_raw_material_id | uuid FK raw_materials | nullable |

### `locks`
| Column | Type | Notes |
|---|---|---|
| item_type | text | `raw` or `finished` |
| item_id | uuid | |
| user_id | uuid FK users | |
| acquired_at | timestamptz | |
| last_heartbeat | timestamptz | |
| PRIMARY KEY (item_type, item_id) | | one lock per item |

### `lock_requests`
Optional: when user B presses "Verzoek bewerken".

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| item_type | text | |
| item_id | uuid | |
| requested_by | uuid FK users | |
| created_at | timestamptz | |
| acknowledged_at | timestamptz | nullable |

## Indexes

- `raw_materials(code)` unique
- `finished_goods(art_no)` unique
- `stock_movements(item_id, created_at desc)`
- `stock_movements(created_at desc)` for global feed
- `locks(last_heartbeat)` for idle scan
- `labels(status)` partial index for unused list

## Migrations

Use Prisma migrate or `node-pg-migrate`. Decide when building.
