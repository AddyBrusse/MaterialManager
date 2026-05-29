# Handoff: StaalTrack — Steel Inventory System

## Overview
StaalTrack is a Dutch-language inventory management system for a steel fabrication shop (Van Dijk Staal B.V.). It tracks two fundamentally different things:

1. **Materialen / Voorraad** — raw steel stock: plates, tubes, beams, bars. Every batch is unique (heat number, length, finish vary), even when the "type" is the same.
2. **Artikelen** — customer-specific machined products kept on stock to reduce lead time. Each article belongs to one customer and has a fixed operation chain (lasersnijden → kanten → boren → …).

The product also supports check-in (Binnen boeken) of new stock from suppliers, and a settings area for locations, users, numbering, notifications and integrations.

## About the design files
The files in this bundle are **design references created in HTML** — interactive prototypes that show intended look, structure and behaviour. **Do not ship the HTML directly.** Recreate the designs in the target codebase using its existing framework, component library and conventions. If no codebase exists yet, pick a stack appropriate for an internal B2B tool (recommended: React + TypeScript + Vite + a headless UI library like Radix or shadcn/ui).

## Fidelity
**High-fidelity.** All colors, typography, spacing, interaction states and copywriting are final. Recreate pixel-perfectly using the target codebase's primitives — match the design tokens listed below exactly.

## Language
**Dutch throughout** — UI copy, labels, badges, statuses, button text. Numbers use Dutch formatting (`1.234,56`). Dates are formatted as `26 mei 2026`. Keep this when implementing.

---

## Information architecture

### Sidebar — two grouped sections
```
Materiaal beheer
├── Voorraad           (default route, shows badge count)
├── Binnen boeken      (shows count of open receipts)
└── Instellingen

Artikelen
└── Artikelen          (shows total article count)
```

The sidebar also contains:
- Brand mark + name "StaalTrack" / sub "Voorraadbeheer"
- Org switcher card "Van Dijk Staal B.V." (decorative dropdown)
- Footer with user avatar (initials), name "Jeroen van Velsen", role "Magazijnchef", and a bell (notifications) icon button

---

## Screens

### 1. Voorraad (`/voorraad`)
Dense, sortable, filterable table of raw materials. **Hero screen** — most usage happens here.

**Page header**
- Title: "Voorraad"
- Sub: "Actuele stand van alle materialen op locatie"
- Actions (right): `Exporteer`, `Scan`, `Mutatie` (primary)

**Info banner** under header
- Dashed-border card with box icon
- Copy: "Elke regel vertegenwoordigt een unieke partij — onderscheiden door **smeltnummer**, **lengte** en **afwerking**."
- This is critical: communicates the unique-batch model to the user.

**Stat cards** (4 across)
- Totaal gewicht (ton) — `↗ 3,2%` vs vorige week
- Unieke artikelen — count, "X actief deze maand"
- Lage voorraad — warning-tinted icon, `↗ 2` sinds gisteren
- Niet op voorraad — danger-tinted icon, "4 bestellingen lopend"

**Toolbar**
- Search box (placeholder `Zoek artikel, ID, kwaliteit of locatie…`), `⌘K` kbd hint
- Filter chips (dashed border → solid when active, with `×` to clear):
  - Type (Plaat, Buis, Koker, IPE/HEA/HEB/UNP, Hoekstaal, Stafstaal, Rondstaal)
  - Kwaliteit (S235JR, S275JR, S355J2, S355MC, S460M, C45, 42CrMo4)
  - Status (Op voorraad / Laag / Uit / Vol)
- Right side: `Meer filters`, grid/list toggle

**Table columns**
| Col | Notes |
|---|---|
| ☐ | Checkbox (header toggles all visible) |
| Artikel | Type-glyph + Name + `ID · HeatNr` (mono) sub |
| Kwaliteit | Mono, e.g. `S355J2` |
| Afmeting | Mono dimensions e.g. `1500x3000`, `Ø60.3 × 3.6`, `L 12000` |
| Afwerking | Badge if not "Blank", else em-dash |
| Voorraad | Right-aligned mono, bold |
| Gereserveerd | Right-aligned mono, em-dash when 0 |
| Niveau | Mini bar (green/orange/red) + `voorraad/max` |
| Locatie | e.g. `Hal A · Stelling 02` |
| Laatste mutatie | Status badge + relative time |
| ⋯ | Row actions |

Row click opens detail drawer (right side, 480px). Header sticky on scroll. Selection footer reveals batch actions (Reserveren / Verplaatsen / Etiketten).

**Item drawer**
- Header: type glyph + name + `ID · grade`
- 3 stat tiles: Op voorraad / Gereserveerd / Beschikbaar
- Key-value list (Details): Artikelcode, Kwaliteit, Afmeting, Afwerking, Gewicht/stuk, Min · Max, Locatie, Smeltnummer, Leverancier, Inkoopprijs, Laatste mutatie
- Historie: feed of mutations (date · type · who · `+N` / `-N`)
- Footer: Geschiedenis (ghost), Reserveren, Mutatie (primary)

### 2. Binnen boeken (`/binnenboeken`)
Two-column receipt entry layout.

**Page actions:** `Concept opslaan`, `Verwerken` (primary)

**Alert** (accent-soft background): "Er staan **2 openstaande ontvangsten** klaar voor verwerking. Bekijken →"

**Left column — Ontvangst card**
- Header: "Ontvangst" + sub "Vul de gegevens van de pakbon in" + "Concept" badge
- Fields (2-col grid): Ontvangstnummer (e.g. `ONT-2026-0419`), Pakbonnummer, Leverancier (select), Datum ontvangst
- Regels section
  - Header label + count summary (`N regels · M stuks · Xkg`) + actions (`Scan`, `Regel`)
  - Inline table with editable cells: Artikel (with mini type glyph), Smeltnr (text input, mono), Aantal (number input, right-aligned), Locatie (select), remove button
- Opmerking textarea at bottom

**Right column**
- Samenvatting card: KV list (Regels, Totaal stuks, Totaal gewicht, Leverancier, Pakbon) + info note about what verwerken does
- Recent geboekt card: table of last 8 receipts with Nummer/datum/leverancier/kg/status

### 3. Artikelen (`/artikelen`)
**Same dense-table layout as Voorraad** but for customer-machined articles. This is intentional — same mental model, different domain.

**Stat cards**
- Actieve artikelen — `↗ 4` deze maand toegevoegd
- Klanten — "X met lopende order"
- In productie gepland — "volgende 20 werkdagen"
- Onder minimum — warning tint, "bijbestellen of inplannen"

**Toolbar filters**
- Search (`Zoek artikelnr, naam, klant of tekening…`)
- **Klant** chip (12 customers like Damen Shipyards, VDL Groep, Mammoet, etc.)
- **Bewerking** chip (Lasersnijden, Kanten, Draaien, Frezen, Boren, Lassen, Ponsen, Zagen)
- **Status** chip (Op voorraad / Laag / Uit / Gepland / Vol)

**Table columns**
| Col | Notes |
|---|---|
| ☐ | Checkbox |
| Artikel | Plate glyph + Name + `ID · Tekening rev X` (mono) sub |
| Klant | Bold name, e.g. "Damen Shipyards" |
| Bewerking | Wrapping row of subtle chips (`Lasersnijden`, `Kanten`, …) |
| Grondstof | "Plaat 8 mm · S235JR" — links the article to a raw material spec |
| Voorraad | Right-aligned mono |
| Niveau | Mini bar + voorraad/max |
| Locatie | Same locations as Voorraad |
| Laatste productie | Status badge + relative ("3 dgn geleden") |
| Planning | Info badge ("over 5 dgn") or em-dash |
| ⋯ | |

Selection footer: `Productie inplannen`, `Bijbestellen`, `Etiketten`.

### 4. Instellingen (`/instellingen`)
Top tabs: **Algemeen**, **Locaties**, **Gebruikers & rollen**, **Nummering**, **Meldingen**, **Integraties**.

- **Algemeen** — settings rows pattern (`1fr 280px` grid: title+desc / control). Sections: Organisatie (bedrijfsnaam, KvK, eenheid, tijdzone), Voorraadgedrag (toggles: auto-reserveren, negatieve voorraad, smeltnummer verplicht; drempel input). Sticky save bar at bottom.
- **Locaties** — table of warehouse locations: code (mono), naam, type, capaciteit (kg), bezet (mini bar %), status badge, more menu. `Locatie` add button.
- **Gebruikers & rollen** — team table: avatar+name, email (mono small), rol badge, locaties, laatste login, status badge.
- **Nummering** — number-sequence inputs with variable hints (`{YYYY}`, `{SEQ:5}`).
- **Meldingen** — table with toggle switches per channel (In-app / E-mail / SMS).
- **Integraties** — card grid (Exact Online, AFAS Profit, Lantek Expert, Bystronic ByVision, Trumpf TruTops, Microsoft Teams) with Verbonden / Koppelen state.

---

## Domain model

### Material (raw steel)
```ts
type Material = {
  id: string;              // "ST-10042"
  type: SteelType;         // plaat | buis | koker | ipe | hea | heb | unp | hoek | stafstaal | rondstaal
  naam: string;            // "Plaat 10 mm" / "HEA 200" / "Koker 80x80x4"
  afmeting: string;        // "1500x3000" / "L 12000" / "Ø60.3 × 3.6"
  grade: string;           // S235JR | S275JR | S355J2 | S355MC | S460M | C45 | 42CrMo4
  afwerking: Finish;       // Blank | Gestraald | Verzinkt | Gepoedercoat | Primer | Geslepen
  locatie: string;         // "Hal A · Stelling 02"
  leverancier: string;
  heatNr: string;          // "H348221" — unique per batch, key traceability field
  voorraad: number;
  gereserveerd: number;
  min: number;
  max: number;
  kg: number;              // per unit
  prijs: number;           // EUR per kg
  laatsteMutatie: string;  // relative ("vandaag", "3 dagen geleden")
  laatsteMutatieDays: number;
  dikte?: number;          // mm — only for plates
  eenheid: "stuks" | "m";
};
```

**Key insight:** materials are NOT a fixed catalog. Multiple rows can share the same `naam + afmeting + grade` but differ in `heatNr`, `afwerking`, batch length etc. Treat each row as a unique partij. When modeling in a real DB, the "article master" is implicit — what's stored is **batches**.

### Article (customer-machined product)
```ts
type Article = {
  id: string;              // "BAK-1042" — customer prefix + sequence
  naam: string;            // "Frame-plaat A1"
  klant: Customer;         // fixed — articles belong to one customer
  bewerkingen: Operation[];// ordered chain: ["laser", "kant", "boor"]
  grondstof: string;       // "Plaat 8 mm" — references material specs, not a hard FK
  grade: string;
  voorraad: number;
  gereserveerd: number;
  min: number;
  max: number;
  locatie: string;
  tekening: string;        // "TK-4823" — drawing number
  rev: "A" | "B" | "C";
  prijs: number;           // EUR per unit
  looptijd: number;        // working days lead time when made-to-order
  laatsteProductie: string;
  laatsteProductieDays: number;
  volgendePlanning: string | null; // "over 5 dgn" or null
};
```

**Key insight:** articles bridge customer demand and raw material supply. The "grondstof" field is descriptive — actual material allocation happens at production time and consumes a specific material batch (with heatNr) for certificate chains.

### Status derivation
Status is **derived**, not stored:
```
voorraad === 0           → Uit       (danger)
voorraad < min           → Laag      (warning)
volgendePlanning != null → Gepland   (info)        ← articles only
voorraad ≥ max * 0.85    → Vol       (info)
otherwise                → Op voorraad (success)
```

---

## Design tokens

### Colors — light theme (default)
```css
--bg:              #fbfbfa;   /* app background */
--bg-2:            #ffffff;   /* cards, sticky table header */
--bg-sidebar:      #f6f6f4;   /* sidebar background */
--bg-hover:        rgba(15, 17, 22, 0.04);
--bg-active:       rgba(15, 17, 22, 0.07);
--bg-input:        #ffffff;
--bg-chip:         rgba(15, 17, 22, 0.05);

--border:          rgba(15, 17, 22, 0.08);
--border-strong:   rgba(15, 17, 22, 0.14);
--border-input:    rgba(15, 17, 22, 0.12);

--text:            #0f1116;
--text-2:          #4a4f59;
--text-3:          #7a7f88;
--text-4:          #a4a8af;

--accent:          #2d6df6;   /* primary action / focus ring */
--accent-soft:     rgba(45, 109, 246, 0.10);
--accent-hover:    #2560e0;

--success:         #117a45;   /* "Op voorraad" badge, healthy levels */
--success-soft:    rgba(17, 122, 69, 0.12);
--warning:         #a85a00;   /* "Laag" */
--warning-soft:    rgba(168, 90, 0, 0.12);
--danger:          #b8270c;   /* "Uit" */
--danger-soft:     rgba(184, 39, 12, 0.12);
```

### Colors — dark theme
```css
--bg:              #0d0e11;
--bg-2:            #14161a;
--bg-sidebar:      #0a0b0e;
--bg-hover:        rgba(255, 255, 255, 0.04);
--bg-input:        #16181c;
--bg-chip:         rgba(255, 255, 255, 0.06);
--border:          rgba(255, 255, 255, 0.08);
--border-strong:   rgba(255, 255, 255, 0.16);
--border-input:    rgba(255, 255, 255, 0.12);
--text:            #ecedf0;
--text-2:          #a6a9b0;
--text-3:          #767982;
--text-4:          #545862;
```

### Typography
- **Sans:** `IBM Plex Sans` (400, 500, 600, 700) — UI, labels, body
- **Mono:** `IBM Plex Mono` (400, 500, 600) — IDs, codes, numbers, dimensions, technical data

| Use | Size | Weight | Letter-spacing | Notes |
|---|---|---|---|---|
| Page title | 22px | 600 | -0.015em | "Voorraad", "Artikelen" |
| Page sub | 13px | 400 | — | --text-3 |
| Stat label | 11.5px | 500 | 0.04em uppercase | --text-3, with 13px icon |
| Stat value | 22px mono | 500 | -0.02em | `tabular-nums` |
| Section H3 | 14px | 600 | — | settings sections |
| Section eyebrow | 12px | uppercase | 0.04em | --text-3, "DETAILS", "HISTORIE" |
| Body / table | 12.5–13px | 400/500 | — | row data uses 500 for emphasis |
| Mono cells (ID, dims) | 12px mono | 400/500 | — | `font-variant-numeric: tabular-nums` |
| Caption | 11–11.5px | — | — | --text-3, sub-rows under names |
| Badge | 11px | 500 | — | pill, 2/7px padding |
| Op-chip (article bewerking) | 11px | 500 | — | 1/7px padding, --bg-chip background |

### Spacing & geometry
| Token | Value |
|---|---|
| Page horizontal padding | 24px |
| Page header padding | 22px 24px 16px |
| Stat-card padding | 14px 16px |
| Card padding | 18px |
| Stat grid gap | 12px |
| Form grid gap | 14px |
| Table cell padding (compact) | 8px × 12px, row-height 36px |
| Table cell padding (comfortable) | 12px × 14px, row-height 44px |
| Sidebar width | 248px (collapsed at <1100px → 72px icon-only) |
| Drawer width | 480px |
| Topbar height | 56px |
| Border radius (sm/md/lg) | 4px / 6px / 8px |

### Shadows
```css
--shadow-sm:  0 1px 2px rgba(15, 17, 22, 0.04);
--shadow-md:  0 1px 2px rgba(15, 17, 22, 0.04), 0 4px 12px rgba(15, 17, 22, 0.06);
--shadow-pop: 0 12px 32px rgba(15, 17, 22, 0.12), 0 2px 6px rgba(15, 17, 22, 0.06);
```

---

## Components

### Button
```
height: 30px (sm: 26px, lg: 36px)
padding: 0 11px
border-radius: 6px
font: 12.5px / 500
border: 1px solid var(--border-input)
background: var(--bg-2)

.primary  → bg & border var(--accent), color white, hover --accent-hover
.ghost    → bg/border transparent, color --text-2, hover --bg-hover
.sm       → 26px tall
```

### Filter chip
- Inactive: dashed border, `+ Label` with plus glyph, --text-2
- Active: solid border, `Label : Value` (value in --text), background --accent-soft, color --accent, with `×` clear
- Click opens a native select overlay (zero-opacity `<select>` positioned over the chip).

### Status badge
- Pill, 2/7px padding, 11px / 500, with a 6px solid color dot.
- Variants: `ok` (success), `warn` (warning), `danger`, `info` (accent), default neutral.

### Stock level mini-bar
- 4px tall, 999px radius, --bg-chip track
- Fill: success / warning / danger based on status
- Right-aligned `voorraad/max` mono label, min-width 56px

### Toggle switch
- 34×20, --border-strong → --accent when on
- 16px white circle, transform translateX(14px) on

### Checkbox
- 14×14, 1.5px border, 3px radius
- On: --accent fill, white check via two pseudo-borders rotated -45°

### Table
- `border-collapse: separate`, `border-spacing: 0`
- Sticky header (`position: sticky; top: 0; z-index: 2`)
- Header: 11.5px / 500 / --text-3 / uppercase-ish (letter-spacing 0.02em)
- Row hover: --bg-hover
- Selected row: --accent-soft
- 1px --border bottom on every row, no bottom on last row

### Drawer
- Right-anchored, 480px wide, full-height, with --shadow-pop
- Scrim: rgba(15,17,22,0.32)
- Slide-in animation: 180ms, translateX(20px → 0) + opacity 0 → 1

---

## Interactions

| Action | Behavior |
|---|---|
| Click sidebar item | Switch route (use real router) |
| Click table row | Open item drawer; row enters selected style only when checked |
| Click checkbox | Toggle selection; header toggles all visible filtered rows |
| Sort header click | Toggle asc/desc on that key; arrow icon shows direction |
| Filter chip change | Live-filter table client-side; clearing all chips returns all rows |
| Search input | Live-filter (debounced 150ms recommended) across naam, id, grade, locatie / klant, tekening |
| Selection > 0 | Footer reveals batch actions; counter shows N geselecteerd |
| Click action chip × | Clear that filter without opening select |
| `⌘K` | Focus the search input (Voorraad + Artikelen) |
| Drawer close | Click scrim or × button |
| Binnen boeken — Regel | Append row with default item, qty 1, first location |
| Binnen boeken — × on row | Remove row |
| Binnen boeken — Verwerken | (Demo) — in production: post to API, on success → toast + reset |

---

## State to manage

**Per page**
- Search query (string)
- Active filters (object of chip → value)
- Sort key + direction
- Selection set (Set<id>)
- View mode (where applicable)

**App-level**
- Current route
- Theme: `light | dark`
- Density: `compact | comfortable`
- Accent color (token override)
- Auth/user (out of scope of mock — wire to your real auth)

**Server**
- Materials list (paginate at ~100 in real impl; the mock shows ~120 client-side)
- Articles list
- Receipts (Binnen boeken history)
- Locations, Users, Settings (Instellingen)

---

## Routing
```
/voorraad              (default)
/voorraad/:id          (could open drawer or push to detail)
/binnenboeken
/binnenboeken/nieuw    (the form shown by default)
/artikelen
/artikelen/:id
/instellingen
/instellingen/:tab
```

---

## Responsive

- **≥1100px:** Full sidebar (248px), 4-column stat grid, 2-column receiving layout
- **<1100px:** Sidebar collapses to 72px icon rail (labels hidden), stats 2-col, receiving stacks. This is the tablet/floor mode for warehouse use.

The current prototype does not implement a mobile (<640px) layout — confirm scope with product before designing one.

---

## Implementation notes for Claude Code

1. **Use the codebase's existing primitives.** Don't import a new component library if Button / Input / Table / Drawer already exist. Map the design tokens onto theirs and re-style minimally.
2. **Pin the table.** The Voorraad table is the most important UI in the product. Sticky header, virtual scrolling at >500 rows (TanStack Virtual or react-window), and proper keyboard nav (arrow keys to move row, Space to select, Enter to open drawer) are worth investing in.
3. **The "every material is a unique batch" rule** must be visible in the UI. Don't collapse materials to a deduplicated catalog — that's what Artikelen is. Materials display individual partijen.
4. **Articles vs materials are the same UX, different schema.** Build one `<DataTable>` primitive and reuse it for both — that's intentional in the design and a feature to preserve.
5. **i18n.** All strings are Dutch. Centralize them; the system will likely need English for non-Dutch operators eventually.
6. **Numbers.** Use `Intl.NumberFormat('nl-NL')` everywhere — kg, prices, counts.
7. **Mono cells.** Wrap all IDs, codes, dimensions, smeltnummers, prices in a `<Mono>` component with `font-variant-numeric: tabular-nums` so columns align cleanly.
8. **Heat number traceability.** Heat numbers are not decorative — for ISO 9001 / EN 1090 compliance they must be retained through every mutation and surfaceable in a certificate chain. Build the data model with that constraint from day one.
9. **Statuses are derived.** Do not store `status` — compute it from `voorraad`, `min`, `max`, `volgendePlanning`. Otherwise data drifts.
10. **Don't ship the placeholder customers/suppliers/locations.** Wire to the real customer/supplier master and location tree in the target system.

---

## Files in this handoff

### Screenshots (`/screenshots`)
- `01-voorraad.png` — main stock table with stats and filters
- `02-binnenboeken.png` — receiving form, two-column layout
- `03-artikelen.png` — customer articles with bewerking chips
- `04-instellingen.png` — settings (Algemeen tab)
- `05-voorraad-detail-drawer.png` — item detail drawer with mutatiehistorie
- `06-voorraad-dark.png` — dark theme variant

### Source files

```
StaalTrack.html              — App entry; loads React + Babel + scripts in order
styles.css                   — All design tokens + component CSS
data.js                      — Mock dataset: materials, articles, customers, suppliers, locations, receipts
icons.jsx                    — Stroke-icon SVG primitives + steel-type glyphs
sidebar.jsx                  — Sidebar component with grouped nav
screen-voorraad.jsx          — Voorraad screen (table, drawer, filters, stats)
screen-binnenboeken.jsx      — Binnen boeken (receiving) screen
screen-artikelen.jsx         — Artikelen (customer-machined products) screen
screen-instellingen.jsx      — Instellingen (settings) with tabs
app.jsx                      — Root component, routing, theme/density tweaks
tweaks-panel.jsx             — Design-system-only Tweaks UI (DO NOT PORT)
```

`tweaks-panel.jsx` and the `useTweaks` integration are part of the design preview tool — do not port them to the production app.

## Assets
- **Fonts:** IBM Plex Sans + IBM Plex Mono via Google Fonts. License: SIL Open Font License.
- **Icons:** All SVG, hand-authored, embedded in `icons.jsx`. Replace with the codebase's existing icon set (Lucide, Phosphor, Heroicons) — match weight (1.5px stroke) and size (16px default).
- **Imagery:** None used. Placeholders for steel-type glyphs are SVG inline.

## Open questions to confirm with product before building
1. Should materials have a "master article" concept (so reorder-from-supplier flows have a stable SKU)? The mock implies no — each row is the unit.
2. Mobile/floor layout: is the <1100px collapsed sidebar enough, or is a true mobile scanner UI in scope?
3. Permissions per role (Operator vs Magazijnchef vs Inkoop) — what can each see/edit?
4. Certificate PDF storage: where? attached to the heat number, or to the receipt line?
5. Production planning integration: is "volgendePlanning" sourced from an ERP (Exact / AFAS) or owned by StaalTrack?
