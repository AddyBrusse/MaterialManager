# 50 — Operator Terminal App (Parked)

> **Status: PARKED** — discussed 2026-07-02, not yet started. Do not implement
> until the user explicitly picks it back up. See `03-parked.md` for full
> parked-items context.

---

## What it is

A dedicated tablet/kiosk app for shop-floor operators. Operators use it to:

- See their active productie-stappen (machining steps)
- Open or download the drawing / NC file for a job
- Log time spent on each stap
- Mark a stap as done
- View which jobs are queued for their machine

The **main ShopCommand web app** remains for office users. The operator
terminal is a **separate, simplified UI** targeting a fixed tablet mounted at
each machine.

---

## Architecture decision

New Vite app in the same monorepo: `apps/operator`.

```
StockManager/
├── apps/web/          ← existing office UI
├── apps/operator/     ← new tablet UI (this doc)
├── apps/api/          ← shared Express backend
└── packages/shared/   ← shared Zod schemas (both apps import)
```

Both apps hit the same API on the NAS. The operator app is served from the
same Express process under a different path (e.g. `/operator`), or as a
separate bundle at the same root — to be decided at implementation time.

---

## Confirmed constraints (answered 2026-07-02)

| Question | Answer |
|---|---|
| File storage for NC/drawings | Single NAS network share (one share for all) |
| Machine assignment per tablet | Fixed — each tablet is permanently assigned to one machine |
| Offline requirement | None — Wi-Fi LAN only, same as main app |
| Multiple files per article/step | Yes — e.g. `.nc` + `.pdf` drawing + step setup sheet all attached to one stap |

---

## Layout zones (tablet, landscape, ~1280×800)

```
┌─────────────────────────────────────────────────────┐
│  HEADER: machine name · current user · clock        │
├──────────────────┬──────────────────────────────────┤
│  JOB QUEUE       │  ACTIVE STEP                     │
│  (left, ~35%)    │  (right, ~65%)                   │
│                  │                                  │
│  List of upcoming│  Article name + drawing          │
│  stappen for     │  NC / drawing download           │
│  this machine    │  ─────────────────────────       │
│                  │  Time tracker (start / pause /   │
│                  │    stop)                         │
│                  │  ─────────────────────────       │
│                  │  [ Stap gereed ] big button       │
└──────────────────┴──────────────────────────────────┘
```

---

## Data model additions needed

### New: `ArticleFile`

Files attached to an article (drawings, NC programs, setup sheets).

```prisma
model ArticleFile {
  id          String   @id @default(cuid())
  articleId   String
  type        String   // "drawing" | "nc" | "setup" | "other"
  filename    String   // original filename
  nasPath     String   // relative path from NAS share root
  uploadedAt  DateTime @default(now())
  article     Article  @relation(fields: [articleId], references: [id])
}
```

### New: `TimeEntry`

Operator time logs per productie-stap.

```prisma
model TimeEntry {
  id              String         @id @default(cuid())
  productieStapId String
  operatorId      String
  startedAt       DateTime
  stoppedAt       DateTime?
  durationMinutes Int?
  productieStap   ProductieStap  @relation(fields: [productieStapId], references: [id])
  operator        User           @relation(fields: [operatorId], references: [id])
}
```

### Extended: `Machine`

Add the network path to the machine's NC folder on the NAS share.

```prisma
model Machine {
  // ... existing fields ...
  networkPath  String?   // UNC or relative NAS path: \\NAS\share\machines\DMG-450TC
}
```

### Extended: `ProductieStap`

Track completion and assigned operator.

```prisma
model ProductieStap {
  // ... existing fields ...
  gereedOp    DateTime?   // when the step was marked done
  gereedDoor  String?     // User.id of operator who completed it
  // relation to TimeEntry added above
}
```

---

## Job folder plan

When an offerte is **accepted** (`accepteerOfferte` / `POST /:id/accepteer`),
the backend creates a job folder on the NAS:

```
<NAS_SHARE_ROOT>/
  jobs/
    PRJ-0001/                    ← project folder (project.id)
      PRJ-0001-klantnaam/        ← human-readable subfolder
        drawings/                ← copies of article drawings
        nc/                      ← NC programs per stap
        docs/                    ← order confirmation PDF etc.
```

Implementation:
- `NAS_SHARE_ROOT` env var in `.env` on the NAS (e.g. `/shared/ProductieData`)
- `fs.mkdirSync` tree created in the `accepteer` transaction callback
- PDF of OB auto-saved to `docs/`

### NC push to machine

When a productie-stap becomes **actief** (operator starts it on the terminal),
the API copies the relevant NC file from the job folder to the machine's
`networkPath` folder, so the CNC controller can pick it up automatically.

```
/jobs/PRJ-0001/.../nc/artikel-stap1.nc
  → /machines/DMG-450TC/input/artikel-stap1.nc
```

---

## API surface (new endpoints)

All under `/api/operator/` — kept separate from office API routes.

| Method | Path | Description |
|---|---|---|
| `GET` | `/operator/machine/:machineId/queue` | Active + upcoming stappen for this machine |
| `GET` | `/operator/stap/:stapId` | Detail: article info + files + time entries |
| `POST` | `/operator/stap/:stapId/start` | Start time entry, copy NC to machine folder |
| `POST` | `/operator/stap/:stapId/pause` | Pause active time entry |
| `POST` | `/operator/stap/:stapId/gereed` | Mark stap done, stop timer, set gereedOp/Door |
| `GET` | `/operator/articles/:id/files` | List files for article |
| `POST` | `/operator/articles/:id/files` | Upload file (multipart) |
| `DELETE` | `/operator/files/:fileId` | Remove file |
| `GET` | `/operator/files/:fileId/download` | Stream file from NAS |

---

## Build phases

### Phase 1 — Article file management (office UI, no new app yet)

- `ArticleFile` Prisma model + migration
- Upload endpoint + download/delete endpoints
- File list panel in `ArticleDetailPage` or article drawer
- Files visible to operator but managed from office

### Phase 2 — Job folders

- `Machine.networkPath` field + migration
- `accepteer` handler: create job folder tree, copy OB PDF
- Instellingen → Machines: add network path field

### Phase 3 — Operator app (`apps/operator`)

- New Vite app scaffold (Mantine, same theme tokens)
- Machine selection screen (one-time setup, stored in `localStorage`)
- Queue view + active step view
- Time tracker component
- "Stap gereed" flow
- NC push on step start

### Phase 4 — Office integration

- Time report per project (productie cost vs estimate)
- Operator utilisation view in Machines/Bedrijfskosten
- NC push status visible in ProductieTab

---

## Open questions (to decide at implementation time)

- **Auth on tablet**: same user-select dropdown as main app, or PIN per operator?
- **NAS path env var**: configure in Instellingen → Bedrijf, or only in `.env`?
- **Conflict if NC file already on machine**: overwrite silently or warn?
- **File size limit**: NC files are small (<1 MB); drawings can be large PDFs — set limit?
- **Serve operator app**: same Express process at `/operator`, or a second build target?
