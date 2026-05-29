# 32 — Stock Movements

## Reasons (required)

- `received` — Ontvangen
- `used` — Verbruikt
- `scrapped` — Afgekeurd
- `correction` — Correctie
- `other` — Overig

## Kinds

- `delta` — signed amount added to current stock
- `overwrite` — sets current stock to a new absolute value

User picks the mode in the adjust UI.

## Recording a movement

`POST /api/movements`

```ts
{
  itemType: 'raw' | 'finished',
  itemId: string,
  kind: 'delta' | 'overwrite',
  amount: number,
  reason: 'received' | 'used' | 'scrapped' | 'correction' | 'other',
  note?: string,
}
```

Server:
1. Loads current item
2. Calculates `previous_stock`, `new_stock`
3. Validates non-negative result (reject otherwise)
4. Inserts `stock_movements` row
5. Updates `current_stock` on the item (in same transaction)
6. Returns the movement with snapshots

## Notes

- Movements do **not** require an edit lock — adjusting stock is its own flow, separate from editing metadata
- Concurrent movements: rely on DB transaction + row-level lock on the item row (`SELECT ... FOR UPDATE`) to avoid lost updates
- No deletion of movements. If a mistake is made, record a compensating `correction` movement

## Display

- Per item: `GET /api/movements?itemId=...`, paginated, newest first
- Global: `GET /api/movements`, with filters (date range, user, reason, item code)

## Low stock

After every movement, the item's stock vs `min_stock` is checked. The dashboard `GET /api/low-stock` aggregates `items where current_stock < min_stock`.
