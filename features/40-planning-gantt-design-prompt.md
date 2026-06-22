# 40 — Planning board: Gantt redesign (design prompt)

> This is a design brief meant to be handed to a design-focused AI tool to
> produce a high-fidelity mockup. It is not an implementation spec — once a
> mockup exists, the actual build should get its own doc/decision entry.

## App context
StockManager — internal inventory + production app for a small CNC/metal
shop (~4 users), Dutch UI, Mantine v7, high-density `xs` sizing, LAN-only.
This is a redesign of an existing planning board (current implementation:
day-column drag/drop grid), not a green-field screen — keep all current
capability, change the timeline from discrete day-columns to a continuous,
zoomable Gantt timeline.

## Style guide — use these exact tokens, don't invent new ones
Fonts: IBM Plex Sans (UI) / IBM Plex Mono (ids, codes, durations, dates) —
mono uses `font-variant-numeric: tabular-nums`.

Colors (light / dark):
- `--bg #fbfbfa / #0d0e11`, `--bg-2 #ffffff / #14161a`, `--bg-chip rgba(15,17,22,.05) / rgba(255,255,255,.06)`
- `--border rgba(15,17,22,.08) / rgba(255,255,255,.08)`
- `--text #0f1116`, `--text-2 #4a4f59`, `--text-3 #7a7f88`
- `--accent #2d6df6`, `--accent-soft rgba(45,109,246,.10)`
- `--success #117a45`, `--warning #a85a00`, `--danger #b8270c` (+ `-soft` variants at .12 opacity)

Radii: sm 4px, md 6px (default), lg 8px. Shadows: `--shadow-sm/md/pop` per spec.
Buttons: height 30px (26px `.sm`), radius 6px, font 12.5px/500, ghost vs primary per spec.
Page padding 24px, card padding 14-18px, table row-height 36-44px.

Full spec: `frontend/19-visual-design.md`. Theme implementation:
`apps/web/src/theme/index.ts`, `apps/web/src/styles/tokens.css`.

## Domain vocabulary (keep Dutch labels in the UI)
- **Project** → has a `levertijdDatum` (deadline) and a deterministic accent
  color via `projectKleur(projectId)` — an 8-color palette
  (`#2d6df6 #16a34a #d97706 #9333ea #0891b2 #dc2626 #0d9488 #7c3aed`), hashed
  from the project id. **Reuse this exact function/palette** — color = project,
  not part/step, and it must stay consistent everywhere the project appears.
- **Productie order** → one per article/qty within a project, has `stappen`.
- **Stap** (step) → smallest planning unit; has `volgorde` (sequence number),
  `machine`, optional `geplandDatum`/`geplandMachine` (when scheduled),
  `gereedOp`/`gereedDoor` (when/who marked it done). Duration (`duurMin`) is
  *computed*, not stored — from the article's recipe/operations, split evenly
  across the order's steps (placeholder duration of 3h shown with `~` prefix
  when the article has no estimate yet).
- **Backlog** = steps with no `geplandDatum` yet ("Te plannen").

## Current planning board — what already exists (preserve/adapt, don't drop)
- Day-column grid: machine rows × weekday columns, native HTML5 drag/drop
  from a left backlog sidebar onto day/machine cells.
- Per-card actions on hover: ✓ gereed melden (mark done), × unplan back to
  backlog, "↩ Alles ongepland" / "↕ Alles verplaatsen" (unplan/move whole
  order), inline deadline edit (click date → date input).
- Undo: every mutating action pushes a single-level undo with a labelled
  button + Ctrl+Z.
- Achterstanden banner: steps scheduled in the past, still not done.
- Per-machine weekly capacity mini-bar (ok/warn/over, based on
  `EFFECTIEVE_MIN` = 4.9h/day effective capacity at 70% efficiency, `MAX_MIN` = 7h).
- Volgorde-waarschuwing: warns when a step is scheduled before a
  lower-`volgorde` sibling step of the same order that isn't done/scheduled
  earlier.
- Backlog filter (by project) + sort (default / by deadline).
- Toggle to show/hide completed (`gereedOp`) steps as faded, non-draggable cards.

## New requirements for this redesign

1. **Horizontal Gantt timeline**, not discrete day columns. Time runs
   left→right; rows are still per-machine (+ "Geen machine" row). Must
   support **zoom** (e.g. day/week/month scale) and **horizontal pan/scroll**
   — mouse wheel + a zoom control, click-drag to pan.
2. **Blocks ("nodes") are sized by estimated duration** — node width is
   proportional to `duurMin` at the current zoom scale, not a fixed-size card.
   Placeholder-duration nodes (`isPlaceholder`) keep the `~` visual treatment.
3. **Color = project**, via the existing `projectKleur` palette/function —
   all nodes/blocks belonging to the same project share one color
   (left border accent today; in the Gantt this can be the full block fill
   or a strong left-edge bar — your call, but it must read as "this color =
   this project" at a glance across machine rows).
4. **Cross-row project linking on selection**: clicking a node highlights
   it and visually connects/highlights every other node belonging to the
   same project (across machine rows and the backlog), so the whole
   project's footprint across the timeline is obvious. Connector lines or a
   shared highlight/outline treatment are both acceptable — propose the
   cleanest option.
5. **Left-side backlog panel** (keep, adapt to the new layout): list of
   unplanned steps/articles ("Te plannen"), filterable by project, sortable
   by deadline — same as today.
6. **Drag-and-drop** from the backlog list onto the Gantt timeline (drop
   target = machine row + time position, snapped to a sensible grid e.g.
   day boundaries even when zoomed to week/month).
7. **Ghost planning / workload preview**: a toggleable overlay mode that
   shows projected workload per week (e.g. from open offertes — see
   `berekenOffertebelasting` in `planningUtils.ts`) as translucent "ghost"
   blocks or a workload curve over the same timeline, without committing
   them to the real schedule. This replaces the simplified offerte-bar that
   exists today.

## What to deliver
A high-fidelity mockup (HTML/CSS, or React if easier) of the redesigned
planning page using the tokens above pixel-precisely (same approach as the
existing `frontend/19-visual-design.md` handoff), covering:
- Default view (timeline + backlog + machine capacity indicators)
- A node selected, showing the same-project cross-row highlighting
- Zoom in/out states
- Ghost-planning overlay toggled on
- Drag-in-progress state (dragging a backlog card over the timeline)

Keep all existing interaction affordances (gereed-melden, unplan/undo,
inline deadline edit, achterstanden banner, volgorde warning) visible
somewhere in the new layout — note in your response where each one lives if
its position changes from the current grid-based design.
