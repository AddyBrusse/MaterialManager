# 90 — Decisions Log

Append-only record of design choices. New entries on top.

---

## 2026-06-22 — Mock phase ended: build straight against the DB from now on

**Decision:** The 2026-06-15 "build frontend-first as localStorage mocks"
pattern is retired. As of this date the localStorage→PostgreSQL backend
migration (Prisma models + API routes for Machine, Relatie, Article, Project,
ZaagReservering, Company, DocSequence) is fully applied to the dev database.
All new feature work — including finishing out the still-mock-backed corners
of relaties/machines/overhead/zaag — goes straight to the real stack:
`@stockmanager/shared` Zod schema → Prisma model/migration → `apps/api` route
→ frontend wired to the real endpoint. No new localStorage-only modules.

**Why:** The mock phase existed to unblock UI iteration while backend schema
was still being designed. That blocker is gone; continuing to mock would just
add reconciliation work later.

**Trade-off:** None notable — existing mock-backed modules still have a
localStorage *fallback* for offline resilience (per the write-through cache
pattern from the backend migration), but localStorage must no longer be the
*primary* store for anything new.

---

## 2026-06-15 — Calculator line items edit via confirm-gated modal, not inline

**Decision:** Adding or editing a Materialen/Bewerkingen/Uitbestedingen line in
the article calculator opens a shared `NodeEditModal` (one component, keyed by
`{ type, mode }`) holding a **draft copy** of the node. The underlying `nodes`
array is only touched on explicit **OK** (`confirmModal`); **Cancel**/X discards
the draft. The modal cannot be dismissed via outside-click or Escape
(`closeOnClickOutside={false}`, `closeOnEscape={false}`) — only the two footer
buttons. Double-clicking a row, or its new edit-pencil icon (placed left of the
existing trash icon), opens the modal pre-filled for editing.

To avoid duplicating the grade/profile/machine config UI, `MaterialConfig` and
`MachineConfig` gained `embedded?: boolean` and `size?: 'xs' | 'sm'` props: they
render compactly (`xs`, with their own header) inline in a `Popover`, or as a
plain section (`sm`, no header — the modal supplies Dividers/title) inside the
modal.

**Why:** Prevents accidental edits from sticking on misclicks/Escape, and gives
each line item a focused, properly-sized (`size="sm"`) form instead of cramped
inline `xs` popover fields — while reusing the same config components for both
contexts.

**Trade-off:** One extra click to add a line item (modal confirm instead of
instant insert); mitigated by sensible defaults pre-filled in the draft.

Full pattern writeup: `features/38-article-calculator.md`.

---

## 2026-06-15 — New feature areas built frontend-first as localStorage mocks

**Decision:** Relaties, Articles (+ recipe/estimate), Machines, Overhead/Bedrijfskosten
and Reserveringen were all built as frontend-only features first: their
`apps/web/src/api/*.ts` modules (`relaties.ts`, `articles.ts`, `estimate.ts`,
`machines.ts`, `overhead.ts`, `reservations.ts`) read/write `localStorage`
directly, with no corresponding `apps/api` routes or Prisma models yet. This is
the same "mock phase" pattern already noted for article attachments
(2026-06-04), generalised across these modules.

**Why:** Lets the UI/UX for these larger feature areas (calculator, relaties,
machine/overhead settings, saw pipeline) be iterated quickly without blocking
on backend schema design. Matches CLAUDE.md build order in spirit but inverted
for exploratory frontend work.

**Trade-off:** No persistence beyond the browser, no multi-user sharing of this
data yet, and the `@stockmanager/shared` Zod schemas for these entities may
drift from whatever Prisma models are eventually designed (see
`backend/22-database-schema.md`). When building the real backend for these
areas, follow CLAUDE.md's `shared → api → web` order and reconcile the mock
shapes with the new schemas rather than assuming they're final.

---

## 2026-06-04 — Articles are make-to-stock manufactured products (MES-bound)
**Decision:** An article is a product we manufacture in-house to stock, not a passive
catalog entry. The data model carries a **structured recipe** (raw profile + grade +
dimensions + length-per-piece, referencing the existing grades/profiles), an **operations**
list (routing, tags for now), **setup data** (workholding + general notes, plus attachments:
NC files tagged by machine, images, drawings, documents), and stock levels. Destination is a
light MES (routing detail, production runs, time tracking) built in later layers.
**Why:** Matches the real intent ("op voorraad maken om levertijd te verkorten") and lets an
article later feed the saw pipeline (calculator → reservations → planner → zaagflow).
**Trade-off:** Bigger model than the original simple catalog; built incrementally.

## 2026-06-04 — Article detail is a dedicated route, not a drawer
**Decision:** Article detail lives at `/artikelen/:id` (full page), unlike raw materials
(side drawer). Add/edit of core fields stays a drawer.
**Why:** An article's detail is a cockpit (recipe, routing, setup sheet, production history,
drawing viewer) — too much for a 440–520px drawer. Starting as a page avoids a later migration.

## 2026-06-04 — Setup attachments: metadata-only in the mock phase
**Decision:** Article setup files (NC/images/drawings/documents) are stored as **metadata**
(name, kind, size, machine tag) — not bytes — until the backend/uploads dir exists. `path`
is reserved for the real file location. Setup notes (opspanning/algemeen) are fully stored.
**Why:** No working API yet; localStorage can't hold real NC/PDF/photo bytes.
**Trade-off:** No download/preview of file contents until the upload backend lands.

---

## 2026-05-29 — Prisma as the ORM

**Decision:** `apps/api` uses Prisma (schema + migrations) against PostgreSQL,
resolving the "pg vs Prisma — TBD" note in `02-tech-stack.md`.
**Why:** Type-safe queries, schema-as-code migrations, good fit for the
`@stockmanager/shared` Zod-types-on-both-sides approach.
**Trade-off:** Prisma's generated types are DB-shape, not always identical to
the Zod schemas in `packages/shared` — watch for drift (e.g. `Grade.pricePerKg`
exists in the Zod schema but not yet in `schema.prisma`).

---

## 2026-05-22 — Lock release policy
**Decision:** Locks stay until explicitly released by holder or force-released by admin. No auto-release after idle.  
**Why:** Simpler model. Admin as safety net for forgotten locks.  
**Trade-off:** If holder forgets and goes home, item stays locked until admin acts next day.

## 2026-05-22 — Realtime: polling, not WebSocket
**Decision:** Frontend polls `/api/locks/:itemId` every 5–10s. No WebSocket / SSE.  
**Why:** 4 concurrent users. Polling cost is trivial. Setup cost saved.  
**Trade-off:** Up to 10s lag between lock change and other users seeing it. Acceptable.

## 2026-05-22 — PostgreSQL, not SQLite
**Decision:** Use PostgreSQL.  
**Why:** Matches ToolManager. Addy's preference. Better concurrency story for stock movements (`SELECT ... FOR UPDATE`).  
**Trade-off:** Extra container in deployment.

## 2026-05-22 — Single app process serves API + static frontend
**Decision:** Express serves built React under `/`, API under `/api`. No nginx.  
**Why:** 4 users on LAN. Nginx adds ops complexity for no gain.

## 2026-05-22 — User identification by header, no passwords
**Decision:** `x-user-id` header on every request. User selected from dropdown, persisted to localStorage.  
**Why:** LAN-only, trusted users, small team.  
**Caveat:** If ever exposed beyond LAN, this must be replaced.

## 2026-05-22 — Mobile vs desktop routed separately
**Decision:** Auto-detect viewport, mount different route trees. Not just responsive CSS.  
**Why:** Mobile is a subset focused on scan/lookup/adjust. Different UX, different pages.  
**Threshold:** ~900px viewport width.

## 2026-05-22 — Files on filesystem, paths in DB
**Decision:** Photos and PDFs stored in `/data/uploads/...`, DB stores relative paths.  
**Why:** Easier backup, lighter DB, simple to serve as static.

## 2026-05-22 — Weight is computed, not stored
**Decision:** `weight_kg` calculated on read from profile + dimensions + length + grade density.  
**Why:** Single source of truth. Grade density changes propagate automatically.

## 2026-05-22 — Label numbers via Postgres sequence
**Decision:** Use a Postgres sequence for label numbers. Reserve on print, mark `printed_unused` → `consumed` or `voided`.  
**Why:** Monotonic, race-free, simple.  
**Trade-off:** Gaps possible (lost labels stay unused indefinitely or admin marks voided).

## 2026-05-22 — Adjust stock does NOT require edit lock
**Decision:** Stock movements bypass the per-item edit lock.  
**Why:** Stock adjust is the primary shop-floor action. Locking it would block production. Concurrency handled at DB-row level instead.

## 2026-07-02 — Todo email reminders deferred to v2
**Decision:** The new shared Todo board ships with a `notifyOnDue` boolean field (unused in v1) but no actual email sending. Due-date reminders wait until v2.  
**Why:** The existing M365 mail integration (`graph-mail.ts`) is interactive/delegated-only — it needs a logged-in browser session to pop up an MSAL consent prompt. A background reminder job would need new server-side app-only Graph credentials (client secret, admin-consented app permissions), which is a bigger and more security-sensitive change than this feature warranted.  
**Trade-off:** `notifyOnDue` ships now specifically so v2 needs no new migration — just wiring, once the credentials question is revisited.

## 2026-07-02 — Todo "claim" is a lightweight toggle, not an assignment
**Decision:** Any of the 4 users can claim or unclaim any open todo (`PATCH /api/todos/:id/claim`); there's no hard "assigned to" field, no permission check beyond being a logged-in user.  
**Why:** This is a shared shop-wide board, not per-user task management — the goal is visibility into who's picked something up, not enforcing ownership.

## 2026-07-02 — Operational alerts computed live, never stored
**Decision:** Low-stock / due-date-risk / production-overrun alerts on the Todo page (`utils/todoAlerts.ts`) are computed client-side on every fetch from already-loaded data (raw materials, finished goods, projects, articles) — never written as rows to the `todos` table.  
**Why:** This app has no scheduler (single Express process, no cron), so a periodic "insert an alert row" job wasn't feasible without new infrastructure. Live computation is always accurate and self-clears the instant the underlying condition resolves — it also mirrors how low-stock indicators already work elsewhere in the app (client-side from `minStock`/`currentStock`, not the parked `/api/low-stock` endpoint).  
**Trade-off:** Alerts aren't visible/actionable unless someone has the Todo page open; a "Zet als taak" button lets a user convert one into a real, trackable Todo row on demand.

---

(Template for new entries)

## YYYY-MM-DD — <Short title>
**Decision:**  
**Why:**  
**Trade-off:**
