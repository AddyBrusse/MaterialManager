# Inventaris — Documentation Index

Internal inventory system for a small CNC shop (4 users). This folder is the source of truth for the agent (Claude Code) building the project.

## How to use these docs

- Read `00-overview.md` first — project scope and glossary
- Read `01-architecture.md` for the big picture
- Read `02-tech-stack.md` for tools, versions, conventions
- Then dive into the area you're working on (`/frontend`, `/backend`, `/features`, `/workflows`)
- Log any non-obvious choice in `/decisions/90-decisions-log.md`

## Index

### Core
- [00-overview.md](./00-overview.md)
- [01-architecture.md](./01-architecture.md)
- [02-tech-stack.md](./02-tech-stack.md)
- [03-parked.md](./03-parked.md) — open items to decide later

### Frontend
- [10-frontend-overview.md](./frontend/10-frontend-overview.md)
- [11-routing.md](./frontend/11-routing.md)
- [12-state-management.md](./frontend/12-state-management.md)
- [13-components.md](./frontend/13-components.md)
- [14-mobile-view.md](./frontend/14-mobile-view.md)
- [15-desktop-view.md](./frontend/15-desktop-view.md)
- [16-forms-validation.md](./frontend/16-forms-validation.md)
- [17-styling-theme.md](./frontend/17-styling-theme.md)

### Backend
- [20-backend-overview.md](./backend/20-backend-overview.md)
- [21-api-design.md](./backend/21-api-design.md)
- [22-database-schema.md](./backend/22-database-schema.md)
- [23-users-roles.md](./backend/23-users-roles.md)
- [24-locking.md](./backend/24-locking.md)
- [25-file-storage.md](./backend/25-file-storage.md)
- [26-deployment.md](./backend/26-deployment.md)

### Features
- [30-items-raw.md](./features/30-items-raw.md)
- [31-items-finished.md](./features/31-items-finished.md)
- [32-stock-movements.md](./features/32-stock-movements.md)
- [33-locations.md](./features/33-locations.md)
- [34-grades-profiles.md](./features/34-grades-profiles.md)
- [35-labels.md](./features/35-labels.md)
- [36-search.md](./features/36-search.md)
- [37-low-stock.md](./features/37-low-stock.md)

### Workflows
- [40-user-flows.md](./workflows/40-user-flows.md)
- [41-receive-material.md](./workflows/41-receive-material.md)
- [42-adjust-stock.md](./workflows/42-adjust-stock.md)
- [43-edit-locking-flow.md](./workflows/43-edit-locking-flow.md)
- [44-mobile-scan-flow.md](./workflows/44-mobile-scan-flow.md)

### Decisions
- [90-decisions-log.md](./decisions/90-decisions-log.md)
