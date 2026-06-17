# 21 — API Design

All routes prefixed with `/api`. JSON in/out.

## User context

Frontend sends `x-user-id: <uuid>` header on every request. Middleware loads the user and attaches `req.user`. No user → 401.

## Endpoints

### Users
- `GET    /api/users` — list (everyone can see, for dropdown)
- `POST   /api/users` — create (admin)
- `PATCH  /api/users/:id` — update (admin)
- `DELETE /api/users/:id` — delete (admin)

### Raw materials
- `GET    /api/raw-materials` — list with search/filter query params
- `GET    /api/raw-materials/:id`
- `POST   /api/raw-materials` — used when receiving (label flow)
- `PATCH  /api/raw-materials/:id` — requires lock held by caller
- `DELETE /api/raw-materials/:id` — admin only

### Finished goods
- `GET    /api/finished-goods` — list
- `GET    /api/finished-goods/:id`
- `POST   /api/finished-goods` — admin only (creating articles is admin)
- `PATCH  /api/finished-goods/:id` — requires lock
- `DELETE /api/finished-goods/:id` — admin only

### Stock movements
- `GET    /api/movements` — global log with filters
- `GET    /api/movements?itemId=...` — per item
- `POST   /api/movements` — record a movement; updates item stock; doesn't require an item lock (stock adjust is its own flow)

### Locations
- `GET    /api/locations`
- `POST   /api/locations` (admin)
- `PATCH  /api/locations/:id` (admin)
- `DELETE /api/locations/:id` (admin)

### Grades
- `GET    /api/grades`
- `POST   /api/grades` (admin)
- `PATCH  /api/grades/:id` (admin)
- `DELETE /api/grades/:id` (admin)

### Profiles
- `GET    /api/profiles`
- `POST   /api/profiles` (admin)
- `PATCH  /api/profiles/:id` (admin)
- `DELETE /api/profiles/:id` (admin)

### Labels
- `POST   /api/labels/print` — reserves 10 numbers, marks printed, returns the batch
- `GET    /api/labels?status=printed_unused` — list unused printed labels
- `POST   /api/labels/:number/consume` — when user fills in details for a received material

### Locks
- `GET    /api/locks/:itemId` — current lock state (used by polling)
- `POST   /api/locks/:itemId/acquire` — try to acquire; 409 if held by other
- `POST   /api/locks/:itemId/heartbeat` — caller must hold the lock
- `POST   /api/locks/:itemId/release` — caller releases
- `POST   /api/locks/:itemId/force-release` — admin only
- `POST   /api/locks/:itemId/request` — pings holder (in-app notification)

### Uploads
- `POST   /api/uploads/photo` — multipart, returns `{ path }`
- `POST   /api/uploads/drawing` — multipart PDF, returns `{ path }`

### Search
- `GET    /api/search?q=...&type=raw|finished&grade=...&size=...&location=...`

### Low stock
- `GET    /api/low-stock` — returns count + items under min stock

## Error format

```json
{ "error": { "code": "LOCK_HELD", "message": "Item wordt bewerkt door <name>", "details": { "userId": "..." } } }
```

Common codes: `VALIDATION`, `NOT_FOUND`, `FORBIDDEN`, `LOCK_HELD`, `LOCK_NOT_HELD`, `LABEL_TAKEN`.

## Not implemented yet

No `/api/articles`, `/api/relaties`, `/api/machines`, `/api/overhead`,
`/api/estimate`, or `/api/reservations` routes exist — these resources are
localStorage mocks on the frontend (see `backend/20-backend-overview.md`).
When building them, the endpoint shapes above (list/get/create/patch/delete,
admin-gated writes, `{ data }` / `{ error }` envelope) are still the
convention to follow.
