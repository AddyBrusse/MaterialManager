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
Body: `{ itemType: 'raw' | 'finished' | 'project' }`

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

### `GET /api/locks/:itemId?itemType=raw|finished|project`
Returns `{ data: null }` if no lock, else `{ data: { userId, userName, acquiredAt, lastHeartbeat, isIdle } }` where `isIdle = (now - lastHeartbeat) > 5 min`.

### `POST /api/locks/:itemId/request`
- Records a `lock_requests` row
- Holder's frontend (when polling) will see pending requests and show a toast

## Frontend behavior

**Gebouwd voor projecten, nog niet voor grondstoffen en artikelen.**
`hooks/useProjectLock.ts` doet het hele patroon voor `/projecten/:id`:
slot nemen bij openen, heartbeat elke 30 s, vrijgeven bij sluiten, en elke
5 s pollen wie het nu heeft (`['lock', 'project', id]`). De hook krijgt een
`enabled`-vlag, zodat het hoofdvenster het slot níet claimt zolang hetzelfde
project in een losgemaakt venster open staat — dat venster houdt het slot.

Voor `raw` en `finished` bestaat de backend-lifecycle wel, maar is er nog geen
scherm dat hem gebruikt. Wat hieronder staat is het bedoelde patroon, zoals
`useProjectLock` het al invult:

### Read-only viewer
- `useQuery(['lock', itemType, itemId], { refetchInterval: 5000 })`
- Data aanwezig en `userId !== currentUser.id` → `<LockBanner />` met de naam
  van de houder en een knop "Verzoek bewerken"
- Die knop → `POST /api/locks/:itemId/request`

### Edit mode
- Bij openen: `POST /api/locks/:itemId/acquire`
  - 201 → bewerkbaar
  - 409 → melding, blijft alleen-lezen
- Heartbeat: `setInterval(30_000, …)`
- Bij unmount / opslaan / annuleren: `POST /release`

### Idle banner
- De frontend volgt zelf toetsaanslagen en kliks in het formulier
- 5 minuten zonder invoer → `<Alert>` "Je bewerkt nog '<item>'. Nog steeds
  bezig?" met "Ja, doorgaan" (heartbeat hervat) en "Vrijgeven"
- Puur clientside: het slot valt nooit vanzelf vrij

## Edge cases

- Server restart: locks persist in DB. Heartbeats from old sessions resume cleanly if frontend reconnects.
- User closes tab abruptly: lock stays. Other user sees idle (after 5 min). Admin can force-release.
- Server clock vs client clock: lock idle calculation done server-side, returned as `isIdle` boolean.
