# 15 — Desktop View

## When

Viewport width > 900px.

## Layout — Mantine AppShell

- **Sidebar** (left, fixed width ~220px)
  - Logo / app name
  - Nav items: Dashboard, Grondstof, Artikelen, Historie, Instellingen
  - Low-stock badge on the matching nav item: `Lage voorraad (5)`
  - Bottom: current user pill, switch user link
- **Header** (top)
  - Page title / breadcrumb
  - Search shortcut
- **Main** content area

## Pages

### Dashboard (`/`)
- Recent activity (last N movements)
- Low-stock items list
- Quick links

### Raw materials list (`/grondstof`)
- Dense table
- Columns: code, grade, profile, dimensions, length (mm), weight (kg), location, current stock, last movement
- Search bar + filter dropdowns
- Row click → detail

### Raw material detail (`/grondstof/:id`)
- Header: code, grade badge, lock state
- Sections: photo, metadata, location, current stock + computed weight, movement history
- Edit button → acquires lock, switches to edit mode
- Read-only mode shown if locked by other user, with "Verzoek bewerken" button

### Finished goods list (`/artikelen`)
- Similar table layout
- Columns: art-no, name, customer, location, current stock, last movement

### Finished good detail (`/artikelen/:id`)
- Photo + drawing PDF viewer side by side (or stacked on narrow desktop)
- Same lock behavior as raw materials

### History (`/historie`)
- Global movement log
- Filters: date range, user, item code, reason
- Compact table, exportable later

### Settings (`/instellingen`) — admin only
- Tabs:
  - Gebruikers (users CRUD)
  - Locaties (racks/rows, cabinets/shelves/boxes)
  - Materiaalgrades (grade + density)
  - Profielen (shapes + dimensions schema)
  - Min. voorraad (per grade or per item)
  - Labels (print batch of 10, view unused/printed)
- Non-admins → redirected away with toast

## Density

- Mantine `size="xs"` table rows
- Compact padding
- Dense forms in modals/drawers
