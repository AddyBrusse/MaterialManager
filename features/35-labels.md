# 35 — Labels

## Flow

1. Admin (or user with appropriate access — TBD) clicks **Print 10 labels** in Settings
2. Backend reserves the next 10 numbers in the sequence, marks them `printed_unused`, and assembles a print job
3. Labels are printed on the Altec ATP300 (integration parked — see `03-parked.md`)
4. User physically receives material, grabs a printed label, sticks it on
5. In the app: user enters the label's `#NNNNN` number
6. App finds the `labels` row, presents the receive form (grade, profile, dimensions, length, location, photo)
7. On save, label transitions to `consumed` and links to the new `raw_materials` row

## Numbering

- Monotonic, never reused
- Source of truth: a sequence in Postgres (e.g. `CREATE SEQUENCE label_seq START 1;`)
- Format: `#` + zero-padded 5 digits (`#00001`)
- Gaps allowed (lost / discarded labels stay as `printed_unused` indefinitely, or admin marks `voided`)

## API

### `POST /api/labels/print`
- Reserves 10 sequential numbers
- Marks them `printed_unused`, sets `batch_id`, `printed_by`, `printed_at`
- Returns the batch and a print payload (for the printer integration)

### `GET /api/labels?status=printed_unused`
- For admin overview of un-consumed labels

### `POST /api/labels/:number/consume`
- Body: full raw material data (grade, profile, dimensions, length, location, photo path, initial stock)
- Transaction:
  - Insert `raw_materials` with this code
  - Update `labels.status = 'consumed'`, set `consumed_at`, `consumed_raw_material_id`
  - Insert initial `stock_movements` row with `reason = 'received'`
- 409 if label doesn't exist or already consumed

### `POST /api/labels/:number/void` (admin)
- Marks unused label as `voided`. Cannot consume afterward.

## UI

### Admin: Labels page
- Button: **Print 10 labels** (with confirm)
- Tabs: **Onbenut** | **Verbruikt** | **Ongeldig**
- Lists with batch grouping, dates, who printed

### User: Ontvangen materiaal flow
- Mobile or desktop: action **Materiaal ontvangen**
- Step 1: enter label number `#NNNNN`
- Step 2: fill receive form
- Step 3: confirm → label consumed, raw material created
