# 17 — Styling & Theme

## Source of truth

Visual style matches **ToolManager** at `C:\ClaudeProjects\ToolManager-main`.

When starting frontend work, extract from that repo:
- Mantine theme config (colors, primary color, gray scale)
- Typography (font families, sizes)
- Spacing scale
- Component defaults (button radius, table density)
- AppShell dimensions (sidebar width, header height)

Mirror those into `apps/web/src/theme/index.ts`.

## Mantine setup

- `MantineProvider` at the top of `App.tsx`, wrapping device-detected router
- ColorScheme: match ToolManager (likely light, confirm during extraction)
- Default `radius`, `fontFamily`, `primaryColor` set via theme tokens

## Density

- Desktop: tight. Default Mantine `size="xs"` or `"sm"` for `Table`, `TextInput`, `Button`
- Mobile: touch-friendly. `size="md"` or `"lg"` for primary actions

## Colors (placeholder until extraction)

| Token | Use |
|---|---|
| `primary` | Brand color, primary buttons, active nav |
| `success` | Positive movements (Ontvangen) |
| `warning` | Low-stock badge, lock idle banner |
| `danger` | Negative movements (Afgekeurd, Verbruikt) |
| `muted` | Read-only fields, disabled |

Fill in actual hex values after extracting from ToolManager.

## CSS approach

- CSS Modules per component
- No global stylesheet beyond Mantine's reset + a tiny `app.css` for layout root
- Avoid inline styles except for one-offs (computed widths, etc.)
