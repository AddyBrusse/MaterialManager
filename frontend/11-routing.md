# 11 — Routing

## Device detection

In `App.tsx`, detect viewport on mount and on resize:

- `window.matchMedia('(max-width: 900px)')` → mobile
- Otherwise → desktop

The detection picks which `<Routes>` tree to mount. No URL prefix change — paths can differ between mobile and desktop trees.

## Desktop routes

| Path | Page | Notes |
|---|---|---|
| `/` | Dashboard | Recent activity, low-stock summary |
| `/grondstof` | Raw materials list | Table, search, filters |
| `/grondstof/:id` | Raw material detail | Edit, lock-aware |
| `/artikelen` | Finished goods list | Search, filters |
| `/artikelen/:id` | Finished good detail | Edit, lock-aware, PDF viewer |
| `/historie` | Global stock movement log | Filter by date, user, item |
| `/instellingen` | Settings (admin only) | Tabbed: users, locations, grades, profiles, min stock |
| `/instellingen/labels` | Print labels (admin only) | Reserve and print batches of 10 |

## Mobile routes

| Path | Page | Notes |
|---|---|---|
| `/` | Mobile home | Big buttons: Scan, Zoeken, Voorraad aanpassen |
| `/scan` | Camera scan view | Manual code entry fallback |
| `/zoek` | Search | By code, location, grade, size |
| `/item/:id` | Item view | Toggle summary/full detail, adjust button |
| `/item/:id/aanpassen` | Adjust stock | Delta/overwrite toggle |

## User select

Pre-route gate: if no user in localStorage, show `<UserSelect />` overlay regardless of route. After pick, save to localStorage and continue.

## Lock-aware detail pages

Detail pages query lock state on mount (and poll). If locked by another user → read-only mode with banner. If user opens edit explicitly → acquire lock, start heartbeat.
