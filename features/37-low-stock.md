# 37 — Low Stock

## Definition

An item is "low stock" when `current_stock < min_stock` (and `min_stock` is set).

## Where it's set

- Per-item: `min_stock` field on `raw_materials` and `finished_goods`
- Optionally: a default at the grade level for raw materials (decide during build — start with per-item only)

## Where it surfaces

- **Sidebar nav** (desktop): "Lage voorraad" entry with badge count: `Lage voorraad (5)`
- **Dashboard**: list of low-stock items, click-through to detail
- **Item detail**: yellow inline badge "Onder minimum"

Not pushed via email or browser notifications. In-app only.

## API

### `GET /api/low-stock`
Returns:
```ts
{
  data: {
    count: number,
    items: Array<{
      itemType: 'raw' | 'finished',
      id: string,
      code: string,
      name: string,
      currentStock: number,
      minStock: number,
    }>
  }
}
```

Frontend polls this (e.g. every 60s) or refetches after movements via TanStack Query invalidation.
