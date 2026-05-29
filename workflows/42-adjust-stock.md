# 42 — Adjust Stock Flow

## Entry points

- Mobile: item detail → **Voorraad aanpassen** button
- Desktop: item detail → **Voorraad aanpassen** button
- Mobile home: **Voorraad aanpassen** tile → search first → item detail

## UI

- Toggle: **Delta** ↔ **Direct overschrijven**
- Number input (sign permitted in delta mode)
- Reason select (required): Ontvangen / Verbruikt / Afgekeurd / Correctie / Overig
- Note (optional)
- Confirm button

## Behavior

- No lock required (adjusting stock is separate from editing metadata)
- On submit → `POST /api/movements`
- Server uses row-level lock on the item row inside the transaction to avoid lost updates
- On success → toast confirmation, navigate back to item detail with updated stock

## Validation

- Delta mode: result must not be negative
- Overwrite mode: value must be ≥ 0
- Reason required

## Concurrency

If two users adjust stock at the same moment:
- Both reach the server
- DB transaction with `SELECT ... FOR UPDATE` on the item row
- Second one waits, then computes its delta against the (now updated) current_stock
- Both movements recorded with correct snapshots

## Display after save

- Updated `current_stock` shown
- New movement appears in the item's history
- If new stock < min_stock → low-stock badge appears immediately (TanStack Query invalidates `lowStock` query)
