# 19 — Visual Design (StaalTrack handoff)

Source: `design_handoff_staaltrack/` — high-fidelity HTML prototype with screenshots.
**All tokens, copy, and specs in this file are final. Implement pixel-precisely.**

---

## Fonts

```
Sans: IBM Plex Sans  — weights 400 / 500 / 600 / 700
Mono: IBM Plex Mono  — weights 400 / 500 / 600
```

Load via Google Fonts. Apply in Mantine theme:
```ts
fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
fontFamilyMonospace: '"IBM Plex Mono", ui-monospace, monospace',
```

Use **mono** for: IDs, codes, dimensions, heat numbers, prices, stock quantities, dates in tables.
Wrap in a `<Mono>` component: `<Text ff="mono" fz="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>`.

---

## Design tokens → Mantine theme

### Colors

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--bg` | `#fbfbfa` | `#0d0e11` | App background |
| `--bg-2` | `#ffffff` | `#14161a` | Cards, table header, drawer |
| `--bg-sidebar` | `#f6f6f4` | `#0a0b0e` | Sidebar |
| `--bg-hover` | `rgba(15,17,22,.04)` | `rgba(255,255,255,.04)` | Row hover |
| `--bg-chip` | `rgba(15,17,22,.05)` | `rgba(255,255,255,.06)` | Chips, type glyphs, track bar |
| `--border` | `rgba(15,17,22,.08)` | `rgba(255,255,255,.08)` | Dividers, card edges |
| `--border-input` | `rgba(15,17,22,.12)` | `rgba(255,255,255,.12)` | Input borders |
| `--text` | `#0f1116` | `#ecedf0` | Primary text |
| `--text-2` | `#4a4f59` | `#a6a9b0` | Secondary text |
| `--text-3` | `#7a7f88` | `#767982` | Muted / labels |
| `--text-4` | `#a4a8af` | `#545862` | Placeholder |
| `--accent` | `#2d6df6` | `#2d6df6` | Primary action, focus ring |
| `--accent-soft` | `rgba(45,109,246,.10)` | `rgba(45,109,246,.18)` | Chip active bg, selected row |
| `--success` | `#117a45` | same | Op voorraad badge |
| `--success-soft` | `rgba(17,122,69,.12)` | `.22` | Badge bg |
| `--warning` | `#a85a00` | same | Laag badge |
| `--warning-soft` | `rgba(168,90,0,.12)` | `.22` | Badge bg |
| `--danger` | `#b8270c` | same | Uit badge |
| `--danger-soft` | `rgba(184,39,12,.12)` | `.22` | Badge bg |

```ts
// theme/index.ts — override these in createTheme:
primaryColor: 'accent',
colors: {
  accent: ['#e8f0fe','#c5d8fd','#9dbafc','#719bf9','#4d82f7','#2d6df6','#2560e0','#1f52c7','#1844ad','#103494'],
},
```

### Shadows
```css
--shadow-sm:  0 1px 2px rgba(15,17,22,.04)
--shadow-md:  0 1px 2px rgba(15,17,22,.04), 0 4px 12px rgba(15,17,22,.06)
--shadow-pop: 0 12px 32px rgba(15,17,22,.12), 0 2px 6px rgba(15,17,22,.06)
```

### Radii
| Name | Value |
|---|---|
| sm | 4px |
| md (default) | 6px |
| lg | 8px |

---

## Spacing & geometry

| Element | Value |
|---|---|
| Sidebar width | 248px (collapsed: 72px icon-only at <1100px) |
| Topbar height | 56px |
| Drawer width | 480px |
| Page horizontal padding | 24px |
| Page header padding | 22px 24px 16px |
| Stat card padding | 14px 16px |
| Card padding | 18px |
| Table cell padding (compact) | 8px × 12px, row-height 36px |
| Table cell padding (comfortable) | 12px × 14px, row-height 44px |
| Stat grid gap | 12px |
| Form grid gap | 14px |

---

## Typography scale

| Use | Size | Weight | Notes |
|---|---|---|---|
| Page title | 22px / 600 | ls -0.015em | "Voorraad", "Artikelen" |
| Page subtitle | 13px / 400 | — | `--text-3` |
| Stat label | 11.5px / 500 | uppercase, ls 0.04em | with 13px icon |
| Stat value | 22px mono / 500 | ls -0.02em, tabular | the big number |
| Section eyebrow | 12px / 500 | uppercase, ls 0.04em | "DETAILS", "HISTORIE" |
| Table header | 11.5px / 500 | ls 0.02em | `--text-3` |
| Table body | 12.5–13px / 400–500 | — | 500 for emphasis cells |
| Mono cells | 12px mono / 400–500 | tabular-nums | IDs, dims, prices |
| Badge | 11px / 500 | — | pill |
| Op chip | 11px / 500 | — | bewerking chips |
| Caption / sub-row | 11–11.5px | — | `--text-3` |

---

## App shell layout

```
┌─────────────────────────────────────────┐
│ sidebar (248px)  │  main                │
│                  │  ┌──────────────────┐│
│  [ST] StaalTrack │  │ topbar (56px)    ││
│  Voorraadbeheer  │  ├──────────────────┤│
│                  │  │ page-header      ││
│  ──org-switch──  │  │ (stats/banner)   ││
│                  │  │ toolbar          ││
│  nav group 1     │  │ table-wrap       ││  ← flex:1, scrolls internally
│  > Voorraad  [N] │  └──────────────────┘│
│  > Binnen boeken │                      │
│  > Instellingen  │                      │
│                  │                      │
│  nav group 2     │                      │
│  > Artikelen [N] │                      │
│                  │                      │
│  ──────────────  │                      │
│  [JV] Jeroen  🔔 │                      │
└─────────────────────────────────────────┘
```

### Sidebar anatomy
- **Brand**: 28px mark (gradient bg, mono "ST"), "StaalTrack" 14px/600, "Voorraadbeheer" 10.5px uppercase
- **Org switcher**: white card, 8px dot (orange), chevron — decorative
- **Nav groups**: 10.5px uppercase group label, then `sb-item` buttons
- **Active nav item**: white bg, border, shadow-sm. Inactive: transparent, `--text-2`
- **Count pill**: mono 11px, `--bg-chip` bg, right-aligned in item
- **Footer**: 26px avatar (orange gradient, initials), name + role, bell icon-btn

### Topbar anatomy
- Left: breadcrumb `Materiaal beheer › **Voorraad**` (13px, `--text-3` / `--text`)
- Right: `Geschiedenis` (ghost btn), `Etiket printen` (btn), `+ Nieuw` (primary btn)

### Page header
```
padding: 22px 24px 16px
├── div
│   ├── h1.page-title   22px/600
│   └── p.page-sub      13px text-3
└── .page-actions  (margin-left: auto)
    └── buttons
```

---

## Components

### Button
```
height: 30px  padding: 0 11px  radius: 6px  font: 12.5px/500
border: 1px solid --border-input  bg: --bg-2

.primary   bg+border: --accent  color: white  hover: --accent-hover
.ghost     bg/border: transparent  color: --text-2  hover: --bg-hover
.sm        height: 26px  padding: 0 9px  font: 12px
.lg        height: 36px  padding: 0 14px  font: 13px

icon size: 14px inside default, 13px inside .sm
```

### Filter chip
Pill with `border-radius: 999px`, height 26px, padding `0 8px 0 10px`, font 12px.

- **Inactive**: dashed border (`--border-input`), color `--text-2`, `+ Label`
- **Active**: solid border transparent, bg `--accent-soft`, color `--accent`, `Label : Value ×`
- Implemented via an `<select>` overlaid at `opacity:0` behind the chip text

### Status badge
Pill `padding: 2px 7px`, font 11px/500, with a 6px solid dot.

| Status | Text colour | Background |
|---|---|---|
| Op voorraad | `--success` | `--success-soft` |
| Laag | `--warning` | `--warning-soft` |
| Uit | `--danger` | `--danger-soft` |
| Gepland | `--accent` | `--accent-soft` |
| neutral | `--text-2` | `--bg-chip` |

Status is **always derived**:
```ts
function deriveStatus(voorraad: number, min: number, max: number, gepland = false) {
  if (voorraad === 0)           return 'uit'
  if (voorraad < min)           return 'laag'
  if (gepland)                  return 'gepland'   // articles only
  if (voorraad >= max * 0.85)   return 'vol'
  return 'ok'
}
```

### Stock level mini-bar
```
.lvl        flex row, align-center, gap 8px, full width
.lvl-bar    flex:1, height 4px, radius 999, bg --bg-chip
  > i       fill pct, bg success/warning/danger
.lvl-num    mono 12px, min-w 56px, text-right  "voorraad/max"
```

### Table
```css
border-collapse: separate; border-spacing: 0;
thead th: sticky top:0 z-index:2; bg --bg-2;
         11.5px/500 --text-3; ls 0.02em; 1px border-bottom
tbody td: padding var(--cell-pad-y) var(--cell-pad-x);
          height var(--row-h); border-bottom 1px --border
tbody tr:hover    → --bg-hover
tbody tr[selected] → --accent-soft
last row td: border-bottom: 0
```

### Checkbox
14×14, 1.5px border, 3px radius. On: `--accent` fill + white check via pseudo-rotated borders.

### Drawer
480px right-anchored, full height, `--shadow-pop`, slide-in 180ms (`translateX(20px→0) + opacity 0→1`).
Scrim: `rgba(15,17,22,.32)`.

```
.drawer-hd    padding 16px 20px, border-bottom, flex, gap 10
  type-pic (36×36) + name/id + × close button
.drawer-bd    flex:1 overflow-auto, padding 18px 20px
.drawer-ft    border-top, padding 12px 20px, flex end gap 8
  Geschiedenis (ghost) · Reserveren · Mutatie (primary)
```

Drawer body sections:
1. **3 stat tiles** (Op voorraad / Gereserveerd / Beschikbaar) — flex row, each with label + big mono value + sub
2. **"DETAILS" eyebrow** + `dl.kv` (grid `120px 1fr`, 6px row gap, 14px col gap)
3. **"HISTORIE" eyebrow** + mutation feed (date · type · who/nr · ±delta in green/red)

### Stat cards grid

4-across (or 2×2 on tablet), `12px` gap.
Each card: `--bg-2`, 1px border, 8px radius, `14px 16px` padding.

```
.stat-lbl    11.5px/500 uppercase ls 0.04em --text-3, optional icon 13px
.stat-val    22px mono/500 ls -0.02em  (unit in 13px/400 --text-3 inline)
.stat-foot   11.5px --text-3 + delta span in --success or --danger
```

---

## Screens

### Voorraad (`/raw` → rename to `/voorraad`)

**Page header actions**: Exporteer · Scan · **+ Mutatie** (primary)

**Info banner** (under header, before stats):
```
dashed border, 8px radius, flex, icon + text:
"Elke regel vertegenwoordigt een unieke partij — onderscheiden door
smeltnummer, lengte en afwerking."
```

**Stat cards** (4):
1. Totaal gewicht (ton) — sum of `voorraad × kg`, `↗ 3,2% t.o.v. vorige week`
2. Unieke artikelen — count, `{n} actief deze maand`
3. Lage voorraad — warning tint, `↗ 2 sinds gisteren`
4. Niet op voorraad — danger tint, `4 bestellingen lopend`

**Toolbar filters**: Search (`Zoek artikel, ID, kwaliteit of locatie…` + `⌘K` kbd) · Type chip · Kwaliteit chip · Status chip · Meer filters (ghost) · grid/list toggle

**Table columns** (in order):
```
☐ | Artikel | Kwaliteit | Afmeting | Afwerking | Voorraad | Gereserveerd | Niveau | Locatie | Laatste mutatie | ⋯
```

Column details:
- **Artikel**: type-pic (26×26 chip) + name bold + `ID · HeatNr` mono sub (11.5px --text-3)
- **Kwaliteit**: mono cell, e.g. `S355J2`
- **Afmeting**: mono muted, e.g. `1500×3000`, `Ø60.3 × 3.6`, `L 12000`
- **Afwerking**: neutral badge OR `—` if "Blank"
- **Voorraad**: right-aligned mono bold
- **Gereserveerd**: right-aligned mono muted, `—` if 0
- **Niveau**: mini-bar + `voorraad/max`
- **Locatie**: muted, e.g. `Hal A · Stelling 02`
- **Laatste mutatie**: status badge + relative time (11.5px muted), e.g. `vandaag`

**Table footer**: `{filtered} van {total} artikelen` + batch actions when selection > 0 (Reserveren · Verplaatsen · Etiketten) + pager

**Item drawer** (480px, opens on row click — not on checkbox click):
- Header: type-pic 36×36 + name + `ID · grade` + × close
- 3 stat tiles: Op voorraad · Gereserveerd · Beschikbaar
- DETAILS `dl.kv`: Artikelcode · Kwaliteit · Afmeting · Afwerking · Gewicht/stuk · Min · Max · Locatie · Smeltnummer · Leverancier · Inkoopprijs · Laatste mutatie
- HISTORIE feed (hardcoded mock initially): date | type + source·nr | `+N`/`-N`
- Footer: Geschiedenis (ghost) · Reserveren · **Mutatie** (primary)

### Binnen boeken (`/binnenboeken`)

**Page header actions**: `Concept opslaan` · **✓ Verwerken** (primary)

**Alert banner** (accent-soft bg): `Er staan 2 openstaande ontvangsten klaar voor verwerking. Bekijken →`

**Layout**: `grid 1.4fr 1fr gap 16px`

**Left — Ontvangst card**:
- Header: "Ontvangst" + sub + `• Concept` badge
- 2-col grid: Ontvangstnummer (e.g. `ONT-2026-0419`) · Pakbonnummer · Leverancier (select) · Datum ontvangst
- REGELS section: eyebrow + summary (`N regels · M stuks · Xkg`) + Scan + Regel buttons
- Inline editable table: Artikel (type-pic + name + `ID · grade`) · Smeltnr (text input mono) · Aantal (number input right-align) · Locatie (select) · × remove
- Opmerking textarea

**Right column**:
- Samenvatting card: KV list (Regels · Totaal stuks · Totaal gewicht · Leverancier · Pakbon) + info note
- Recent geboekt card: last 8 receipts table (Nummer · Datum · Leverancier · kg · status badge)

### Artikelen (`/artikelen`)

Same dense-table pattern as Voorraad. Different columns:

**Stat cards** (4):
1. Actieve artikelen — `↗ 4 deze maand toegevoegd`
2. Klanten — `X met lopende order`
3. In productie gepland — `volgende 20 werkdagen`
4. Onder minimum — warning tint, `bijbestellen of inplannen`

**Toolbar filters**: Search (`Zoek artikelnr, naam, klant of tekening…`) · Klant · Bewerking · Status

**Table columns**:
```
☐ | Artikel | Klant | Bewerking | Grondstof | Voorraad | Niveau | Locatie | Laatste productie | Planning | ⋯
```

- **Artikel**: flat glyph + name bold + `ID · Tekening rev X` mono sub
- **Klant**: bold name
- **Bewerking**: wrapping row of op-chips (`11px/500, bg --bg-chip, radius 4px, padding 1px 7px`)
- **Grondstof**: `Plaat 8 mm · S235JR` muted
- **Laatste productie**: status badge + relative time
- **Planning**: info badge (`over 5 dgn`) or `—`

**Selection footer**: `Productie inplannen` · `Bijbestellen` · `Etiketten`

### Instellingen (`/instellingen`)

**Top tabs** (underline style, 2px accent bar on active):
Algemeen · Locaties · Gebruikers & rollen · Nummering · Meldingen · Integraties

**Algemeen tab** — settings rows pattern:
```
grid: 1fr 280px per row
Left: title 14px/600 + description 12.5px --text-3
Right: input / select / toggle
Sections separated by: "Organisatie", "Voorraadgedrag"
Sticky save bar at bottom
```

**Locaties tab** — table: Code (mono) · Naam · Type · Capaciteit (kg mono) · Bezet (mini-bar %) · Status badge · ⋯ menu

**Gebruikers & rollen tab** — team table: Avatar+name · Email (mono 11.5px --text-3) · Rol badge · Locaties · Laatste login · Status badge

---

## Implementation priorities for our codebase

### 1. Update `apps/web/src/theme/index.ts`
- Font: IBM Plex Sans + IBM Plex Mono (Google Fonts)
- Primary: `#2d6df6` (not current blue)
- Background: `#fbfbfa`
- Default radius: 6px (not `sm`)
- Remove `Table` defaults (we'll style the custom table ourselves)

### 2. Redo the sidebar (`routes/desktop/index.tsx`)
- Remove Mantine `AppShell.Navbar` / `MantineNavLink` — build from scratch with CSS
- Two nav groups: "Materiaal beheer" (Voorraad · Binnen boeken · Instellingen) + "Artikelen"
- Brand mark + org switcher
- User footer with avatar + bell

### 3. Add topbar breadcrumb
Currently just shows "StockManager" title. Needs breadcrumb + global actions (Geschiedenis · Etiket printen · + Nieuw).

### 4. Rework Voorraad page
- Add stat cards (4-across)
- Add info banner
- Redesign toolbar with filter chips (not Mantine Selects)
- Redesign table: add checkbox col, type-pic, heat number sub-row, Afwerking badge, Gereserveerd col, Niveau mini-bar, Laatste mutatie badge+time
- Redesign detail drawer per spec above

### 5. New: Binnen boeken page

### 6. New: Artikelen page

### 7. New: Instellingen page (tabs)

---

## Component helpers to build once and reuse

```tsx
// Mono text — use everywhere for IDs, codes, dims, prices
<Mono fz="xs">ST-10042</Mono>

// Status badge — derives from voorraad/min/max
<StatusBadge status="laag" />

// Stock level mini-bar
<StockLevel voorraad={14} max={50} status="ok" />

// Type glyph chip (26×26 or 36×36)
<TypePic kind="buis" size={26} />

// Filter chip with hidden select
<FilterChip label="Type" value={type} options={TYPES} onChange={setType} />
```

---

## Dark mode

Supported. Toggle via `data-theme="dark"` on the app root.
Use Mantine's `ColorSchemeScript` + `useMantineColorScheme`.
All token overrides are in `[data-theme="dark"]` in `styles.css` — map to Mantine's `light-dark()` utility.

---

## What NOT to port

`tweaks-panel.jsx` — design preview panel only, not for production.
Placeholder customers / suppliers / locations — wire to real data.
