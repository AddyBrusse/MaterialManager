# 90 — Decisions Log

Append-only record of design choices. New entries on top.

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

---

(Template for new entries)

## YYYY-MM-DD — <Short title>
**Decision:**  
**Why:**  
**Trade-off:**
