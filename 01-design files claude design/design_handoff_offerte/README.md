# Handoff: Boers Metaalbewerking — Offerte (Quote) Document

## Overview
A staff-facing **quote document** ("Offerte") for Boers Metaalbewerking | Engineering, a
Dutch metal shop. Staff fill in customer details and a list of parts (each with material,
quantity, unit price and an optional process note); the document shows per-line totals,
a subtotal, 21% BTW (Dutch VAT) and a grand total. It is built to **print / export to a
clean multi-page A4 PDF**: on screen it's one continuous page, and at print it paginates
automatically with repeating column headers and no rows broken across a page boundary.

Language: **Dutch**. Currency/number format: **EUR, Dutch notation** (thousands `.`,
decimals `,` → `€ 3.547,50`).

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing
the intended look and print behavior, **not production code to ship directly**. The task
is to **recreate this design in your target codebase** using its established patterns,
component library and templating/PDF stack (React + a PDF lib, a server-side HTML→PDF
renderer, a Rails/Laravel view, etc.). If no environment exists yet, pick the framework
that best fits and implement there. `quote-template.html` is intentionally framework-
agnostic (plain HTML + CSS variables + `{{ }}` bindings) so it maps cleanly onto whatever
you choose.

## Fidelity
**High-fidelity.** Final colors, typography, spacing and layout. Recreate pixel-accurately
using the tokens below. The only "design system" is what's documented here (the client had
no existing one); adopt these tokens as the basis.

## Screens / Views

### Offerte document (single view)
- **Purpose:** Staff produce a priced quote to send to a customer; it must print to PDF.
- **Layout:** Single centered page, max content width **A4 (8.27in)**, white card on a
  `#E7E5E0` background (screen only). Vertical flow, top→bottom:
  1. **Header row** — flex, space-between, align-items flex-start, gap 32px.
     Left: logo (height **74px**, width auto). Right (right-aligned): the word
     **OFFERTE** above a 2-column mono meta grid (Offertenr. / Datum / Geldig tot).
  2. **Red rule** — full-width bar, height **2px**, color `#E1251B`, margin `26px 0 24px`.
  3. **Klant block** — 2-column grid (`1fr 1fr`, gap `18px 40px`). Left column: "KLANT"
     eyebrow + company name + contact + email. Right column: key/value grid
     (Referentie / PO, Gewenste leverdatum) with mono right-aligned values.
  4. **Parts table** — full width, `table-layout: fixed`. Columns and widths below.
  5. **Totals** — right-aligned block, width **280px**: Subtotaal, BTW 21% (with bottom
     hairline), then the grand total row.
  6. **Footer** — centered fine print, top hairline, company legal/contact line.
- **Card padding:** screen `56px 0.75in 72px`; print `0 0.75in`.

#### Parts table columns
| Column | Width | Align | Font | Notes |
|---|---|---|---|---|
| `#` (Pos) | 38px | left | mono, `#B0AAA0`, 12px | zero-padded position, e.g. `001` |
| Omschrijving | auto | left | body | bold-ish name (500) + optional note line |
| Materiaal | 118px | left | body, `#555` | e.g. "Staal S235JR", "RVS 304", "Aluminium 6082" |
| Aantal | 56px | right | mono | integer quantity |
| Stukprijs | 84px | right | mono | `€ 18,50` |
| Totaal | 96px | right | mono, weight 500 | `€ 462,50` |

- **Row:** padding `11px 0`, top border `1px solid #ECEAE5`, cells `vertical-align: top`.
- **Description note** (second line under the part name): 11.5px, color `#9A948A`,
  margin-top 2px — used for process/spec text ("Lasersnijden + kanten · tek. 2024-114 rev. B").
  Omit the element entirely when a part has no note.

## Interactions & Behavior
This is a static print document — minimal interactivity.
- **Print / Save as PDF** is the primary action (browser print, or your PDF pipeline).
- **Pagination (print):** A4, `@page { margin: 0 }`. A wrapper `<table class="doc-frame">`
  with empty `<thead>`/`<tfoot>` spacer cells (`0.6in` tall) creates the per-page top/bottom
  margin. The parts `<thead>` uses `display: table-header-group` so **column headers repeat
  on every page**. `tr`, the totals block and the footer use `break-inside: avoid` so they
  never split across a page. A fixed-position `.running-ftr` prints company name + quote
  number at the bottom of every page.
- **No page numbers by default** (CSS page counters require a non-zero `@page` margin, which
  re-opens the browser's own header slot). If page numbers are required, switch to
  `@page { size: A4; margin: 0.6in; @bottom-right { content: counter(page) " / " counter(pages); } }`,
  set `.doc` print padding to `0`, and instruct users to untick "Headers and footers" in the
  print dialog.
- No hover/focus/loading/error states (not a form). If you later make it an editable form
  (add/remove part rows, live totals), validate: qty is a positive integer, unit price ≥ 0;
  recompute Subtotaal = Σ(line totals), BTW = round(Subtotaal × 0.21, 2), Grand = Subtotaal + BTW.

## State Management
Static when rendered from data. The data model per quote:
```
Quote {
  number, date, validUntil,            // strings, dd-mm-yyyy
  customer { company, contact, email },
  reference, deliveryDate,
  parts: [ { pos, name, note?, material, qty, unitPrice, lineTotal } ],
  subtotal, vat, grandTotal,           // money, EUR
  company { name, address, phone, email, kvk, vatId, iban }
}
```
Money: store as numbers/minor units; format to Dutch notation at render
(`new Intl.NumberFormat('nl-NL', {minimumFractionDigits:2}).format(n)` → prepend `€ `).
Line total = qty × unitPrice. BTW = 21%.

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| ink | `#1A1A1A` | headings, key figures, grand total value |
| body | `#555555` | secondary text, material names |
| label | `#8A857C` | uppercase labels, meta keys |
| note | `#9A948A` | per-part note line, footer fine print |
| partno | `#B0AAA0` | position-number cell |
| hairline | `#ECEAE5` | row separators, total divider |
| brand-red | `#E1251B` | accent rule, brand red (from logo) |
| page-bg | `#E7E5E0` | screen background (not printed) |
| card-bg | `#FFFFFF` | document surface |

### Typography
- **Space Grotesk** (display) — the "OFFERTE" title (32px / 700 / `0.02em`) and the
  "Totaal incl. BTW" label (15px / 600).
- **IBM Plex Sans** (body) — labels, customer name (15px / 600), body lines (13.5px).
- **IBM Plex Mono** (figures) — ALL numbers, prices, dates, position numbers, the quote
  meta, and the grand-total value (18px / 600).
- Scale used: 32, 18, 15, 13.5, 13, 12.5, 12, 11.5, 11, 10.5px.
- Eyebrow/label style: 10.5px, weight 600, `text-transform: uppercase`, `letter-spacing: 0.1em`.
- Table header: 10.5px, 600, uppercase, `letter-spacing: 0.08em`, color `label`.

### Spacing / structure
- Card padding (screen): `56px 0.75in 72px`. Red rule margin: `26px 0 24px`.
- Klant grid gap: `18px 40px`. Row padding: `11px 0`. Totals block width: `280px`.
- Page: A4, `@page margin: 0`; print spacer height `0.6in`; print card padding `0 0.75in`.

### Border radius / shadow
- Document card: no radius in print; screen card has `box-shadow: 0 2px 16px rgba(0,0,0,.10)`
  (screen only — removed at print). No other shadows or radii.

## Assets
- **`logo-boers.png`** — Boers Metaalbewerking | Engineering logo (2115×735, transparent
  PNG, black wordmark + red check). Supplied by the client. In a real app, store as an
  SVG if available for crisp print; reference at 74px height.

## Sample data (used in the reference mock)
Customer: *Van Dijk Machinebouw B.V.* / *ing. M. van Dijk* / *inkoop@vandijkmb.nl* /
Ref *PO-2026-0774* / Leverdatum *14-08-2026*. Quote *2026-0418*, datum *19-06-2026*,
geldig tot *19-07-2026*. 7 parts → Subtotaal **€ 3.547,50**, BTW 21% **€ 744,98**,
Totaal **€ 4.292,48**. (All sample/placeholder — replace with real company details:
address, KvK, BTW-nummer, IBAN.)

## Files
- **`quote-template.html`** — the implementation reference: plain HTML + CSS variables +
  `{{ BINDING }}` placeholders. The single `<tr class="part-row">` is the repeat unit —
  loop it over the parts array. Print CSS included. Open it in a browser to see it render.
- **`Offerte Boers.dc.html`** — the original interactive prototype (richer streaming
  harness); same visual design as the template. Reference only.
- **`logo-boers.png`** — logo asset.

> Implement `quote-template.html` in your stack: map the `{{ }}` bindings to your data,
> render `.part-row` per part, drop empty `.note` elements, and wire your PDF/print path.
> The CSS variables in `:root` are the design tokens — port them to your theme.
