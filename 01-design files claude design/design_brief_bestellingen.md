# Design brief: Bestellingen (materiaal bestellingen / purchasing)

## What this is

A request for high-fidelity screen designs for a **new purchasing module**
in ShopCommand (formerly StockManager), a Dutch CNC-shop management app.
This is a **brief**, not a finished handoff — the deliverable we're asking
for is the equivalent of what `design_handoff_offerte/` and
`design_handoff_kanban_planning/` already contain for their features (HTML/
JSX mockups + a README documenting the final tokens/spec), scoped to the
screens described below.

**Ground rule: this must look like it already belongs in the app.** Do not
invent a new visual language — the whole existing design system is
documented in `frontend/19-visual-design.md` (colors, spacing, typography,
component anatomy: buttons, badges, tables, drawers, stat cards) and is
already implemented pixel-for-pixel in the running app. Reuse it exactly.
The **one genuinely new pattern** this feature needs — a comparison matrix
(material × supplier quotes) — has no precedent anywhere in the app and is
where design effort should actually go.

## Why this exists

Low-stock raw materials currently only show up as a read-only alert. There
is no way to act on a shortage beyond a generic to-do. This module adds a
real purchasing workflow: push a shortage onto a "to order" list → request
quotes from one or more suppliers by email → compare what they quote back
(price + delivery date) per material → pick a winner per line → generate a
purchase-order-style document. Everything here is **raw materials only**
(not finished goods) and **internal/staff-facing** (not customer-facing —
contrast with the Offerte document, which a customer sees).

## Reuse from the existing design system (do not redesign these)

Pull directly from `frontend/19-visual-design.md`:
- **Fonts**: IBM Plex Sans (body), IBM Plex Mono (all numbers/codes/dates/
  IDs — use `tabular-nums`).
- **Colors**: the full token table (`--bg`, `--bg-2`, `--text`, `--text-2`,
  `--text-3`, `--accent`, `--success`/`--warning`/`--danger` + their `-soft`
  backgrounds) — status badges especially reuse the exact
  success/warning/danger pattern already used for "Op voorraad/Laag/Uit".
- **Page shell**: sidebar (248px) + topbar (56px) + page header (title 22px/
  600 + subtitle 13px `--text-3` + right-aligned action buttons) — identical
  to every existing page (Voorraad, Artikelen, Projecten).
- **Table anatomy**: sticky header, 11.5px/500 `--text-3` header text,
  hover/selected row states, checkbox column (14×14, 3px radius) — same as
  the Voorraad table.
- **Tab bar**: the existing `ProjectDetailPage` already has a horizontal tab
  switcher (Offertes / Opdrachtbevestiging / Productie / Paklijst / Factuur)
  with an underline-style active indicator — this screen needs the same
  pattern, just with different tab labels (see below).
- **Drawer** (480px right-anchored) for the RFQ-creation form — same
  slide-in/scrim behavior as the existing item drawer on Voorraad.
- **Status badge** component (pill, 6px dot, `-soft` background) — reuse
  directly for the 4 new statuses (mapping below).

## Screens needed

### 1. Bestellingen — main page (`/bestellingen`)

Page header: title "Bestellingen", subtitle "Materiaal inkoop — van
signalering tot bestelbevestiging". A horizontal tab bar (see the
`ProjectDetailPage` pattern) with 4 tabs:

**Tab A — Te bestellen** (default/landing tab)
- A table of raw materials flagged for ordering. Columns: checkbox ·
  Materiaal (profile + dimensions + grade, e.g. "Rond Ø50 · S355", same
  label style as the Voorraad "Artikel" column) · Aantal (mono, right) ·
  Status badge · Toegevoegd door + datum (muted, small) · ⋯ (delete icon,
  only when status = "Te bestellen").
- 4 status values, each a badge: **Te bestellen** (warning/orange) →
  **Aangevraagd** (accent/blue) → **Besteld** (accent/blue, same color as
  aangevraagd is fine, or a distinct mono-ish neutral if you want 4 visibly
  distinct states) → **Ontvangen** (success/green).
- Only "Te bestellen" rows show a checkbox and are listed in the open
  section; Aangevraagd/Besteld/Ontvangen rows are grouped into collapsed
  `<details>`-style sections below (same "Afgerond (n)" collapse pattern
  used on the existing Todo page), read-only.
- Toolbar above the table: "{n} geselecteerd" counter + a primary button
  "Prijsaanvraag maken" (disabled/hidden until ≥1 row is checked).
- A small "+ Materiaal toevoegen" affordance (manual add — a raw-material
  picker + qty input) so the page isn't solely fed by the low-stock alerts
  elsewhere in the app.

**Tab B — Prijsaanvragen**
- Flat list/table of RFQ rounds: ID (mono, e.g. `PA-2026-004`) · Status
  badge (Concept / Verzonden) · aantal leveranciers · aantal regels ·
  verzonden op (date, or "—"). Row click → detail view (screen 2).

**Tab C — Gekozen offertes**
- Every quote currently marked "chosen" that hasn't yet become a purchase
  order, **grouped by winning supplier** (group header = supplier name,
  running subtotal). Each group has a "Bestelbevestiging aanmaken" button;
  a top-level "Alles genereren" button covers every group in one action.
  Rows already converted show a muted "Reeds omgezet → INK-2026-004" link
  instead of being actionable.

**Tab D — Bestelbevestigingen**
- Flat list/table of purchase orders: ID (mono, e.g. `INK-2026-004`) ·
  Leverancier (supplier name) · Status badge (Concept / Verzonden) · aantal
  regels · totaalbedrag (mono, €) · verzonden op. Row click → detail view.

### 2. Prijsaanvraag detail (`/prijsaanvragen/:id`)

Mirrors the existing Offerte/Opdrachtbevestiging card pattern already used
in the Projecten module: a card header with the doc ID + status badge, a
line table (Materiaal · Aantal — no price, since this is a *request*, not a
quote), and a footer action bar: "Download PDF" (ghost) · "Verstuur"
(primary — triggers the BCC email + PDF, same interaction pattern as the
existing "Verstuur via e-mail" button on Offertes).

### 3. Vergelijken — comparison matrix (`/bestellingen/:bestelRegelId/vergelijk`)

**This is the one screen with no existing precedent — the main design
challenge.** Needs its own full-width page (not a drawer — can get wide).

- Header: the material being compared (e.g. "Rond Ø50 · S355 — vergelijking"),
  with a back-link to the Bestellingen page.
- A matrix: **rows = supplier quotes** (one row per supplier who responded;
  if the same supplier was asked in more than one RFQ round, show each
  round as its own row with a small round/date label, don't collapse —
  quote history should stay visible), **columns** = Leverancier (name) ·
  Prijs (editable mono number input) · Levertijd (editable date input) ·
  Notities (optional text) · an explicit save icon-button per row (these
  are manually-transcribed phone quotes, not live data — an explicit
  confirm beats autosave) · a "Kies" action (radio-button style — exclusive
  across the whole matrix, since only one supplier can win a given
  material).
- Empty state per un-quoted supplier: a row that's just an editable
  placeholder (no price yet) rather than being hidden — every supplier
  who was asked appears, whether or not they've answered yet.
- The chosen row should be visually distinguished (e.g. a green-tinted row
  background or a filled "Gekozen" badge instead of an outline "Kies"
  button) so the winner is obvious at a glance.

### 4. Bestelbevestiging detail (`/bestelbevestigingen/:id`)

Same card/table/footer shape as the Prijsaanvraag detail (screen 2), but:
line table columns are Referentie (mono, our own line reference, e.g.
"INK-2026-004.1") · Materiaal · Aantal · Prijs · Levertijd · Totaal, and
each line (plus a bulk header action) has an "Ontvangen" checkbox/toggle
instead of a send button being the only action — this document, once sent,
also needs a receiving interaction.

## Data shapes (for realistic sample data in the mockups)

```
BestelRegel { materiaal: "Rond Ø50 · S355", aantal: 12, status: 'te_bestellen' | 'aangevraagd' | 'besteld' | 'ontvangen', toegevoegdDoor, datum }

Prijsaanvraag { id: "PA-2026-004", status: 'concept' | 'verzonden', regels: [...], leveranciers: [{ naam, email }], verzondenOp }

PrijsaanvraagAntwoord (one per supplier per material, across rounds) {
  leverancier: "Tata Steel NL", ronde: "PA-2026-004" (or a 2nd round "PA-2026-007"),
  prijs: 342.50, levertijd: "14-08-2026", gekozen: boolean
}

Bestelbevestiging { id: "INK-2026-004", leverancier: "Tata Steel NL", status, regels: [
  { referentie: "INK-2026-004.1", materiaal, aantal, prijs, levertijd, ontvangen: boolean }
]}
```

Sample suppliers to use in mockups (already exist in the app's Relaties
data — reuse for consistency if the design tool has access, otherwise these
are fine as placeholders): **Tata Steel NL**, **Voestalpine**,
**ArcelorMittal**.

## Interactions & behavior notes

- All actions are staff-only, in-app (no customer/supplier ever sees the
  app UI — only the emailed PDF documents, which follow the separate
  `design_handoff_offerte` visual system, not this one).
- Status always moves forward, never backward automatically (te_bestellen →
  aangevraagd → besteld → ontvangen) — no need to design an "undo" affordance
  beyond a generic edit/override elsewhere in Instellingen-style admin UI.
- A material can legitimately be re-requested (a second Prijsaanvraag) even
  after already being "aangevraagd" — the Te bestellen tab's line-picker
  should show a small inline note like "Al aangevraagd op 2 jul" on rows
  past `te_bestellen`, without blocking them from being selected again.
- Language: Dutch throughout, matching the rest of the app exactly (see
  the labels used above — "Te bestellen", "Aangevraagd", "Besteld",
  "Ontvangen", "Vergelijken", "Gekozen", "Kies", "Reeds omgezet").

## Files
Please structure the output the same way as the existing handoffs in this
folder: a README.md (screens, tokens actually used — should mostly just
cite `frontend/19-visual-design.md` rather than redefine tokens, plus
anything genuinely new for the comparison matrix), and HTML/JSX mockups per
screen, so it can be dropped into `01-design files claude design/` as
`design_handoff_bestellingen/`.
