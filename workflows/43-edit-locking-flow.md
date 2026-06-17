# 43 — Edit Locking Flow

> **Status: backend exists, frontend not wired up.** `apps/api` implements
> the lock acquire/release/request/force-release routes
> (`backend/24-locking.md`), but no frontend page currently queries lock
> state, shows `<LockBanner />`, or sends heartbeats. This doc describes the
> intended integration — implement against it when wiring up locking on the
> raw materials / article detail pages.

## User A opens an item to edit

1. Navigate to item detail
2. Page mounts → `useQuery(['lock', itemId], { refetchInterval: 5000 })`
3. Lock state: `null` (no one holds it)
4. User A clicks **Bewerken**
5. Frontend: `POST /api/locks/:itemId/acquire`
6. 201 → enter edit mode, start heartbeat interval (30s)
7. User A edits and saves
8. Save → `PATCH /api/raw-materials/:id`
9. After save, `POST /api/locks/:itemId/release`
10. Heartbeat interval cleared, return to read-only view

## User B opens the same item while A is editing

1. Page mounts → poll lock
2. Response: `{ userId: A, userName: 'Addy', isIdle: false }`
3. `<LockBanner />` shown: "Wordt bewerkt door Addy" + "Verzoek bewerken" button
4. **Bewerken** button hidden
5. User B clicks "Verzoek bewerken" → `POST /api/locks/:itemId/request`
6. Toast: "Verzoek verstuurd"

## User A receives the request

1. A's frontend (also polling) sees a `lock_requests` row pointing to this item
2. Shows notification: "Wim wil bewerken — Vrijgeven?"
3. A taps "Vrijgeven" → save (or discard) → release lock
4. B's polling picks up `lock = null` → "Bewerken" button reappears

## A walks away (idle)

1. No keystrokes/clicks for 5 minutes
2. Heartbeat still firing (it's interval-based, not input-based) — *or* heartbeat also pauses on idle (decide during build)
3. Idle banner appears on A's screen: "Je bewerkt nog 'Item X'. Nog steeds bezig?"
4. **Ja, doorgaan** → resume / **Vrijgeven** → release lock
5. If A doesn't respond, lock stays. B remains read-only.

### Design choice — heartbeat during idle

Two options to decide when building:
- **(a)** Heartbeat continues regardless of input → lock truly persists until release. Idle banner is purely a UX nudge.
- **(b)** Heartbeat pauses after 5 min idle → server-side `isIdle` becomes true after another N min → admin sees idle locks in a list, can force-release without contacting A.

Default plan: **(a)** — simpler, matches the "stays until released" decision.

## Admin force-release

1. Admin opens item, sees lock banner
2. Admin sees extra button: **Forceer vrijgeven** (only visible to admin)
3. Click → `POST /api/locks/:itemId/force-release`
4. Lock removed. A's heartbeat next-fires and gets 409 → A's frontend shows toast "Je bewerking is afgebroken door admin" and exits edit mode (revert form).
