# 24 — Locking

## Goal

One user can edit one item at a time. Others see read-only. Show who's editing. Notify holder after 5 min idle. Admin can force-release.

## Lock lifecycle

```
acquire ──► holding ──► (heartbeat every 30s) ──► release
                │
                └─► 5 min without heartbeat → idle banner shown to holder
                            (lock still held until explicit release)
```

## API behavior

### `POST /api/locks/:itemId/acquire`
Body: `{ itemType: 'raw' | 'finished' }`

- If no row in `locks` for that item → insert with `acquired_at = now()`, `last_heartbeat = now()`, return 201
- If row exists with same `user_id` → refresh `last_heartbeat`, return 200
- If row exists with different user → return 409 with `{ error: { code: 'LOCK_HELD', details: { userId, userName } } }`

### `POST /api/locks/:itemId/heartbeat`
- Caller must hold the lock
- Updates `last_heartbeat = now()`
- 200 OK, or 409 if lock no longer held

### `POST /api/locks/:itemId/release`
- Deletes the lock row if held by caller
- 204 No Content

### `POST /api/locks/:itemId/force-release` (admin)
- Deletes the lock row regardless
- 204

### `GET /api/locks/:itemId`
Returns `{ data: null }` if no lock, else `{ data: { userId, userName, acquiredAt, lastHeartbeat, isIdle } }` where `isIdle = (now - lastHeartbeat) > 5 min`.

### `POST /api/locks/:itemId/request`
- Records a `lock_requests` row
- Holder's frontend (when polling) will see pending requests and show a toast

## Frontend behavior

### Read-only viewer
- `useQuery(['lock', itemId], { refetchInterval: 5000 })`
- If response has data and `userId !== currentUser.id` → show `<LockBanner />` with holder name and "Verzoek bewerken" button
- "Verzoek bewerken" → `POST /api/locks/:itemId/request`

### Edit mode
- On entering edit: `POST /api/locks/:itemId/acquire`
  - 201 → enter edit form
  - 409 → show error toast, stay read-only
- Heartbeat: `setInterval(30_000, () => POST /heartbeat)`
- On unmount / form save / cancel: `POST /release`
- Listen for pending lock requests via the lock poll, show a notification "X wil bewerken — vrijgeven?"

### Idle banner
- Frontend also tracks user input (any keystroke/click in the form)
- If 5 min without input → show `<Alert>` "Je bewerkt nog '<item>'. Nog steeds bezig?"
  - Buttons: "Ja, doorgaan" (resumes heartbeat) / "Vrijgeven" (releases)
- This is purely client-side UX; the lock itself doesn't auto-release

## Edge cases

- Server restart: locks persist in DB. Heartbeats from old sessions resume cleanly if frontend reconnects.
- User closes tab abruptly: lock stays. Other user sees idle (after 5 min). Admin can force-release.
- Server clock vs client clock: lock idle calculation done server-side, returned as `isIdle` boolean.
