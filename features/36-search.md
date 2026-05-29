# 36 — Search

## Scope

Two item types, both searchable: raw materials and finished goods.

## Search fields (mobile)

- Code (`#NNNNN` or `ART-NNNN`)
- Location (rack/row, cabinet/shelf/box names)
- Grade (raw only)
- Size (dimensions / length match — TBD how flexible)

## Search fields (desktop)

Same as mobile, plus:
- Name (finished goods)
- Customer (finished goods)
- Free-text across all fields

## Backend

`GET /api/search?q=...&type=raw|finished|all&grade=...&location=...`

- Simple approach for v1: ILIKE queries across code/name/customer + joins for grade/location names
- If perf becomes an issue, add a Postgres `tsvector` column and a GIN index later
- Response: combined list with `itemType` discriminator

## Frontend

- Single search component, debounced (~250ms)
- Results grouped by type or interleaved (decide during build)
- Tapping a result → item detail page
