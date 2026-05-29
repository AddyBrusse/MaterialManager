# 23 — Users & Roles

## No passwords

Identification only. Each request carries `x-user-id` header. Middleware loads the user from DB; missing/invalid → 401.

This is fine because:
- LAN-only deployment
- Trusted users
- No sensitive financial data

If exposed beyond LAN later, this needs upgrading (passwords or SSO).

## Roles

| Role | Capabilities |
|---|---|
| `admin` | Everything: settings (users, locations, grades, profiles, min stock, labels), force-unlock, delete items |
| `user` | Read everything, adjust stock, edit items they hold the lock for, receive material (consume labels) |

## Middleware

- `userContext`: load `req.user` from `x-user-id`. Required on all `/api/*` routes except `/api/users` GET (used for the dropdown before a user is selected).
- `requireAdmin`: 403 if `req.user.role !== 'admin'`. Applied to admin-only routes.

## Frontend

- On first load, fetch `GET /api/users` to populate the dropdown.
- After selection, store `{ id, name, role }` in `localStorage`.
- Set `x-user-id` header globally on the API client.
- Role drives:
  - Nav visibility (hide `Instellingen` for non-admin)
  - Per-action permission checks (hide buttons / show "alleen admin" hint)
  - Server still enforces, frontend just hides
