# StaalTrack — Planning board (Gantt) — Claude Code handoff

A complete build spec for the redesigned **planning board**: a horizontal, zoomable Gantt
timeline that replaces the old day-column drag/drop grid. Dutch UI, high-density, LAN-only
internal tool for a CNC/metal shop (~4 users).

> **Authoritative source** (in `./source/`) — when this prose and the code disagree, the code wins:
> - `Planning.html` — entry shell + script load order
> - `planning-data.js` — data model, `projectKleur`, machines, capacity/offerte math, date model, all helpers
> - `planning-app.jsx` — app shell, state, mutations (plan/unplan/markDone/deadline), KPI row, toolbar, popover
> - `planning-gantt.jsx` — the timeline: ruler, rows, lane-packing, nodes, connectors, ghost overlay, drag/drop
> - `planning-backlog.jsx` — "Te plannen" backlog panel
> - `planning-sidebar.jsx` — nav rail
> - `planning-styles.css` — all Gantt-specific CSS (additive on top of `styles.css`)
> - `styles.css` — the shared StaalTrack token + primitive sheet (buttons, badges, sidebar, topbar)
> - `icons.jsx`, `tweaks-panel.jsx` — shared primitives
>
> Reference renders are in `./images/`. The reference is a React + Babel mock; the contract is the
> **DOM structure + class names + CSS + behavior** described here. Rebuild in the target stack
> (Mantine v7) keeping these class names so `planning-styles.css` ports with minimal change.

---

## 0. Reading rules

- All values are literal. `42px` means `42px`; don't round or re-scale.
- Every color is a **token** from `styles.css` (`--bg`, `--text`, `--accent`, …) or a **project color**
  from `projectKleur()`. Never hard-code a hex that has a token.
- Two fonts: **IBM Plex Sans** (UI) / **IBM Plex Mono** (ids, codes, durations, dates, counts) with
  `font-variant-numeric: tabular-nums` on all numerics.
- Light + dark via `data-theme` on the root; density via `data-density` (`compact` = 36px rows,
  `comfortable` = 44px). Use the existing theme tokens; do not invent new ones.

---

## 1. Reference images

| File | Shows |
|---|---|
| `images/01-board-week.png` | Default load: KPI row, toolbar, achterstand banner, backlog, week-zoom timeline |
| `images/02-board-month.png` | Month zoom (whole 5-week window fits) — nodes sized by duration, colored by project |
| `images/03-popover-connectors-ghost.png` | Node selected ("Beide" linking → connector lines + dim others), Prognose ghost blocks on, detail popover |

---

## 2. Domain model (`planning-data.js`)

### 2.1 Project color — **reuse exactly**
Color identifies the **project** (not the part or step) and must be identical everywhere the
project appears (timeline node, backlog card, popover, connector).

```js
const PROJECT_PALETTE = ["#2d6df6","#16a34a","#d97706","#9333ea","#0891b2","#dc2626","#0d9488","#7c3aed"];
function projectKleur(projectId) {            // deterministic hash → palette index
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) | 0;
  return PROJECT_PALETTE[Math.abs(h) % PROJECT_PALETTE.length];
}
```
In production this maps to the existing `projectKleur(projectId)` / palette — keep the same function and palette.

### 2.2 Entities
- **Project** — `{ id, klant, artikel, qty, deadline (day-index), kleur, stapTotaal }`. Has a
  `levertijdDatum` (here `deadline`, a day index into the window) and a `projectKleur`.
- **Productie order** → one per article/qty; in the mock collapsed into the project. Has `stappen`.
- **Stap (step)** — the smallest planning unit:
  ```
  { id, projectId, klant, artikel, kleur, naam, machine, volgorde,
    duurMin,            // duration in minutes — COMPUTED from the recipe, not stored
    planDay,            // window day-index when scheduled, or null = backlog
    planMachine,        // machine id when scheduled (defaults to `machine`)
    gereed, gereedOp, gereedDoor,   // done flag + when/who
    isPlaceholder,      // true → duration is a 3h placeholder, shown with "~"
    deadline, qty }
  ```
- **Backlog** = steps with `planDay == null` ("Te plannen").

### 2.3 Machines (timeline rows)
7 machines + a **"Geen machine"** catch-all row, in this order: `laser, kant, draai, frees, boor,
las, zaag, geen`. Each `{ id, naam, sub, icon }` (e.g. Lasersnijden · TruLaser 3030).

### 2.4 Capacity constants
```
EFFECTIEVE_MIN = 294   // 4.9 h/day effective (70% efficiency)
MAX_MIN        = 420   // 7 h/day hard cap — also the "one full day" unit for node width
WERKDAGEN      = 5     // per week
```
- `machineWeekLoad(machineId, weekIdx)` = Σ `duurMin` of non-done scheduled steps in that week.
- `capStatus(min)` → `"ok"` (≤ effective×5) / `"warn"` (≤ max×5) / `"over"`.

### 2.5 Time model
- Window: **Mon 15 Jun 2026 → Sun 19 Jul 2026**, `TOTAL_DAYS = 35` (5 weeks). `WINDOW_START` is a Date.
- **Today** = day index **7** (Mon 22 Jun) — `TODAY_IDX`.
- Helpers: `dateFromIdx(i)`, `fmtDay(i)` (`ma 22 jun`), `fmtDayShort(i)` (`22 jun`), `isWeekend(i)`,
  `weekNr(i)` (ISO week), `fmtDur(min)` (`6u 20m`). In production these come from the real calendar,
  not a fixed window.

### 2.6 Offerte / ghost workload (`berekenOffertebelasting`)
Projected, **uncommitted** load from open offertes, per machine per week, weighted by win-chance:
```
ghostLoad(machineId, weekIdx) = Σ over OFFERTES in that week ( belasting[machineId] × kans )
```
Drives the Prognose overlay. Replaces the simplified offerte-bar of the old board.

### 2.7 Derived selectors
`achterstanden()` (scheduled in the past, not done), `volgordeWarn(step)` (scheduled before a
lower-`volgorde` sibling that isn't done/earlier), `kpis()` (the 5 KPI numbers).

---

## 3. Page layout (`planning-app.jsx`)

Standalone page; reuses the StaalTrack app shell (`.app` grid: sidebar + `.main`). `.main` holds the
topbar then `.content`, which is `display:flex; flex-direction:column; padding:0; overflow:hidden`
and contains `.plan`:

```
.plan (flex column, fills height)
├── .kpi-row          — 5 KPI cards (grid, repeat(5,1fr), 12px gap, 16px 24px 4px padding)
├── .plan-toolbar     — zoom seg · Blok seg · Koppeling seg · (spacer) · undo · Prognose · Gereed
├── .achterstand-banner   — only if achterstanden().length > 0
└── .plan-body (flex, fills) — borderTop 1px
    ├── .backlog (288px, fixed)   — "Te plannen"
    └── .gantt (flex)             — the timeline
```

### 3.1 Topbar
Reuses `.topbar`/`.crumbs`. Breadcrumb `Productie › Planning`. Right: `Vandaag` (scrolls timeline to
today via `scrollApi.current.toToday()`), `Exporteer`, divider, primary `Nieuwe order`.

### 3.2 KPI row — `.kpi` cards
Each: `.kpi-top` (24px `.kpi-ico` tile + uppercase `.kpi-label`), `.kpi-val` (22px mono, optional
`.u` unit), optional `.bar` (4px capacity bar, `i.ok/warn/over`), `.kpi-sub`. Variants `.kpi.warn` /
`.kpi.danger` recolor the value. The five: **Gepland deze week** (u), **Bezetting** (% + bar),
**Achterstand** (danger when >0), **Te plannen**, **Leveringen**.

### 3.3 Toolbar
- **Zoom** segmented control (`.seg`): Dag / Week / Maand.
- **Blok** `.seg`: Rand / Vol / Zacht (node visual treatment — see §6.3).
- **Koppeling** `.seg`: Lijnen / Gloed / Beide (selection linking — see §6.5).
- Spacer, then: **undo** button (labelled with the last action, only when stack non-empty),
  **Prognose** toggle (`.tgl`), **Gereed** toggle (`.tgl`, eye / eye-off — show/hide done steps).
- `.seg button[data-active="true"]` gets the raised `--bg-2` chip; `.tgl[data-on="true"]` goes accent.

### 3.4 Achterstand banner — `.achterstand-banner`
`--danger-soft` bg, danger border. Count + per-step `.ab-chip` buttons (project color dot + id + day);
clicking a chip selects that node (opens popover).

---

## 4. Backlog panel (`planning-backlog.jsx`) — `.backlog`

288px fixed, `--bg-2`, right border. `.backlog-head`: title (inbox icon, "Te plannen", count pill),
sub ("Sleep een stap op de tijdlijn om te plannen"), and `.backlog-controls` = a project `<select>`
("Alle projecten" + one per project) and a sort `<select>` (Standaard / Deadline).

`.backlog-list` (scrolls) of `.bl-card` (draggable):
- `border-left: 3px solid var(--proj)` (project color via `style={{"--proj": s.kleur}}`).
- `.bl-card-top`: color dot, mono project id, right-aligned uppercase machine name.
- `.bl-name` (article), `.bl-meta` (duration mono with `~` if placeholder, qty, right-aligned deadline
  with calendar icon; `.dl.urgent` in danger when deadline ≤ 4 days out).
- States: `.dragging` (0.4 opacity while dragged), `.proj-linked` (2px project ring when its project is
  selected), `.dimmed` (0.4 when another project is selected).
- Sort: `deadline` → by deadline asc; `default` → grouped by project then `volgorde`.

---

## 5. Gantt timeline (`planning-gantt.jsx`) — `.gantt`

`.gantt` carries `data-blockstyle` and `data-linkstyle` (drive node + linking CSS) and
`.has-selection` when a project is selected. Inside: `.gantt-scroll` (the only scroll container,
overflow auto) → `.gantt-inner` (width = `labelW + trackW`).

### 5.1 Geometry
```
labelW = 196px                                  // sticky machine-label column
PX_PER_DAY = { day: 176, week: 68, month: 24 }  // current = pxDay
trackW = TOTAL_DAYS * pxDay
weeks  = TOTAL_DAYS / 7
NODE_H = 42, LANE_GAP = 5, LANE_PAD = 7, GHOST_H = 28
```

### 5.2 Ruler — `.gantt-ruler` (sticky top, z 6)
`.ruler-corner` (sticky left, "Machine") + `.ruler-track` containing `.ruler-weeks`
(one `.ruler-week` per week, width `pxDay*7`, "wk NN · 15 jun – 21 jun") over `.ruler-days`
(one `.ruler-day` per day, width `pxDay`; `.weekend` shaded, `.today` accent; `.compact` at month
zoom hides the weekday letter).

### 5.3 Rows — `.gantt-row` (height = computed row height)
`.row-label` (sticky left, z 4): `.row-label-top` (24px `.row-ico` + machine `.nm`/`.sb`) and a
`.cap-bars` row — one `.cap-bar` per week with an inner `i.ok/warn/over` width = load%
(title shows hours/cap). `.row-label.geen` uses a dashed icon tile and no cap bars.

`.lane` (width `trackW`, position relative): `.lane-grid` draws per-day `.lane-daycol`
(`.weekend` shaded) + per-week `.lane-weekline`. A single `.today-line` (2px accent, "vandaag" tag)
spans all rows at `labelW + TODAY_IDX*pxDay`.

### 5.4 Lane packing (overlap → sub-lanes)
Per machine, scheduled steps (filtered by `showDone`) are sorted by `planDay` then `volgorde` and
greedily packed into sub-lanes by **day interval** `[planDay, planDay + duurMin/MAX_MIN]`. A step's
position: `lane`, `left = planDay*pxDay + 3`, `width = max(durDays*pxDay - 6, 20)`. Row height
= `LANE_PAD*2 + nLanes*NODE_H + (nLanes-1)*LANE_GAP` (+ `GHOST_H + 4` when that machine has ghost
load and Prognose is on). `laneTop(lane) = LANE_PAD + lane*(NODE_H + LANE_GAP)`.

### 5.5 Auto-scroll
On mount and on zoom change, `scrollLeft = max(0, TODAY_IDX*pxDay - 220)` so today is in view.
`scrollApi.current = { toToday() }` is exposed to the topbar **Vandaag** button.

---

## 6. Nodes — `.node` *(the core element)*

Absolutely positioned in the lane. Two text lines: `.nname` (article short name, prefixed with a
check glyph when done) and `.nmeta` (optional `.warn-dot`, `.ndur` duration with `~` if placeholder,
`·`, project id). `--c` is set to the project color via inline style.

```css
.node { position:absolute; border-radius:5px; padding:5px 8px; height:42px;
        display:flex; flex-direction:column; gap:2px; justify-content:center; overflow:hidden; }
```

### 6.1 Hover actions — `.node-actions` (top-right, shown on hover, non-done only)
Two 18px `.na` buttons: ✓ **Gereed melden** (`onMarkDone`) and × **Terug naar backlog** (`onUnplan`).

### 6.2 State classes
- `.done` (opacity 0.5; only rendered when **Gereed** toggle on)
- `.placeholder` (dashed border; the `~` duration)
- `.achterstand` (dashed danger outline — scheduled before today, not done)
- `.is-selected` (project-color ring), `.proj-linked` (sibling of selected project), `.dragging`

### 6.3 Block style — `.gantt[data-blockstyle="…"]`
Three explored treatments (switchable; default **rand**):
- **rand** — `color-mix(--c 12%, --bg-2)` fill, `--c 30%` border, **4px left bar** in `--c`. Text in `--text`.
- **vol** — solid `--c` fill, white text (`.nname` #fff, `.nmeta` rgba(255,255,255,.82)).
- **zacht** — `--c 8%` tint fill, `--border` border, **2px top hairline** in `--c`.

### 6.4 Selection / linking — `.gantt[data-linkstyle="…"]` + `.gantt.has-selection`
Three explored treatments (default **gloed**):
- **lijnen** — draw connector lines only (see §6.6).
- **gloed** — selected project's nodes get a `--c` ring (`.proj-linked`); every other node dims to
  opacity 0.28 (done ones 0.15). No lines.
- **beide** — both rings/dim **and** connector lines.

### 6.5 Connector overlay — `.gantt-connectors` (SVG, z 3, pointer-events none)
Only for `linkStyle` lijnen/beide with a selection. Collect the selected project's visible node
centers, sort by `(planDay, volgorde)`, draw one `<path>` polyline in the project color plus a small
`<circle>` at each node center. SVG is positioned at `left:labelW, top:0`, sized `trackW × totalH`,
so it scrolls with content. (Backlog cards are linked via the `.proj-linked` highlight, not lines.)

### 6.6 Capacity bars
Per machine label, one mini bar per week tinted ok/warn/over from `capStatus(machineWeekLoad(...))`.

---

## 7. Drag & drop  *(includes the recent change — read carefully)*

Native HTML5 DnD. Two drag sources, one drop target.

### 7.1 Sources
- **Backlog cards** (`.bl-card`, `draggable`) — `onDragStart` sets `draggingStep = step` and
  `dataTransfer`; `onDragEnd` clears it.
- **Timeline nodes** (`.node`) — **also draggable** so a *placed* step can be moved to another
  machine row / day. `draggable={!s.gereed}` (done steps are locked). `onDragStart` stops propagation
  (so it doesn't also select) and calls the same `onDragStartStep(e, s)`; `onDragEnd` clears.
  > **This was a fix**: originally only backlog cards were draggable, so a node could be placed but
  > never moved again. Now any non-done node can be re-dragged. The CSS adds
  > `cursor: grab` (`:active` → grabbing) and `.node.dragging { opacity: 0.4 }`.

### 7.2 Target — `.lane` (every machine row)
`onDragOver`: `preventDefault`, compute `day = floor((clientX - laneLeft + scrollLeft)/pxDay)`
clamped to `[0, TOTAL_DAYS-1]`, set `drop = {machine, day}`. The row gets `.drop-active`
(`--accent-soft`) and a `.drop-ghost` preview block (accent dashed, sized to the dragged step's
duration, labelled with the target day). `onDrop`: recompute day, call
`onDrop(draggingStep, machineId, day)` → `dropPlan`. `drop` clears whenever `draggingStep` is null.

### 7.3 Effect — `dropPlan(step, machine, day)`
Captures `{planDay, planMachine}` for undo, sets `step.planDay = day; step.planMachine = machine`,
clears dragging, bumps `rev`, toasts. Works identically for **backlog → timeline** (first plan) and
**timeline → timeline** (re-plan / move). Drop snaps to a **day boundary** at every zoom level.

> **Snap granularity:** drops snap to whole days. That is intentional for week/month zoom. (See §10
> open item — within-day ordering is not yet modeled.)

---

## 8. Selection + detail popover (`NodePop`)

Clicking a node calls `selectNode(step, event)` → sets `selectedStep` and positions a **fixed**
`.node-pop` (300px) near the cursor, clamped to the viewport. Clicking empty lane / `.gantt-rows`,
the × button, or pressing **Esc** clears.

`.node-pop` structure:
- `.np-head` (4px project-color left edge via `::before`): `.np-proj` (color dot + mono id, with
  `padding-right:28px` to clear the close button), `.np-title` (article), **`.np-klant`** (customer,
  its own line under the title).
  > **This was a fix**: the customer name used to sit inline at the right of the id row, *behind* the
  > × button. It now lives on its own `.np-klant` line beneath the title.
- `.np-badges`: status (Gereed / Achterstand / Gepland / Te plannen) + `~ schatting` + `Volgorde` when relevant.
- `.np-rows`: Stap, Volgorde (`n / total`), Machine, Gepland op, Duur (`+ qty`), **Deadline**
  (click → inline `<input type="date">`, `onSetDeadline` recomputes the day-index and updates the
  project + all its steps), and Gereed door (if done).
- `.np-actions`: primary **Ga naar project** (filters backlog to the project), **Gereed** (if not
  done), and a × icon-button (unplan).
- `.np-foot`: **Hele order terugzetten naar backlog** (`unplanProject` — unplans all non-done steps of
  the project).

---

## 9. State, mutations & undo (`planning-app.jsx`)

Single source of truth is the `STEPS` array (mutated in place); a `rev` counter forces re-render
(it's in the Gantt layout `useMemo` deps). View prefs live in `useTweaks` (theme, density, accent,
blockStyle, linkStyle, zoom, showGhost, showDone) so they persist and appear in the Tweaks panel.

Every mutating action pushes a single labelled entry onto `undoStack` and is reversible:
| Action | Function | Undo restores |
|---|---|---|
| Plan / move a step | `dropPlan` | previous `planDay`/`planMachine` |
| Mark done | `markDone` | `gereed`/`gereedOp`/`gereedDoor` |
| Unplan one step | `unplan` | `planDay`/`planMachine` |
| Unplan whole order | `unplanProject` | all changed steps |
| Edit deadline | `setDeadline` | project + steps deadline |

Undo via the toolbar button **or Ctrl/Cmd+Z**. Each action also fires a transient `.plan-toast`.

---

## 10. Open items / next requirements

- [ ] **Reorder the sequence of nodes within a single day.** Today, drops snap to a whole day and the
      vertical order of multiple steps that fall on the same machine+day is decided only by the
      lane-packing algorithm (`planDay`, then `volgorde`) — the user can't deliberately set "this step
      runs before that one *within* the day." We need an explicit **intra-day ordering**: e.g. a
      `dagVolgorde`/sequence index per step, drag-to-reorder of same-day nodes (drop between siblings,
      not just onto a day), and a finer drop affordance that distinguishes "move to day X" from
      "insert at position N within day X". This affects the drop math in §7.2 (need an insertion index,
      not just a day), the lane/stacking model in §5.4 (order by the new sequence field), and likely a
      small drag handle or drop-line between same-day nodes. **Design + data-model decision needed
      before building.**
- Consider connector lines into the backlog panel (currently backlog uses the highlight treatment only).

---

## 11. Build checklist

- [ ] Reuse `styles.css` tokens + primitives; load `planning-styles.css` after it. Keep class names.
- [ ] `projectKleur` palette + hash reused verbatim; color = project everywhere.
- [ ] IBM Plex Sans/Mono; all numerics mono + tabular-nums.
- [ ] KPI row (5 cards, capacity bar on Bezetting, danger on Achterstand).
- [ ] Toolbar: zoom (Dag/Week/Maand), Blok (rand/vol/zacht), Koppeling (lijnen/gloed/beide), undo,
      Prognose, Gereed toggles.
- [ ] Gantt is a sticky-ruler + sticky-label CSS layout; nodes absolutely positioned, **width ∝ duurMin**
      at `PX_PER_DAY[zoom]` (MAX_MIN = one day), lane-packed by day interval.
- [ ] Node block styles + selection/linking styles via `data-blockstyle` / `data-linkstyle`.
- [ ] Connector SVG for lijnen/beide; ring+dim for gloed.
- [ ] **Both backlog cards and non-done nodes are draggable**; lane is the drop target; drop snaps to a
      day and re-plans via the same handler; drop-ghost preview + `.drop-active` highlight.
- [ ] Popover with customer on its own `.np-klant` line, inline deadline edit, go-to-project,
      gereed/unplan, unplan-order.
- [ ] All mutations undoable (button + Ctrl/Cmd+Z) with toasts.
- [ ] Achterstand banner, volgorde warning dot, per-machine weekly capacity bars, Prognose ghost overlay.
- [ ] Today line + auto-scroll-to-today + Vandaag button.
