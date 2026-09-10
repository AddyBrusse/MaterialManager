# 90 — Decisions Log

Append-only record of design choices. New entries on top.

---

## 2026-07-21 — Kanban and Gantt planning boards removed; Wachtrij is now the only planning board

**Decision:** Deleted `PlanningKanbanPage`/`components/planning-kanban/*`/`planningKanbanUtils.ts` and `PlanningGanttPage`/`components/planning-gantt/*`, plus their routes (`/planning-kanban`, `/planning-gantt`), nav entries, and popout registrations. Also removed the already-orphaned `/planning` route (`PlanningPage.tsx`) — a third, older weekly-grid planner that was unreachable from nav/breadcrumb/popout even before this change — and its sole backend dependent, the `unplanOrder` API wrapper and `POST /projects/:id/orders/:orderId/unplan` route.

This reverses the original Wachtrij design brief (`01-design files claude design/design_handoff_planning_page/README.md`), which explicitly scoped the page as *"additive — runs alongside the existing Kanban board and Gantt board during a trial period... nothing here should be understood as replacing those."* By 2026-07-21 Wachtrij covered everything both boards did (queue reordering, cascade-impact warnings, the SPT/EDD/LPT suggest-schedule optimizer, `notBefore` holds) and more, so the trial is concluded here in favor of Wachtrij. Two real but minor capabilities have no Wachtrij equivalent and were accepted as a loss rather than ported: Kanban's minimap (fast-scrub a long board) and free-form date-drop (place a job on any arbitrary date rather than by queue position), and Gantt's cross-board search box.

Wachtrij and Prognose (`PrognosePage.tsx`, kept) both depended on primitives that lived in the now-deleted boards' files, so those were extracted rather than deleted wholesale:
- `planningGanttUtils.ts` → pruned to just the genuinely shared pieces (`buildStapItems`, `effectiveMachine`, `todayIndex`, the day-index/calendar-window scheme, ghost/forecast workload) and renamed `planningSharedUtils.ts`, since none of what's left is Gantt-specific anymore.
- `tekeningFor` (from `planningKanbanUtils.ts`) moved into `planningUtils.ts`.
- CSS: `planning-gantt.css`/`planning-kanban.css` defined Wachtrij's toolbar/KPI-strip/timeline-node/connector/queue-card look (`planning-queue.css` said so outright: *"gets the Gantt board's toolbar/kpi/node/connector primitives... for free"*) and Prognose's heatmap/bar-chart/tooltip styling. The shared toolbar/kpi/node/card rules were folded into `planning-queue.css`; the Prognose-only rules were split into a new `prognose.css`. Both keep the original `.pg-root` scoping (a shared "planning page shell" marker) rather than going unscoped, since that scoping was a deliberate choice to keep these intentionally-generic class names (`.seg`, `.tgl`, `.node`, `.kc`, `.kpi`, …) from colliding with unrelated pages.
- `planningUtils.ts` also lost several functions that were only ever used by the now-deleted `/planning` page (`weekDagen`, `formatDagHeader`, `berekenCelCapaciteit`/`CelCapaciteit`, `deadlineDagen`, `deadlineKleur`, `berekenMachineWeekCap`, `vindAchterstanden`, `heeftVolgordeWaarschuwing`, `projectenOpDatum`, `berekenOffertebelasting`/`OfferteLastItem`) — dead code once that page went, verified via grep before removal.

**Why:** User request, after the Wachtrij timeline was found to silently hide overlapping jobs on the same machine (fixed separately with per-row lane-stacking in `QueueTimeline.tsx`) — prompted a review of whether Kanban/Gantt were still pulling their weight now that Wachtrij had matured. Consolidating onto one planning board also removes an entire class of bug the multi-board setup enabled: Kanban/Gantt wrote `geplandDatum` directly with no collision-awareness, while only Wachtrij's own reorder path (`computeRelockedDates`) kept a machine's queue collision-free — so a job scheduled via Kanban or Gantt could silently overlap one placed via Wachtrij.

---

## 2026-07-20 — 100×100 artikel preview thumbnails on Offerte/Opdracht/Productie/Paklijst/Factuur rows; STEP preferred over PDF

**Decision:** Added a 100×100px preview thumbnail (STEP 3D render, PDF drawing as fallback) between the "Art. No." and "Omschrijving" columns on Offerte and Opdrachtbevestiging line-item tables, added matching "Art. No." + thumbnail columns to Paklijst and Factuur (which didn't carry `artikelId` on their regel types — resolved via a join: `PaklijstRegel` → `productieOrderId` → `ProductieOrder.artikelId`; `FactuurRegel` → `offerteRegelId` → the accepted offerte's `OfferteRegel.artikelId`), and put it in the `ProductieOrder` card header (no regel table there to insert a column into).

- STEP wins over PDF when an article has both, per explicit user preference — a 3D render identifies a part better than a 2D drawing at thumbnail size. See `resolveArtikelPreviewSource` in `apps/web/src/utils/artikelPreview.ts`.
- New dependency: `pdfjs-dist`, used only to rasterize a PDF drawing's first page to a canvas — nothing else in the app renders existing PDFs (only generates them).
- STEP thumbnails reuse the WASM/geometry cache already built for the interactive `StepViewer` (`apps/web/src/components/planning-queue/stepGeometry.ts`, extracted out so both share it), but render **once** and dispose immediately — no `requestAnimationFrame` loop or `OrbitControls`, unlike the interactive viewer. A table can list many rows each needing a STEP preview; a live 60fps WebGL context per row would be real CPU/battery/context-limit cost for no benefit on a static thumbnail.
- `OfferteTab.tsx` and `OpdrachtbevestigingTab.tsx` previously carried a byte-for-byte duplicated 12-column table (the OB file's own comment said as much) — extracted into a shared `RegelsTable.tsx` rather than pasting the new column into both.

**Why:** Rows were pure text — no visual way to recognize a part at a glance across any of the five order-lifecycle stages.


## 2026-07-20 — Wachtrij job nodes lock their derived start date instead of re-simulating from "today" every render

**Decision:** `deriveShopSchedule` (`apps/web/src/utils/planningQueueUtils.ts`) is a whole-shop forward simulation whose per-machine cursor always started at day-offset `0` — i.e. "windowStart" ("today", `new Date()` recomputed on every page load). The Wachtrij board/timeline/KPIs used this simulation directly for rendering and never read the already-existing `stap.geplandDatum` field, unlike the Kanban and Gantt boards, which position blocks straight from that persisted date. Net effect: the first job in every machine's queue always rendered as starting "today" regardless of what day it actually was, and everything downstream cascaded off that — the whole board visibly drifted forward by however many days had passed since the last reorder, every time the page reloaded or the day rolled over.

Fixed by giving `deriveShopSchedule` an opt-in `honorLockedDates` mode: when true, a job with a stored `geplandDatum` uses that as its anchor (converted to a day-offset) instead of the live cursor — `machineFree` is deliberately *not* used as a floor for a locked job (it's just an init sentinel for the first job in a queue, not a real constraint, and clamping to it would drag an overdue locked job back to "today", reproducing the exact bug). Cross-machine predecessor gating (`predFinish`) and `notBefore` still apply as real constraints on top of the lock. The live board (`PlanningQueuePage.tsx`'s `schedule` used by `QueuePanel`/`QueueTimeline`/KPIs) now calls with `{ honorLockedDates: true }`; `computeSuggestOptions`/`computeCascadeImpact` (hypothetical "what if" previews) keep the default `false` — they must ignore stale locks to show the true impact of a proposed reorder.

New helper `computeRelockedDates(queues, changedMachines, machines, windowStart)` computes the date each job should be committed to right after a real change: jobs on an untouched machine pass through unchanged (so reordering one machine never re-anchors an unrelated machine's already-locked jobs to "today"); jobs on a changed machine get a fresh simulated date; a cross-machine dependent picks up a fresh date too only if its predecessor's finish genuinely shifted. `assignToMachine`/`commitAssign` (drag-drop) and `applySuggestOption` (Suggest-schedule modal) both call this and persist every job whose committed date actually changed via the existing `projectsApi.planStap`, replacing the old logic that just reused `stap.geplandDatum ?? toDateStr(new Date())` as a placeholder.

**Why:** User-reported ("job nodes keep shifting in time, like the startdate is always today") and verified live against seeded data before the fix landed — jobs with a stored `geplandDatum` of `2026-07-16`/`2026-07-17` rendered at day-offset `0` (2026-07-20, "today") instead of their real dates. Confirmed fixed the same way: after the change, the same jobs render at `startOffsetDays: -4`/`-3`, exactly matching their stored dates.

**No schema/migration needed** — reused the `geplandDatum` field that already existed on `ProductieStap` and was already the "committed planned date" concept everywhere else (Kanban, Gantt); Wachtrij was the only surface not reading it.

## 2026-07-17 — Article attachments (drawings, step-files, NC-programs) stored per-article-folder under `UPLOADS_DIR`, real bytes now

**Decision:** `ArticleFilesTab` previously only stored attachment *metadata* (name/size, `path: null`) — a "backend not built yet" stub. Built the real upload path: `POST/DELETE /api/uploads/attachment/:articleId` (`apps/api/src/routes/uploads.ts`) writes to `UPLOADS_DIR/attachments/{articleId}/{timestamp}-{sanitizedName}`, one folder per article, and returns the path already prefixed `/uploads/...` so it's directly usable as a URL (served by the existing `express.static(config.uploadsDir)` mount — no new serving route needed). No new upload subtype per file kind (NC/drawing/step/photo/other) — one generic `/attachment` route for all of them, since `ArticleAttachment.kind` already carries that distinction client-side.

Planning → Wachtrij's node-details panel (`QueueDetails` → `StepFileViewer`) resolves an order's real `.step`/`.stp` files by looking up its article's `attachments` and filtering by extension — replacing an earlier hardcoded demo file used to build the three.js/`occt-import-js` viewer itself.

**Why:** This was the explicit ask — wire the 3D preview to real per-order files — plus reuse the same storage system when the app moves to the QNAP NAS ([[00-overview]], [[01-architecture]]), matching the existing "files on filesystem, paths in DB" decision below instead of inventing a second convention.

**Migration path to NAS:** the *only* thing that changes is `config.uploadsDir` (`apps/api/src/config.ts`, `UPLOADS_DIR` env var — currently defaults to local `./uploads`). Point it at a mounted NAS share and every route, the static mount, and every already-stored `attachment.path` keep working unchanged — no code change, no data migration. The per-article folder layout (`attachments/ART-0002/…`) is also deliberately browsable directly over SMB from the NAS side, not just through the app.

**Trade-off:** No thumbnail/preview generation server-side — the browser (three.js/occt-import-js for STEP, `<img>` for photos) does all rendering client-side from the raw uploaded file. Fine at 4-user LAN scale; would need revisiting if files got large enough that client-side parsing became slow.

## 2026-07-09 — Certificate renewal is manual: no DNS/ACME credential stored anywhere

**Decision:** Superseding the acme-dns entry directly below (same day):
after reviewing it, the user rejected sending *any* credential — even one
scoped to a single meaningless TXT record — to a public third-party service
they have no relationship with. Certificates are now obtained **manually**
via `docker/renew-cert.sh`: a one-off `certbot --manual --preferred-challenges
dns` container prints a TXT value, a human adds it at Versio by hand, presses
Enter, and the resulting cert files are bind-mounted into Caddy. Caddy itself
now runs the **stock `caddy:2` image** — no `xcaddy` build, no DNS module, no
ACME account, since it never talks to Let's Encrypt or any DNS API itself.
`docker/Dockerfile.caddy` was deleted.

**Why not the alternatives:**
- *Self-hosted acme-dns on the NAS* — considered and offered, but rejected:
  it would need port 53 open to the internet, which — while a narrow,
  purpose-built responder rather than the app itself — is still a new
  inbound exposure the user didn't want to take on.
- *Traefik + Versio's native API* — rejected earlier the same day once
  checked: Versio's REST API authenticates with the **actual account login
  password** (same one used at versio.nl), not a scoped token. That's a
  *broader* credential on the NAS than acme-dns's single-purpose token would
  have been, not narrower.
- *HTTP-01 challenge* — would require port 80 reachable from the public
  internet, contradicting the LAN-only requirement from the start.

**Trade-off accepted knowingly:** renewal is no longer automatic. Let's
Encrypt certs last 90 days; the script should be re-run roughly every 60.
Nothing in the app warns when a cert is close to expiring — this depends on
a human remembering (a calendar reminder is recommended in
`backend/26-deployment.md`). If this proves unreliable in practice, revisit
either the self-hosted-acme-dns or Traefik options above rather than letting
certs silently expire.

**How to apply:** Full script + runbook in `docker/renew-cert.sh` and
`backend/26-deployment.md` ("TLS / certificaten"). The very first cert must
be obtained before `docker compose up -d` starts `proxy`, since Caddy needs
a cert file on disk to bind port 443.

---

## 2026-07-09 — Versio has no Caddy DNS module: delegate the challenge via acme-dns

**Note (superseded same day):** this entry's acme-dns approach was replaced
by fully manual renewal — see the entry above. Kept for the reasoning trail
(why Cloudflare/Traefik were rejected first) rather than deleted.

**Decision:** Our registrar is **Versio**. Checked both the `caddy-dns`
module registry (97 providers) and the underlying `libdns` library directly
against the GitHub API — **neither has a Versio module**, so the plan below
("DNS provider module... `caddy-dns/transip`") doesn't work as originally
written. Fix: delegate just the ACME challenge to the
[acme-dns](https://github.com/joohoi/acme-dns) service (public instance at
`auth.acme-dns.io`) via `caddy-dns/acmedns`, instead of a direct provider
token. `docker/Caddyfile`, `docker/Dockerfile.caddy`, `docker/.env.example`,
and `docker/docker-compose.yml` were updated accordingly (`DNS_API_TOKEN` →
`ACMEDNS_USERNAME`/`PASSWORD`/`SUBDOMAIN`/`SERVER_URL`).

**Why acme-dns over the alternatives considered:**
- *Full Cloudflare account + CNAME* (the fallback this repo's 2026-07-09
  entry below originally anticipated) would need a *second* domain hosted at
  Cloudflare just to anchor the CNAME target — nothing we have.
- *Self-hosting acme-dns on the NAS* would require opening port 53 to the
  internet — reintroducing the exact exposure DNS-01 was chosen to avoid.
- *Switching the whole proxy to Traefik* (which bundles `lego`, and `lego`
  does support Versio directly) was considered and rejected: it would trade
  Caddy's ~10-line config for Traefik's more complex label/router model, to
  fix a gap acme-dns already closes without touching the proxy at all.
- *acme-dns* needs one static CNAME record at Versio
  (`_acme-challenge.<DOMAIN>` → the acme-dns `fulldomain`) and credentials
  that can only ever write that one challenge record — narrower blast radius
  than a full DNS API token, and no exposure from our own infrastructure.

**How to apply:** Registration + CNAME steps are in `backend/26-deployment.md`
under "TLS / certificaten". This is a same-day follow-up to the entry below —
read together.

---

## 2026-07-09 — HTTPS via Caddy reverse proxy + Let's Encrypt DNS-01

**Decision:** The app is served over HTTPS at `https://shop.<companydomain>.nl`
(internal split-horizon DNS record → NAS LAN IP). TLS is terminated by a
**Caddy** container (`docker/Dockerfile.caddy` + `docker/Caddyfile`) in front
of the Express container; certificates come from **Let's Encrypt via the
DNS-01 challenge**, so the app stays LAN-only — nothing is opened to the
internet, and renewal is fully automatic. Requested by the IT admin.

**Why these choices:**
- *Proxy termination over Node `https`*: cert issuance/renewal/redirects live
  in one battle-tested container; the Express app stays untouched on `:3000`.
- *Caddy over nginx+certbot / Traefik*: built-in ACME (issue + renew, no
  cron), automatic HTTP→HTTPS redirect, ~10-line config. nginx+certbot is two
  moving parts; Traefik's router model is overkill for one backend.
- *DNS-01 over HTTP-01*: HTTP-01 requires the server to be reachable from the
  internet on port 80 — ours is not and should not be. DNS-01 proves ownership
  via a TXT record through the DNS provider's API (`DNS_API_TOKEN`).
- *Caveat*: stock Caddy images ship no DNS modules — the image is custom-built
  with `xcaddy` and the provider module (`CADDY_DNS_MODULE` build arg, e.g.
  `caddy-dns/cloudflare` or `caddy-dns/transip`). Fallback if the registrar
  has no module: CNAME-delegate `_acme-challenge` to a free Cloudflare zone.

**Bundled hardening:** `db` (5432) and `app` (3000) are no longer published to
the LAN — only the proxy's 80/443 are; the DB password was rotated away from
the old default. Express got `app.set('trust proxy', 1)`.

**How to apply:** Rollout steps (internal DNS record, DNS API token, moving
the QTS admin UI off 443, Azure redirect-URI swap to
`https://.../auth-popup.html`) are in `backend/26-deployment.md` and
`features/39-graph-mail.md`. Frontend needed zero changes (relative API URLs,
header auth). HTTPS also unblocks the parked mobile camera-scan flow
(`getUserMedia` needs a secure context).

---

## 2026-07-02 — Product renamed to "ShopCommand" (user-facing only)

**Decision:** The app is now branded **ShopCommand** in every user-facing
surface: browser `<title>`, sidebar/login screens, Instellingen copy, API
startup log, and current (non-archival) docs — `README.md`, `CLAUDE.md`,
`features/39-graph-mail.md` (Azure app registration name suggestion),
`features/40-planning-gantt-design-prompt.md`, `features/50-operator-terminal.md`.
Old name was "StaalTrack" (in-app brand) / "StockManager" (doc title).

**Explicitly NOT renamed:** the npm workspace scope (`@stockmanager/web`,
`@stockmanager/api`, `@stockmanager/shared`), the repo folder name, and the
GitHub remote. Renaming the npm scope touches every import across
`apps/web`, `apps/api`, and `packages/shared` for no functional benefit —
purely mechanical risk with no user-visible upside. Archival design-handoff
docs (`design_handoff_staaltrack/`, `frontend/17-styling-theme.md`,
`frontend/19-visual-design.md`) also keep the old "StaalTrack" name since
they document a historical design source, not the live product identity.

**Why:** The app started as a pure inventory tracker ("StockManager" /
"StaalTrack") but has grown to cover the full order lifecycle — offertes,
opdrachtbevestiging, production planning (zaag calculator/planner/flow),
relaties, and Graph-based email — so the original name undersold its scope.
"ShopCommand" was chosen in English (per user request) to reflect owning
the entire shop process end-to-end, not just stock levels.

**How to apply:** If a rename to the npm scope or repo name is wanted later,
treat it as a separate, larger decision — it's mechanical but touches
100+ files and needs a full build/test pass after.

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

## 2026-07-06 — MSAL popup redirects to a static blank page, not the app origin
**Decision:** `graph-mail.ts`'s `redirectUri` points to `apps/web/public/auth-popup.html` (empty static page) instead of `window.location.origin`.
**Why:** With the redirect at the app origin, the OAuth popup re-booted the full SPA after login. Since OAuth popups are narrower than the mobile breakpoint, `App.tsx` rendered the stub `MobileLayout` instead of the desktop app, whose catch-all route (`routes/mobile/index.tsx`) navigated to `/raw` — stripping the auth hash from the URL before MSAL could read it and close the popup. Users saw the app's unbuilt "Grondstoffen — nog te bouwen" placeholder stuck open instead of the popup auto-closing.
**Trade-off:** Azure App registration's SPA redirect URI must be updated to `.../auth-popup.html` (was the bare origin) — an admin needs to add this in Azure Portal, existing token cache/sessions are unaffected.

## 2026-07-30 — One global tab bar; page registry is the single source of truth
**Decision:** All open pages live in a single app-wide tab bar (`components/layout/GlobalTabs.tsx`) rendered once in `AppLayout`, backed by one localStorage-persisted store keyed by **route path** (`utils/pageTabs.ts`). The sidebar acts as a launcher: any navigation registers (or focuses) a tab. `components/layout/pageRegistry.tsx` lists every page once — `{ path, label, Icon, Component, poppable }` — and feeds both the tab bar and the pop-out windows (it replaced the separate `popoutRegistry`). Adding a page means one registry entry.
**Why:** The first iteration had per-section strips (a projecten bar, an artikelen bar) with duplicated stores and components. That doesn't scale to "every page", and two bars on screen is confusing. Keying tabs by path makes de-duplication free — opening an already-open page just focuses its tab — and it lets pop-out reuse the exact same identifier (`utils/popout.ts` already keys detached windows by in-app path).
**Trade-off:** Switching tabs in the main window is *navigation*, so only the visible project holds its edit lock (see the 2026-07-30 lock entry); hold several at once by popping them out. Detail pages must refine their own tab label (`pageTabs.open(path, name)`) because the registry only knows a generic placeholder until the entity loads. Tabs show the entity's business number stacked above the name (PRJ-2026-034 / ART-0001); surrogate UUIDs (relaties) are suppressed as noise.

## 2026-07-30 — Popped-out windows scroll like the main content area
**Decision:** `.st-popout-body` mirrors `.st-content` (flex column, `overflow: auto`) and carries the `st-content` class so the same child layout rules apply.
**Why:** It was `overflow: hidden`, which suited the three original pop-out pages (Wachtrij, Prognose, ToDo) because they manage their own internal scroll regions. Once any page became poppable, long document pages (project/artikel detail) were clipped with no way to scroll.
**Trade-off:** None observed — the self-managing pages get the same container they had in the main window, so they still fill the viewport without a spurious scrollbar.

## 2026-09-08 — Mail-import leest met een taalmodel; koppelen blijft in code
**Decision:** Inkomende klantmail wordt bij het inlezen ook door de Claude API (`claude-opus-5`) gelezen — onderwerp, body en de uitgelezen pdf-tekst gaan mee — die via een Zod-schema regels teruggeeft (`apps/api/src/services/ai-extract.ts`). Het **kiezen van het artikel** blijft bij `match-articles.ts`. De vaste patronen (`extract-lines.ts`) blijven draaien; de twee uitkomsten worden samengevoegd en elke regel krijgt een zekerheidsscore (`certainty.ts`), zichtbaar in het reviewscherm. De sleutel staat in de omgeving (`ANTHROPIC_API_KEY`), niet in de database; `MAIL_AI=uit` zet het meelezen uit.
**Why:** Pdf-layouts verschillen per klant en veranderen, en een mail als "graag 10x de signaalplaat" heeft helemaal geen layout — daar komt een regelmotor niet doorheen. Artikelkeuze hoort er juist níet bij: `2615-0090-0530` en `2615-0091-0530` bestaan allebei in de database en schelen één cijfer, dus die keuze moet uit code komen die te testen is. Elke AI-regel draagt een `bronTekst` die letterlijk in het materiaal moet staan, anders zakt de zekerheid zichtbaar — een verzinsel mag er niet ongemerkt doorheen.
**Trade-off:** Klantmail verlaat het eigen netwerk (akkoord gegeven door de eigenaar), er zijn API-kosten per mail, en de QNAP heeft uitgaand internet nodig. Valt de API weg, dan draait alleen de regelmotor en staat de reden in het rapport. De zekerheidsscore is een *vertrouwensindicatie*, geen gemeten nauwkeurigheid: die kan pas uit de correcties in het reviewscherm, en die worden nog niet geteld.

## 2026-09-08 — Mail-import: het handelsdocument bepaalt de regels, tekeningen hangen eraan
**Decision:** Bijlagen worden ingedeeld in `document` (inkooporder, aanvraag, opdrachtbevestiging), `tekening` en `overig` (`apps/api/src/services/attachment-kind.ts`). Is er een leesbaar document, dan maakt alleen dát regels en worden de meegestuurde tekeningen via `hoortBij()` aan de juiste regel gehangen (`CandidateLine.bestanden`); zonder zo'n document vallen we terug op bestandsnamen en mailtekst. Dezelfde rangorde staat in de systeemprompt van het model en wordt in `mergeLines` afgedwongen. Een pdf zónder tekstlaag gaat als document-blok mee naar het model, handelsdocumenten eerst (max 3, max 8 MB). De grondingscontrole werkt nu per regel, op grond van `bronBestand`.
**Why:** Dezelfde onderdeel stond twee keer in het reviewscherm: één regel uit de ordertabel mét aantal, één uit de bestandsnaam van de tekening zonder aantal. Een tekening is een bijlage bíj een onderdeel, geen tweede bestelling ervan. Bij de mail waarop dit opviel was de inkooporder bovendien een scan, dus juist het document dat de regels had moeten bepalen werd niet gelezen — vandaar dat scans nu naar het model gaan. En de gronding stond te grof: één scan in de mail zette de controle voor alle regels uit, zodat een verzonnen regel uit de mailtekst alsnog hoog scoorde.
**Trade-off:** Een gescande pagina als afbeelding kost meer tokens dan tekst; de limiet van drie bijlagen houdt dat in toom maar kan bij een mail met veel scans de vierde missen. Herkenning van een document gaat op de bestandsnaam — een inkooporder die `scan.pdf` heet wordt niet als document herkend en valt terug op de oude route. Een tekening die bij geen enkele regel hoort verdwijnt niet, maar blijft alleen in de bijlagenlijst staan.

## 2026-09-08 — Documentherkenning op inhoud; het model wint op de ordertabel
**Decision:** `classifyAttachment(filename, tekst?)` kijkt eerst naar de *inhoud* van een pdf (`Offerteaanvraag`, `Inkoopofferte`, `Purchase order`, …) en pas daarna naar de bestandsnaam. In de naamregex staan eigen woordgrenzen in plaats van `\b`, en een los woord als `rfq` telt alleen als het niet door een letter óf cijfer wordt gevolgd. In `mergeLines` wint het taalmodel voor `qty` en `positie` zodra de regel uit het leidende document komt; buiten dat document blijft het geteste patroon leidend. `findQty` weigert een getal dat deel is van een datum (`4-9-2026pcs`) of van een maat (`ø50x178`).
**Why:** Op een echte offerteaanvraag van Stinis liep alles mis waar het misgaan kon. `Purchase offer_RFQ2600241_20260902_07-17.pdf` werd als tékening geclassificeerd — "purchase offer" stond niet in de regex en `\brfq\b` matcht niet na een underscore — dus was er geen leidend document, werd elke tekening een eigen regel én werd de aanvraag zelf een regel: vier regels voor één onderdeel. Het aantal werd 2026 omdat de leverdatum in de uitgelezen pdf-tekst tegen `pcs` aan plakte. De pdf hád gewoon een tekstlaag; er ging dus terecht geen afbeelding naar de API — het probleem zat vóór de AI, in de classificatie.
**Trade-off:** De regelmotor levert op deze aanvraag nu géén regel meer in plaats van een foute: `fromDocumentText` eist nog steeds een aantal, anders wordt een postcode als `2931 AG` een regel. Zonder API-sleutel geeft dit document dus niets — dat is bewust liever leeg dan fout, maar het betekent wel dat dit soort layouts de AI nodig heeft. De inhoudscheck kijkt naar de eerste 4000 tekens; een document dat zichzelf pas op blad 3 benoemt wordt op zijn naam beoordeeld.

## 2026-09-08 — Mail-import: alleen nog de AI, met een controlelezing erbij
**Decision:** De patroonmotor (`extract-lines.ts`) is verwijderd; het taalmodel is de enige extractor. De structuurhelpers (`classifyAttachment`, `leidendDocument`, `hoortBij`, `hangBestandenAan`) blijven deterministisch, net als de artikelmatching. Elke regel krijgt drie controles: `gegrond` (citaat staat er letterlijk), `tekeningGegrond` (het tekeningnummer staat er teken voor teken) en `bevestigd` (een tweede, onafhankelijke lezing van dezelfde mail komt op dezelfde regel met hetzelfde aantal uit). Geen enkele controle gooit een regel weg — ze bepalen de zekerheid. Zonder sleutel of bij een storing komen er géén regels, met een melding.
**Why:** Op verzoek van de eigenaar: zekerheid boven dekking. De patronen kenden alleen de vormen die we hadden gezien en gaven op een onbekende layout stilletjes een fout aantal terug — `4-9-2026pcs` werd 2026 stuks. Elke guard dekte precies één waargenomen layout af. Een leeg veld vraagt om aandacht, een fout getal niet. De controlelezing vervangt het "twee motoren zijn het eens"-signaal dat wegviel, en is sterker: die kijkt naar dezelfde tabel in plaats van naar een bestandsnaam.
**Trade-off:** Geen terugval meer — valt de API weg, dan levert een mail niets op en moet er handmatig ingevoerd worden. Elke mail kost nu twee aanroepen (`MAIL_AI_CONTROLE=uit` halveert dat en zet `bevestigd` op null). De denkdiepte staat op `high` en is met `MAIL_AI_EFFORT` te verhogen als nauwkeurigheid meer waard is dan tokens. Bestaande importrijen dragen nog `extractor: 'regels'`; die worden herkend en als zodanig benoemd in de zekerheidsredenen.

## 2026-09-08 — Mail-import: previews in de regeltabel, en wat er bij koppelen gebeurt
**Decision:** Het controlescherm draagt de huisstijl van het programma (`.mi-card`, dezelfde kopopmaak als de artikelkiezer, `st-table` voor de regels) en heeft een preview-kolom: STEP-render als die er is, anders de pdf-tekening, met de live 3D-viewer op hover. Dat is dezelfde machinerie als op offerte- en productieregels; `resolveArtikelPreviewSource` heeft er een variant naast gekregen die op een kale lijst bestanden werkt, en `ArtikelPreviewThumb` is gesplitst in een artikel-laagje boven een `PreviewThumb` die geen artikelen kent. Bij koppelen wordt een ontbrekend artikel aangemaakt met de meegestuurde tekeningen eraan (server-side gekopieerd via `POST /mail-imports/:id/bestanden-naar-artikel`), gaan `klantRef` en leverdatum naar het project, en gaan de regels altijd naar een concept-offerte — ook bij een opdrachtbevestiging.
**Why:** Het scherm was een los formulier in een programma dat overal tabellen met previews gebruikt; een 3D-render herkent een onderdeel sneller dan een tekeningnummer van vijftien tekens. En de tekeningen die de klant meestuurt waren tot nu toe een doodlopende weg: ze bleven in de mailmap liggen, dus de volgende aanvraag van dezelfde klant begon weer bij nul. De ordergegevens (referentie, leverdatum) stonden wel in het document maar werden nergens overgenomen.
**Trade-off:** Een artikel dat automatisch ontstaat heeft geen calculatie, dus die offerteregel staat op € 0 — bewust zichtbaar in plaats van een verzonnen prijs. Bij een bestaand artikel gaan de klantbestanden er níet aan: dat houdt de artikelbijlagen schoon, maar wie een revisie van de klant bij het artikel wil hebben moet die zelf koppelen. Kopiëren gebeurt op de server, dus de bestanden staan twee keer op schijf (bij de mail als bewijsstuk, bij het artikel als werkbestand).

## 2026-09-08 — `packages/shared` wordt gebouwd bij installeren en bij `dev`
**Decision:** `postinstall` en alle `dev`-scripts bouwen eerst `packages/shared`; `npm run dev` draait er bovendien `tsc --watch` op mee. Daarnaast controleert de API bij het opstarten of de constanten waar de routes op bouwen echte, gevulde lijsten zijn (`apps/api/src/lib/shared-check.ts`) en stopt hij anders met de melding welke ontbreekt en welk commando het oplost.
**Why:** `packages/shared` draait op zijn gecompileerde uitvoer (`main` → `dist`), maar werd nergens gebouwd behalve in de volledige `npm run build`. Omdat `ts-node-dev --transpile-only` en Vite niet typecontroleren, werd een verouderde dist stilzwijgend gebruikt: een constante die er nog niet in stond was `undefined`, en `z.enum(undefined)` bouwt een enum zónder waarden. Die klapte pas bij het eerste verzoek dat hem raakte, met `Cannot read properties of undefined (reading 'map')` — een melding die niets over de oorzaak zegt. In de praktijk: het reviewscherm werkte (GET raakt de enum niet, want de queryparameter is optioneel en afwezig), maar opslaan gaf een interne serverfout. CI zag het niet, want die draait wél de volledige build.
**Trade-off:** Elke `npm run dev` en elke `npm install` kost nu een `tsc` van de gedeelde package (enkele seconden). De opstartcontrole noemt een vaste lijst constanten; wie er een nieuwe bijzet moet die daar toevoegen, anders dekt het vangnet die niet — de automatische build is de eigenlijke oplossing, dit is de tweede laag.

## 2026-09-08 — Projectvelden worden gevuld door de pagina die ze bezit
**Decision:** `mail-naar-offerte.ts` schrijft `klantRef` en `levertijdDatum` niet meer zelf; de projectdetailpagina vult ze in via `setMeta` in de `onLinked`-afhandeling, en alleen als ze nog leeg zijn. Verder is het artikelnummer in `RegelsTable` een link naar `/artikelen/:id?returnTo=/projecten/:id` geworden, met `stopPropagation` zodat de regel-drawer niet ook opengaat.
**Why:** De projectpagina houdt naam, relatie, klantreferentie en leverdatum in eigen React-state en persisteert die met een debounce van 400 ms. Een `projectsApi.update` vanaf een andere plek belandde wél in de cache, maar werd daarna door die autosave overschreven met de oude, lege waarden — de referentie uit de mail verdween zonder spoor. Eén veld hoort één eigenaar te hebben. En vanuit een offerteregel was er geen weg naar het artikel: juist bij een automatisch aangemaakt artikel (geen calculatie, dus € 0) is dat precies waar je heen moet.
**Trade-off:** De pagina moet nu weten welke velden uit een mail komen; komt er een veld bij, dan moet het op twee plekken kloppen (het AI-schema en de `onLinked`-afhandeling). Het alternatief — de pagina laten weten dat een externe update is gedaan — vraagt een herlaadmechanisme dat er niet is. De `returnTo`-link volgt de afspraak die de artikelkiezer al gebruikte.

## 2026-09-08 — Machineterminal wordt een pc met touchscreen; tijdregistratie spiegelt de calculatie
**Decision:** Het geparkeerde operator-terminalplan is herschreven (`features/50-operator-terminal.md`): een **pc met touchscreen per machine** in plaats van een tablet, draaiend op een kioskroute van de bestaande webapp. Een tijdregel (`TimeEntry`) draagt naast start en stop ook `soort` (instellen of draaien), `bemanning` (bemand of onbemand — persoon óf robot) en `aantalStuks`. Fase 0 uit dat plan — het datamodel plus start/stop in de bestaande app — kan los van de hardware. Nog niets gebouwd.
**Why:** Een pc bij de machine zit op het netwerk en kan het NC-programma rechtstreeks in de machinemap op de NAS zetten; daarmee verdwijnt de USB-stick, een probleem dat losstaat van tijdregistratie en dat een tablet niet netjes oplost. Op 22" is de tekening bovendien leesbaar zonder knijpen. De velden op `TimeEntry` volgen uit de calculatiestructuur: die rekent met `setupMin` per batch en `cycleMin` per stuk, dus zonder soort en aantal stuks valt geschat niet tegen werkelijk te leggen en is de hele meting alleen achteraf leuk om naar te kijken. Bemand versus onbemand verandert de kostprijs echt, want de machine kent al losse tarieven voor machine en operator.
**Trade-off:** Zonder koppeling met de besturing verklaart de operator zelf dat er onbemand gedraaid is — het systeem meet dat niet. Een echte machinekoppeling (MTConnect / OPC UA) is een apart traject; het datamodel sluit het niet uit. Verder vraagt een pc op de vloer om een spatwaterdicht scherm of een kast en om Windows-updates die buiten werktijd vallen, en kost elke plek stroom en netwerk.

## 2026-09-08 — Matcher kent de klant; controlescherm teruggebracht tot de beslissing
**Decision:** Artikelen worden met hun `relatieId` geladen en `matchLine` weet welke klant de mail is: een treffer op een artikel van een ándere klant zakt naar 'twijfel', vult nooit voor, en meldt bij wie het artikel hoort. Het contact wordt uit het e-mailadres herleid (`suggestContact`, alleen bij precies één treffer) en een onbekende klant kan vanuit het reviewscherm worden aangemaakt. Het scherm is herbouwd rond klant + contact bovenaan en één regeltabel (aantal, art.nr klant, tekening, omschrijving, prijs klant, ons artikel); de prijs van de klant wordt vergeleken met onze calculatie bij dat aantal (`mail-prijzen.ts`) en een afwijking geeft een waarschuwing. Al het technische — pdf-tekst, zekerheidsonderbouwing, afzenderherkomst, berichttekst — zit in een standaard ingeklapt paneel. De dropzone toont tijdens het inlezen de lopende stap en de verstreken tijd.
**Why:** Tekeningnummers zijn van de klant, dus een gelijk nummer bij twee klanten zegt niets; een test liet zien dat zo'n regel automatisch aan het artikel van de verkeerde klant werd gekoppeld — een fout die je pas ziet als er verkeerd geoffreerd is. Een onbekende klant liep vast omdat koppelen geblokkeerd is zonder relatie en die alleen elders aan te maken was, precies bij de eerste mail van een nieuwe klant. Het scherm zelf toonde zoveel onderbouwing dat de eigenlijke beslissing eronder verdween. En het inlezen duurt tientallen seconden zonder dat er iets bewoog.
**Trade-off:** De prijsvergelijking werkt alleen als het artikel een calculatie heeft; bij een vers aangemaakt artikel is onze prijs nul en zwijgt hij, terwijl dat juist een regel is om naar te kijken. Het per-regel zekerheidsbalkje is uit de tabel verdwenen ten gunste van één statuskolom — de cijfers staan nog in het technische paneel, maar je ziet ze niet meer terwijl je leest. En `klantArtikel` en `klantPrijs` moeten door het model uit het document komen: staat het er niet, dan blijft de kolom leeg en valt er niets te vergelijken.

## 2026-09-08 — Wachttijd wordt gemeten, niet geschat; voortgangsbalk belooft nooit meer dan hij weet
**Decision:** Elke ingest en herlezing schrijft een meting weg (`ingest_runs`: bytes, bijlagen, tekens, scans, controlelezing, gemeten duur). `GET /mail-imports/schatting?bytes=…` geeft de mediaan plus p10/p90 van vergelijkbare runs; de gelijkende groep wint al vanaf twee metingen. De balk (`utils/voortgang.ts`) loopt naar 90 % op het voorspelde moment en nadert daarna asymptotisch 99 %, nooit 100 %; zonder metingen kruipt hij blind en zegt de tekst dat.
**Why:** De eerste versie zei "een halve tot anderhalve minuut" — mijn aanname, geen waarneming. Bestandsgrootte als maatstaf bleek verkeerd: gemeten kost het uitlezen van een pdf van 1,1 MB 24–243 ms, en uploaden over de LAN is verwaarloosbaar; de tijd zit in het modelgesprek en schaalt met tekst en gescande pagina's. Die getallen kent alleen de server ná het uitpakken, terwijl de browser bij het slepen alleen de bestandsgrootte kent — dus is voorspellen uit eigen historie de enige eerlijke route, en die corrigeert zichzelf als het model sneller wordt of de mail zwaarder. De grens van twee voor de gelijkende groep komt uit een gemeten misser: een grote gescande order kreeg de mediaan van kleine tekstmails (44 s waar 92 s hoorde).
**Trade-off:** De eerste paar mails krijgen geen voorspelling; dat staat er ook zo. De schatting kijkt alleen naar bestandsgrootte, terwijl scans en tekstlengte betere voorspellers zijn — die staan wél in de tabel, dus verfijnen kan later zonder opnieuw te meten. De echte scherpte vraagt voortgang vanaf de server (SSE of ingest splitsen met polling); dat is bewust niet gebouwd, want ook dán moet je nog weten hoeveel seconden "één scan van twee pagina's" bij deze installatie kost — en dat weet je alleen door te meten.

## 2026-09-09 — Projectdocumenten krijgen eigen tabellen; verzonden facturen worden gearchiveerd
**Decision:** Offerte, opdrachtbevestiging, paklijst en factuur verhuizen uit de JSONB-kolommen van `projects` naar vier eigen tabellen met een `projectId`-FK. `projects` houdt naam, relatie, contact, klantreferentie, status, leverdatum en notities. Een verzonden factuur wordt bovendien *als bestand* bewaard: de pdf-bytes zoals ze verstuurd zijn, plus aan wie en wanneer. De regels blijven bevroren snapshots zoals ze dat nu al zijn.
**Why:** De huidige opzet is nergens op te bevragen: omzet per maand, openstaand bedrag, btw per periode of "welk project hoort bij FACT-2026-007" vragen allemaal om alle projectrijen uitlezen en in geheugen platslaan. Documenten zijn ook niet los terug te vinden — er is geen documentenpagina en de projectlijst toont per project maar één offerte (`currentOfferte`), dus een vervallen offerte is onvindbaar. Daar komt de fiscale bewaarplicht bij: de administratie moet zeven jaar bewaard blijven (tien bij onroerende zaken) en een geconverteerde weergave moet een juiste en volledige weergave van het origineel zijn. De factuur-pdf wordt nu elke keer opnieuw gegenereerd uit live data en de huidige template — verandert het briefpapier of de layout, dan ziet een factuur uit 2026 er volgend jaar anders uit dan wat de klant kreeg. Wij zijn de verzender, dus we hoeven geen echtheidskenmerken van een derde te bewaren, maar we moeten wél kunnen laten zien wát we verstuurd hebben, en dat kan nu niet.
**Trade-off:** Dit is de duurste variant: `withProject` (row lock + read-modify-write op één rij) en `serialize` gaan om, `deriveProjectStatus` moet zijn gegevens uit meerdere tabellen halen, alle vier de tabs veranderen van databron, en de bestaande projectrijen moeten gemigreerd worden. De alternatieven — alleen de factuur, of factuur plus paklijst — waren goedkoper maar lieten twee manieren van opslaan naast elkaar bestaan; bewust niet gekozen. Verder groeit de database met de gearchiveerde pdf's (grofweg enkele honderden kB per factuur), en dat archief moet de zeven jaar ook echt overleven: op één QNAP is een backupstrategie daarmee onderdeel van de bewaarplicht, geen losse zorg. De bewaartermijn en de nummering (punt 18) zijn uit openbare bronnen afgeleid en nog niet door een boekhouder bevestigd.

---

(Template for new entries)

## YYYY-MM-DD — <Short title>
**Decision:**  
**Why:**  
**Trade-off:**

## 2026-09-09 — Document-id's zijn globale sleutels geworden; botsingen mogen niet stil zijn
**Decision:** `persist` (`apps/api/src/services/project-store.ts`) controleert vóór elk schrijven of een document-id niet al bij een ánder project hoort en geeft anders een 409. `nextDocId` telt door tot er een nummer ligt dat in de bijbehorende tabel nog vrij is, met een bovengrens van 50 pogingen. De paklijst- en factuurregel hebben geen eigen id in het gedeelde schema en krijgen er een afgeleid van het document plus de order of offerteregel waar ze bij horen, met de index erachter bij een dubbele.
**Why:** Kwam boven water bij het verifiëren van de migratie, op een database waar de teller in `doc_sequences` achterliep op de rijen. `nextDocId` gaf `OFF-2026-001` uit terwijl die offerte al bestond, en de `upsert` in `persist` schreef er zonder morren overheen: een geaccepteerde offerte van een ander project stond daarna weer op versie 1, concept, zonder acceptatiedatum. Zolang alles in de JSONB-kolom van één projectrij zat kon dat niet — een id hoefde alleen binnen dat ene project uniek te zijn. Met eigen tabellen is het een primary key, dus een achterlopende teller (een teruggezette backup, een handmatig toegevoegde rij) is genoeg om data van een ander project te overschrijven. De afgeleide regelsleutel voorkomt een tweede stil probleem: met een gegenereerd id zou elke bewaaractie alle regels verwijderen en opnieuw aanmaken.
**Trade-off:** Elk schrijven kost nu een handvol extra `findUnique`-aanroepen om het eigendom te controleren, en `nextDocId` doet er één per uitgegeven nummer bij. Bij vier gebruikers valt dat weg tegen de rest van het verzoek. De 50-pogingengrens is een noodrem: staat de teller ver achter, dan komt er een foutmelding die naar `doc_sequences` verwijst in plaats van een oneindige lus. De eigendomscontrole blokkeert ook het legitiem verplaatsen van een document naar een ander project — dat kan nu niet, en zou een eigen route moeten worden als het ooit nodig is.

## 2026-09-09 — Eén statusveld, en on hold haalt het project uit de planning
**Decision:** `deriveProjectStatus` is uit `apps/web/src/api/projects.ts` verwijderd; het opgeslagen `status`-veld is de enige bron van waarheid en wordt door de routes bij elke overgang gezet. `on_hold` en `geannuleerd` worden gezet via `POST /:id/status/stop` met een verplichte reden, en teruggedraaid met `POST /:id/status/hervat`. Het project onthoudt in `statusVorige` waar het vandaan kwam. Een stilgelegd project wordt overgeslagen in `buildStapItems` en `berekenGhostBelasting`, dus het verdwijnt uit de machinewachtrij en de prognose; documenten, orders en afgevinkte stappen blijven onaangeroerd.
**Why:** Er stonden twee statusberekeningen naast elkaar en ze waren het oneens: `deriveProjectStatus` gaf 'productie' zodra er productieorders bestonden, terwijl de routes na het accepteren van een offerte 'bevestigd' zetten — orders bestaan dan al, maar er is nog geen stap afgevinkt. Dat hij nergens werd aangeroepen maakte het erger, niet beter: het is precies het soort code dat iemand later "even gebruikt" en dan een status ziet verspringen. En `on_hold` bestond alleen als label: de badge, het filter en de sortering kenden hem, maar geen enkele route zette hem. Zonder het planningfilter zou hij dat grotendeels blijven — een project dat stilligt omdat de klant geen materiaal levert bezet dan nog steeds capaciteit in de wachtrij, en dat is nou juist waar je hem voor aanzet. De reden is verplicht omdat een project dat over een maand nog stilligt anders alleen vragen oplevert.
**Trade-off:** De statuswaarde is nu iets wat de routes moeten bijhouden; vergeet een nieuwe overgang hem te zetten, dan klopt hij niet, en er is geen tweede berekening meer die dat zou opvangen. Dat is bewust: één ding dat kan afwijken is beter dan twee die van elkaar afwijken. Verder blijven bij annuleren alle documenten staan — een geannuleerd project houdt dus zijn offertenummers bezet. Dat lijkt me juist (de nummers zijn uitgegeven en een offerte is verstuurd), maar het betekent wel dat een geannuleerd project in de documentenlijst blijft opduiken. En reserveringen doen nog niets bij on hold, simpelweg omdat ze nog niet per project bestaan (punt 6).

## 2026-09-09 — Een reservering weet voor welk project en artikel hij ligt
**Decision:** `ZaagReservering` heeft een optionele `projectId` en `artikelId` gekregen, naast het bestaande `calculatieNr`. De zaagcalculator laat beide kiezen bij het reserveren; met een project erbij beperkt de artikellijst zich tot de artikelen uit dat project. De projectpagina toont onder Productie wat er vastligt, de reserveringenpagina een kolom met een link terug. Bij het verwijderen van een project of artikel wordt de verwijzing leeggemaakt (`ON DELETE SET NULL`) en blijft de reservering bestaan.
**Why:** Reserveringen en projecten waren twee losse werelden: een gereserveerde staaf hing alleen aan `calculatieNr`, een handmatig ingetypt vrij tekstveld, dus vanaf een project was niet te zien of er materiaal klaarlag en vanaf een reservering niet waarvoor hij lag. Project plus artikel is de koppeling die in élke fase werkt — ook tijdens het calculeren, voordat er productieorders bestaan, en dat is precies wanneer de zaagcalculator gebruikt wordt. Het is bovendien genoeg om later per artikel te kunnen zien wat er nodig is versus wat er ligt (punt 9) en om bij gereedmelden af te boeken (punt 8). Beide velden zijn optioneel gehouden omdat er ook voor voorraad en intern werk gezaagd wordt; dat is een geldige situatie, geen ontbrekende invoer. Een reservering laten verdwijnen met het project zou het omgekeerde probleem geven: het materiaal ligt dan nog steeds fysiek vast zonder dat iemand het ziet.
**Trade-off:** De koppeling is handwerk — wie vergeet een project te kiezen krijgt een losse reservering, net als nu. Automatisch reserveren bij het accepteren van een offerte is punt 7. Verder is de koppeling naar het artikel en niet naar een specifieke offerteregel of productieorder: staan er twee regels met hetzelfde artikel in één project, dan is niet te zien welke van de twee het materiaal claimt. Dat leek me het wachten niet waard, want de zaagcalculator werkt zelf ook op artikelniveau. En on hold zetten geeft reserveringen nog niet vrij; wat daar hoort te gebeuren is een keuze die pas met punt 7 en 8 scherp wordt.

## 2026-09-09 — Omschrijving en tekeningnummer strikt gescheiden; bestanden koppelen in drie stappen
**Decision:** De velddefinities en de systeemprompt van `ai-extract.ts` zeggen nu expliciet dat `tekening` alléén het nummer bevat en `omschrijving` alléén wat het onderdeel ís, met een voorbeeldregel erbij van hoe een ordertabel uiteenvalt. Daarachter zit `schoonOmschrijving()`, die het tekeningnummer, de revisie en het positienummer uit de omschrijving haalt als het model ze er toch in zet, en null teruggeeft als er daarna geen benaming overblijft. `hangBestandenAan()` koppelt in drie stappen: het nummer in de bestandsnaam, daarna de bijlage die het model zelf aanwijst (`attachmentFilename`), en als vangnet alle losse tekeningen bij één enkele regel die anders niets krijgt.
**Why:** Gemeld op echte mail: er werd een nieuw artikel aangemaakt zonder dat de meegestuurde tekening eraan hing, en het model propte de hele regel in de omschrijving. Die twee hangen samen. Het koppelen van bestanden matcht op het tekeningnummer; belandt dat nummer in de omschrijving in plaats van in `tekening`, dan vindt `hoortBij` niets, blijft `bestanden` leeg en wordt het artikel kaal aangemaakt terwijl de tekening in de mailmap achterblijft — precies waarvoor de klant hem meestuurde. Een prompt is een verzoek en geen garantie, vandaar de deterministische opschoning erachter: die maakt het onafhankelijk van of het model zich die dag aan de instructie houdt. Stap 2 is geen heuristiek maar een uitspraak van het model over dít document, en dekt de klant die zijn bestand anders noemt dan zijn tekeningnummer.
**Trade-off:** Het vangnet in stap 3 kan ernaast zitten: één regel, geen treffer, en een tekening in de mail die eigenlijk ergens anders bij hoort. Daarom de twee voorwaarden — precies één regel, en alleen als die regel nog nérgens een bestand aan heeft. Een bestaande test bewaakte dat: die had bewust een niet-passende tekening in de mail, en een gretiger versie van deze regel liet hem meelopen. Bij meerdere regels doen we niets, dus daar blijft een tekening met een afwijkende naam liggen totdat het model hem via `attachmentFilename` aanwijst. `schoonOmschrijving` haalt verder alleen weg wat aantoonbaar dubbel is; een omschrijving die de klant zelf als samenvatting schreef ("beugel volgens tekening, 25 stuks") blijft staan zoals hij is.

## 2026-09-09 — Zips uitpakken bij het inlezen; materiaal en certificaat krijgen een eigen veld
**Decision:** Een zip-bijlage wordt bij het inlezen uitgepakt en zijn inhoud komt als losse bijlagen naast de zip te staan (`services/zip-uitpakken.ts`, ingehaakt in `ingestMsgBuffer` direct na `readAttachments`). Grenzen: honderd bestanden, 25 MB per bestand, 100 MB totaal, alleen de bestandsnaam, geen zips binnen zips, en een kapotte zip geeft een lege lijst in plaats van een mislukte import. Verder dragen `CandidateLine` en het AI-schema nu `materiaal`, `materiaalDoorKlant` en `certificaat`, zichtbaar in een eigen kolom in het controlescherm.
**Why:** Op een offerteaanvraag van Veratio (16-07-2026) zat de hele aanvraag in de mailtekst — zeven regels, geen inkooporder-pdf — en alle veertien tekeningen zaten in één `Tekeningen.zip`. Die zip werd als 'overig' geclassificeerd en dus volledig weggegooid: zeven nieuwe artikelen zonder tekening, terwijl de klant ze gewoon had meegestuurd. Gemeten na het uitpakken: 4 bijlagen worden er 18, veertien daarvan tellen als tekening, en alle zeven regels krijgen hun pdf én step — nul regels zonder bestand. Er was geen nieuwe koppellogica voor nodig; de bestandsnamen in de zip dragen hetzelfde nummer als de regels. De velden voor materiaal komen uit dezelfde mail: vier regels zeggen "Toegeleverd materiaal" (de klant levert aan) en twee "Uit uw materiaal" (wij kopen in), en twee vragen "Inclusief 3.1". Dat verandert de kostprijs volledig en hoort dus niet in een omschrijving te verdwijnen waar niemand op rekent — zeker niet nu de omschrijving juist is aangescherpt tot alleen wat het onderdeel ís. `fflate` is expliciet als afhankelijkheid van de API opgenomen; hij zat er al in, maar alleen transitief via `three` en `jspdf` in de frontend.
**Trade-off:** Uitpakken kost geheugen: de inhoud staat kort naast de zip in het geheugen voordat alles naar schijf gaat, en de grenzen zijn ruim genoeg voor een set tekeningen maar niet voor een archief. Bestanden met dezelfde naam als een bestaande bijlage worden overgeslagen, anders overschrijven ze elkaar op schijf; dat kan in theorie een tekening kosten. De zip blijft ook zelf bewaard, dus die bytes staan twee keer op de NAS — bewust, want het bewijsstuk hoort ongewijzigd te blijven. `materiaalDoorKlant` komt van het model en wordt nergens deterministisch nagerekend: staat er iets ongebruikelijks als "materiaal in consignatie", dan is het een gok van het model en moet een mens het in het controlescherm zien. Het veld wordt voorlopig alleen getoond; de calculatie doet er nog niets mee.

## 2026-09-09 — Een tekening hoeft geen nummer in zijn naam te dragen
**Decision:** `classifyAttachment` eist niet langer drie cijfers in de bestandsnaam. Een tekenpakket-formaat (step, stp, dwg, dxf, iges, sldprt, …) is altijd een tekening, ongeacht de naam. Een pdf is een tekening tenzij zijn naam alleen zegt wát het bestand is in plaats van wélk onderdeel (`scan`, `tekeningen`, `bijlage`, `document`, …). Daarnaast hangt `hangBestandenAan` het leidende document nooit aan een regel, ook niet als de classificatie hem als tekening zou lezen.
**Why:** Op een bestelling van Veratio (21-05-2026) kwamen zeven tekeningen mee die `Motor Housing_v2.pdf`, `Guide base 5_8.dwg` en `Lower foam pin.stp` heetten. Geen ervan draagt een getal van drie cijfers, dus alle zeven werden 'overig' en werden nergens aan gehangen — de artikelen kregen hun tekening niet. De oude regel kwam voort uit een echte les (`scan.pdf` en `tekeningen.pdf` zijn geen tekening), maar de aanname eronder — een onderdeel wordt altijd met een nummer aangeduid — is die van één klant, niet van alle. Het bestandstype is een betrouwbaarder signaal: een step of dwg is nooit een folder of een handtekeningplaatje. Gemeten na de wijziging: negen tekeningen goed geclassificeerd, de inkooporder blijft document, en alle vier de orderregels krijgen hun bestanden — inclusief `Guide Base 5/8` dat op `Guide base 5_8` matcht en `Motor Housing.step` dat aan `Motor housing_v2` hangt.
**Trade-off:** Een pdf die geen tekening is en geen generieke naam draagt (een productblad, een certificaat met een eigennaam) telt nu als tekening. Dat kost weinig: koppelen aan een regel vraagt nog steeds zes tekens overlap met het tekeningnummer, dus zo'n bestand blijft meestal gewoon los in de bijlagenlijst staan. Het risico zit in een mail zónder leidend document, waar bestandsnamen wél regels mogen maken — daar kan zo'n pdf een valse regel opleveren. De uitsluiting van het leidende document dekt het geval dat het ergste was: een inkooporder zonder tekstlaag en met een cryptische naam werd anders aan zijn eigen regels gehangen. De generieke-namenlijst is Nederlands en Engels; een klant die zijn bijlagen in het Duits of Frans zo noemt, valt erbuiten.

## 2026-09-09 — Testset van echte mails in de repo, en het handelsdocument native naar het model

**Testset in git.** `apps/api/src/services/__tests__/mails/` bevat echte
klantmail met het goede antwoord ernaast (`verwacht.json`), gescoord met
`npm run score:mails -w apps/api`. Zonder zo'n set is een promptwijziging niet
te beoordelen: een unittest vangt alleen kennis die in code staat, en die kennis
verhuist naar prompts en klantprofielen. De prijs is bewust aanvaard — er staan
klantprijzen, contactgegevens en tekeningen van Veratio voorgoed in de
git-geschiedenis. De repo is privé en het team is vier man; het alternatief (op
de NAS, buiten git) is een set die niemand draait.

De scorer vergelijkt **alleen velden die in `verwacht.json` staan**. Daardoor
blijven bestaande fixtures geldig als er een veld bij komt. De vergelijking zelf
zit in `mail-score.ts` met eigen unittests, apart van het script: een scorer die
zelf niet klopt zou een verslechtering als winst kunnen melden.

**Het handelsdocument gaat als volledige pdf mee, ook mét tekstlaag.** Tot nu
ging alleen een pdf zónder tekstlaag als document-blok mee. Op de bestelling van
Veratio (2690655) bleek waarom dat te weinig is: die pdf *heeft* een tekstlaag,
maar `pdfText` levert `€34,4925-06-2026 15` op — prijs, leverdatum en aantal aan
elkaar geplakt, met de kolomkoppen ónder de regels. `pdfText` geeft de woorden en
gooit de tabel weg, en juist de tabel is de betekenis. Dezelfde vorm als de
`4-9-2026pcs`-bug.

Bij een pdf die native meegaat wordt de uitgeklopte tekst uit de prompt gelaten:
anders ziet het model naast de pdf ook de kortere, kapotte versie. De tekst
blijft wel in `haystack()`, zodat de gronding er nog in kan nazoeken. Daarom zijn
"zonder tekstlaag" (gronding kan niets nazoeken) en "gaat native mee" nu twee
losse begrippen — `scans` en `nativeBlokken` in `AiExtractOutcome`,
`gescandeBijlagen` en `volledigMeegestuurd` in het rapport.

Tekeningen gaan niet meer native mee zolang er een handelsdocument is (§3.1b
trap 1 en 2). Er passen er maar drie; op de Veratio-bestelling zou het model twee
van de acht tekeningen zien, en die twee lijken dan bijzonder. Koppelen gaat op
naam. Trap 3 — een tekening alsnog meesturen als een regel er géén krijgt — is
nog niet gebouwd.

## 2026-09-10 — Nulmeting op 100%, en een schakelaar om de tegenproef te kunnen draaien

De scoreset staat op **77/77 (100%)** over de twee Veratio-mails, inclusief de
vier stuksprijzen die in de kapotte kolomtekst van de inkooporder zaten
(`€34,4925-06-2026 15`). De eerste draai kwam op 65% uit, maar alle missers
daarvan zaten in de scorer zelf — zie de commit van die dag.

Wat die 100% betekent: een regressienet. Het goede antwoord is afgeleid uit
diezelfde mails, dus de set kan alleen nog naar beneden. Het bewijst niet dat
mail nummer drie ook goed gaat.

Wat er nog niet uit blijkt: dat het native meesturen van het handelsdocument het
verschil máákte. Er is geen meting van vóór die wijziging. Daarom
`MAIL_AI_DOCUMENT=tekst`, dat terugvalt op de oude regel (alleen een pdf zónder
tekstlaag gaat mee). Twee draaien van de scoreset geven dan de tegenproef. Het is
tegelijk een noodrem als een klantdocument het model ooit in de war blijkt te
sturen.

Gevolg voor de bouwvolgorde: **eerst de set verbreden, dan de code.** Een set op
100% kan geen verbetering aantonen, dus C (titelblok lezen) zou code toevoegen
voor een probleem dat nergens meer zichtbaar is. En D (opruimen) is nog niet
gratis: `hoortBij`, `komtVanTekening` en `schoonOmschrijving` doen hier het werk
dat de score op 100% houdt.

## 2026-09-10 — De eerste gemeten promptwijziging

De scoreset staat op **148/148** over zes mails van vijf klanten (Veratio, Stinis,
Global Factories, Post Metaalbewerking, Lindhout).

Het aanscherpen van de leesregel voor `materiaal` — "zegt de klant expliciet wat
hij aanlevert, dan is dát het materiaal" — repareerde de enige misser en liet de
andere 147 controles staan. Dat is de eerste keer dat over een promptwijziging
iets harders te zeggen viel dan "ik denk dat dit beter is". Precies waarvoor de
set gebouwd is.

Daarbij één regel vastgelegd die bijna misging: **een voorbeeld in een prompt is
verzonnen, of komt uit een mail die niet in de scoreset zit.** Eerst stond het
geval uit de Veratio-fixture letterlijk in de systeemprompt; die mail zou daarna
slagen omdat het antwoord in de prompt stond in plaats van omdat het model hem
las. Zie features/62 §5.2e.

Wat B opleverde is hiermee ook concreet: `4 4-9-2026pcs` (Stinis) en
`11-09-26103716.D VM Drag Nozzle 114 1 Pieces 147,85 147,851` (Global Factories)
worden goed uit elkaar gehaald. Drie leveranciers, drie ERP-systemen, drie
manieren waarop de uitgeklopte pdf-tekst kapot is.

Wat dit **niet** zegt: de set is nog steeds klein en het goede antwoord komt uit
diezelfde mails. 100% betekent "niets kapot", niet "goed genoeg". De volgende stap
is daarom geen code maar gebruik: elke mail die in het echt misgaat gaat als
fixture in de set, vóór hij gerepareerd wordt.

## 2026-09-10 — Het titelblok lezen als de bestandsnaam nergens bij past (stap C)

`titelblok.ts`. Aanleiding is de inkooporder van Post Metaalbewerking (6191): die
bestelt volgens `MD13504758` en stuurt een bestand `md10504758 B uitbesteding.pdf`
mee. Eén cijfer anders. Uit de bestandsnaam alleen is niet te zeggen of dat
dezelfde tekening is met een typefout of een ander onderdeel — en die tekeningen
hebben geen tekstlaag, dus `pdfText` levert niets op. Het model kan de pagina wel
bekijken.

Twee keuzes die de rest bepalen:

**Het is een escalatie, geen extra stap.** Er wordt pas gelezen als er een regel
zónder bestand is náást een tekening zónder regel (§3.1b trap 3). Bij mail waar de
bestandsnaam gewoon matcht gebeurt er niets en kost het niets. Maximaal vier
tekeningen per mail.

**Het gelezen nummer koppelt alleen bij een exacte overeenkomst.** `hoortBij` mag
soepel zijn op een bestandsnaam, want daar is verder niets. Een titelbloknummer is
een uitspraak over wat er op de tekening staat; wijkt het af, dan is het een
andere tekening. Vandaar `nummerGelijk`, dat op letters en cijfers vergelijkt en
geen enkel teken laat schelen.

Daaruit volgt een uitzondering op het vangnet in `hangBestandenAan`: één regel met
één losse tekening werd altijd gekoppeld, maar als het titelblok een ander nummer
geeft weten we dat het fout is. Zonder die uitzondering zou C de zaak
verslechteren in plaats van verbeteren.

Productie en de scoreset lopen sinds deze wijziging door hetzelfde leespad
(`mail-lezen.leesMail`). Dat was al de bedoeling maar was nog niet zo: `buildCandidates`
had zijn eigen kopie van lezen-plus-regels-opbouwen. Een scoreset die een ander
pad meet dan de app loopt, meet niets.

Uit met `MAIL_AI_TITELBLOK=uit`.

## 2026-09-10 — C gemeten: een fout vóórkomen in plaats van repareren

Op de inkooporder van Post Metaalbewerking (6191) las het titelblok van
`md10504758 B uitbesteding.pdf` het nummer **MD10504758** — niet het MD13504758
waar de order naar verwijst. Het bestand is dus werkelijk een ander onderdeel en
geen verschrijving in de bestandsnaam.

C hing er niets aan. Zonder de exacte vergelijking (`nummerGelijk`) en zonder de
uitzondering op het vangnet in `hangBestandenAan` was die tekening wél aan die
regel gehangen: één cijfer fout, een ander onderdeel, en niemand die het merkt tot
er verkeerd verspaand is.

De scoreset blijft daarmee op 148/148, nu met alle zes de antwoorden nagekeken
door de werkvloer. Kosten van de escalatie: die ene mail ging van 23 naar 26
seconden; de andere vijf escaleerden niet.

## 2026-09-10 — Eén databasefout nam de hele API mee

Waargenomen tijdens het opstarten voor een test: Postgres draaide niet, en het
eerste binnenkomende verzoek beëindigde het API-proces. Daarna gaf elk verzoek
ECONNREFUSED — wat eruitziet alsof de applicatie stuk is terwijl alleen de
database weg was.

Oorzaak: `userContext` was een `async` functie die rechtstreeks als Express
middleware werd gebruikt. Express 4 vangt een afgewezen promise uit async
middleware niet op; die wordt een unhandled rejection, en Node beëindigt daarop
het proces. Deze middleware zit vóór álle `/api`-routes en doet een
databasevraag, dus elk verzoek was een kans om de API om te leggen.

Nagemeten met een onbereikbare database, op de gebouwde app:

- vóór: één verzoek, proces weg (exit 1), daarna ECONNREFUSED
- na: drie verzoeken, drie keer HTTP 500 met een reden, proces blijft staan

De fix is `asyncHandler` eromheen — dezelfde wrapper die alle routes al gebruiken.
Het was de enige async middleware zonder.

Bij het schrijven van de test kwam nog iets naar boven dat het onthouden waard is:
een `vi.fn()` die een afgewezen promise teruggeeft laat een onopgevangen afgeleide
promise achter, doordat vitest er zijn eigen `.then()` aan hangt om het resultaat
te registreren. Dat meldt zich als een mislukte test terwijl de code klopt. In
zo'n geval is een gewone functie als testdubbel beter dan een spy.

## 2026-09-10 — JSON uit de database parsen in plaats van casten

Het reviewscherm werd wit bij het openen van een mail die vóór vandaag was
ingelezen: `Cannot read properties of undefined (reading 'map')`, want de
opgeslagen regel had geen `bestanden`.

`serializeMailImport` plakte een type op de JSON uit de database (`as`) in plaats
van hem te parsen. Een cast is een belofte aan de compiler, geen controle: een rij
die door een oudere versie is weggeschreven mist de velden die er later bij kwamen,
en die zijn dan `undefined` — niet hun default uit het Zod-schema.

`kandidaten` en `extractie` gaan nu door `CandidateLineSchema` en
`ExtractieRapportSchema`. Daarmee doen de defaults alsnog hun werk, en dat
repareert niet alleen de velden van vandaag maar elke die er nog bij komt: een oud
record groeit vanzelf mee in plaats van het scherm om te leggen. Een regel die
werkelijk niet te lezen is gaat eruit, met een melding in de log — stilzwijgend
weglaten is precies hoe je er nooit achter komt.

Dit is een klasse fout die overal kan zitten waar JSON-kolommen met `as` worden
gelezen. Hier speelde het bij mail-imports; elders is het nog niet nagekeken.

## 2026-09-10 — Een slot aanvragen liep stuk op zichzelf

`P2002` op `(item_type, item_id)` bij het openen van een project: de route keek
eerst of er een slot was en maakte er daarna een. Tussen die twee stappen kan een
ander verzoek er al een hebben gezet — en dat is geen zeldzaam geval, want het
scherm vraagt het slot bij openen aan en React doet in ontwikkelmodus elk effect
twee keer.

Het aanmaken vangt `P2002` nu op, kijkt wie het slot heeft en geeft 200 als dat de
aanvrager zelf is. Wie de race won doet er niet toe; alleen wie het slot nú heeft.

Nagemeten: zes gelijktijdige aanvragen van dezelfde gebruiker geven één 201 en vijf
200, met één slot in de database en nul fouten. Twee gebruikers tegelijk op een
leeg slot geven één winnaar en 409 voor de ander.
