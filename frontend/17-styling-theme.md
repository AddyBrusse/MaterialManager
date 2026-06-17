# 17 — Styling & Theme

**Superseded by `frontend/19-visual-design.md`**, which has the full token
table (colors, spacing, typography, component anatomy) extracted from the
StaalTrack design handoff and largely implemented in
`apps/web/src/styles/tokens.css` + `apps/web/src/theme/index.ts`.

This file is kept only as a redirect.

## What's actually in `apps/web/src/theme/index.ts`

- `fontFamily`: IBM Plex Sans, `fontFamilyMonospace`: IBM Plex Mono
- `primaryColor`: `blue` (custom tuple matching `--accent` `#2d6df6`)
- `defaultRadius`: `sm`
- Mantine is only used for complex UI (forms, drawers, modals,
  notifications) — page layout and tables use the `st-*` classes in
  `tokens.css` directly, not Mantine `AppShell`/`Table`

See `frontend/18-design-patterns.md` for how to apply this in new pages.
