# 14 — Mobile View

## When

Active when viewport width ≤ 900px. Triggered on initial mount and on `resize`.

## Layout

- No sidebar. Top bar with logo/title + current user pill (tap to switch).
- Single column, full width.
- Bottom space reserved for thumb-reach action buttons.

## Pages

### Home (`/`)
Three tile buttons, large:
1. **Scannen** — camera scan
2. **Zoeken** — search form
3. **Voorraad aanpassen** — opens search first, then adjust

### Scan (`/scan`)
- Camera preview placeholder (scanning logic parked under Altec/integration)
- Manual code entry field (always visible as fallback)
- On match → navigate to `/item/:id`

### Search (`/zoek`)
- Single search box, debounced
- Filters: type (raw/finished), grade, size, location
- Result list: compact rows with code, name, location, current stock

### Item detail (`/item/:id`)
- Toggle: **Samenvatting** ↔ **Detail**
  - Summary: code, name, current stock, location, photo thumb
  - Detail: full fields + recent movements
- Action bar at bottom: **Voorraad aanpassen** button
- Lock banner if held by someone else

### Adjust stock (`/item/:id/aanpassen`)
- Toggle: **Delta** ↔ **Direct overschrijven**
- Number input (large), `+` and `−` buttons
- Reason select (required): Ontvangen / Verbruikt / Afgekeurd / Correctie / Overig
- Note field (optional)
- Confirm button

## Out of scope on mobile

- Settings (admin)
- Label printing
- Editing item metadata (only stock adjust)
- Adding new items

If a user tries to navigate to a desktop-only route on mobile → redirect to home with toast "Niet beschikbaar op mobiel".
