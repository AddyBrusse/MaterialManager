# 13 — Components

## Mantine

Use Mantine v7 components throughout. Avoid custom one-offs when Mantine has it.

Common building blocks:
- `AppShell` (desktop layout — sidebar + header)
- `Table` (compact, bordered, zebra)
- `TextInput`, `NumberInput`, `Select`, `Textarea`
- `Modal`, `Drawer`
- `Badge`, `Alert` (for lock banner, low stock)
- `ActionIcon`, `Button`
- `Tabs` (settings page)
- `FileButton` (photo, PDF upload)

## Shared components (`/components/common`)

| Component | Purpose |
|---|---|
| `UserSelect` | Overlay shown when no user in localStorage |
| `LockBanner` | Yellow strip on item detail when locked by another user |
| `LockedBy` | Inline badge "Bewerkt door X" |
| `CodeInput` | Validated input for `#NNNNN` or `ART-NNNN` |
| `PhotoCapture` | Wraps `<input type="file" accept="image/*" capture="environment">` |
| `PdfViewer` | Inline PDF viewer (for finished good drawings) |
| `WeightDisplay` | Formats computed weight |
| `LengthInput` | Number input with `mm` suffix |
| `LocationPicker` | Cascading select for Rack/Row or Cabinet/Shelf/Box |

## Desktop-only (`/components/desktop`)

| Component | Purpose |
|---|---|
| `Sidebar` | Main navigation, low-stock badge |
| `DataTable` | Wrapper around Mantine Table with sort/filter |
| `MovementTable` | Stock movement history rows |
| `SettingsTabs` | Tab container for admin settings |

## Mobile-only (`/components/mobile`)

| Component | Purpose |
|---|---|
| `MobileHome` | Tile buttons for top actions |
| `ScanView` | Camera + manual code entry |
| `BigActionButton` | Large touch-friendly button |
| `AdjustStockSheet` | Bottom sheet for delta/overwrite toggle |

## Rules

- Files small. If a component nears 150 lines, split it.
- Co-located CSS modules (`Foo.tsx` + `Foo.module.css`)
- Props typed explicitly, no `any`
- Mantine `size="xs"` or `"sm"` for desktop density
- Mantine `size="md"` or `"lg"` for mobile touch targets
