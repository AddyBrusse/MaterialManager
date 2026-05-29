# 12 — State Management

## Server state — TanStack Query

All data from the backend goes through TanStack Query. Lives in `apps/web/src/api/`.

- One hook per resource, e.g. `useRawMaterial(id)`, `useFinishedGoods()`, `useLock(itemId)`
- Mutations use `useMutation` and invalidate the right keys on success
- Lock polling: `useQuery` with `refetchInterval: 5000`

Query key conventions:
```
['rawMaterial', id]
['rawMaterials', { search, filters }]
['finishedGood', id]
['lock', itemId]
['movements', { itemId?, from, to }]
['lowStock']
```

## Client state — Zustand (light)

Use Zustand only for cross-cutting state that isn't server data:

- `useUserStore` — current selected user (persisted to localStorage)
- `useDeviceStore` — current device mode (mobile/desktop), updated on resize

Keep stores tiny. Anything that comes from the backend stays in TanStack Query.

## localStorage

| Key | Value |
|---|---|
| `inventaris:user` | `{ id, name, role }` of selected user |

That's it. No app preferences stored yet.
