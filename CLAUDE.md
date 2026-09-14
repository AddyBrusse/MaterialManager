# CLAUDE.md — ShopCommand

## What this repo is

**ShopCommand** — an internal shop management app for a small CNC shop (~4 users): inventory, quoting/offertes, production planning, and relaties. Docs and code live together in this directory. (Formerly "StockManager" — kept the npm package scope `@stockmanager/*` and repo name as-is; see [decisions/90-decisions-log.md](./decisions/90-decisions-log.md).)

## Read these first (in order)

1. [00-overview.md](./00-overview.md) — scope, users, glossary
2. [01-architecture.md](./01-architecture.md) — deployment topology (QNAP NAS, single Express process, LAN-only)
3. [02-tech-stack.md](./02-tech-stack.md) — stack, monorepo layout, conventions
4. Then the area you're working on (see index below)

## Monorepo layout

```
StockManager/
├── packages/shared/     ← @stockmanager/shared — Zod schemas + inferred TS types
├── apps/web/            ← @stockmanager/web — React + Vite + Mantine (Dutch UI, high density, xs sizing)
├── apps/api/            ← @stockmanager/api — Express + Prisma + Postgres
├── docker/
└── package.json         ← npm workspaces root, package "stockmanager"
```

Docs live at the repo root (this file, `00`-`03`, `frontend/`, `backend/`,
`features/`, `workflows/`, `decisions/`) — not under a `docs/` subfolder.

## Key decisions already made

- **No passwords** — user picked from dropdown, stored in `localStorage`
- **No WebSocket** — polling every 5–10 s for lock state (simple enough for 4 users)
- **Single Express process** serves both API (`/api/*`) and built frontend (`/`)
- **UI language: Dutch** — all labels, buttons, validation messages
- **Mantine v7**, `size="xs"` as default density
- **Zod** shared between frontend and backend via `@stockmanager/shared`
- **ORM**: Prisma (decided 2026-05-29, see `decisions/90-decisions-log.md`)
- **Response shape**: `{ data }` on success, `{ error: { code, message, details? } }` on failure
- **Calculatiekern in `packages/shared`** (`calc/estimate.ts`, `calc/artikel-prijs.ts`) — web én API rekenen ermee; de API heeft hem nodig voor de prijssnapshot bij het accepteren van een offerte
- **Voorraad kent drie getallen**: fysiek, gereserveerd, vrij (`fysiek − gereserveerd`). Alleen `apps/api/src/services/voorraad.ts` bepaalt wat "gereserveerd" is; schermen rekenen dat niet zelf uit. Reserveren raakt de fysieke voorraad niet — afboeken doet dat, in één transactie mét voorraadmutatie
- **Materiaal kiezen gebeurt bij het aanmaken van de opdracht**, via een todo per orderregel en een voorstel uit `packages/shared/calc/zaagplan.ts` (stangenlader-lengte + welke staven). Nooit automatisch vastleggen — een mens ziet het voorstel eerst
- **Tijdregistratie spiegelt de calculatie**: instellen telt per batch, draaien per stuk — dezelfde splitsing als `computeEstimateTotals`. Zonder dat onderscheid valt geschat en werkelijk achteraf niet te vergelijken. Alleen `effectieveSeconden` (in `packages/shared/schemas/tijdregistratie.ts`) bepaalt wat "werkelijk" is; schermen rekenen dat niet zelf uit. Een correctie vervangt de gemeten waarde nooit — beide blijven staan, want het verschil is zelf een signaal
- **Nacalculatie wordt afgeleid, nooit opgeslagen**: een bewaarde nacalculatie loopt stil achter zodra er een uur bijkomt. `services/nacalculatie.ts` haalt uren uit de tijdregistratie, materiaal uit afgeboekte zaagbonnen en de verkoopprijs uit de offerteregel. "Norm bijstellen" past de artikelcalculatie aan én schrijft een prijssnapshot — zonder die terugkoppeling is het een rapport dat niemand leest
- **Rol `terminal`** is het account van een machinescherm, geen persoon. Ziet alleen de kioskroute; `middleware/terminal-scope.ts` is een **toelaat**lijst, zodat een nieuwe route standaard dicht is voor de werkvloer-pc. Wie er staat kiest zichzelf op de terminal bij bemand werk. De wachtrij hangt aan `User.machineId` en **niet aan de accountnaam** — die moest anders exact gelijk zijn aan wat er op de productiestap staat, en dan blijft het scherm leeg terwijl er werk ligt
- **Een terminal mag werk van een andere machine pakken.** Planning verandert op het laatste moment; standaard toont hij de eigen wachtrij, één tik toont alles. De registratie boekt dan op de machine waar het werk **werkelijk** gebeurt (`StartTijd.machineNaam`), niet op de geplande — anders rekent de nacalculatie met het uurtarief van een machine die niets gedaan heeft
- **Weight** is computed on read (never stored) from profile formula + dimensions + grade density
- **Mock phase ended (2026-06-22)** — the localStorage→PostgreSQL backend
  migration is fully applied. New features go straight to the real stack
  (shared schema → Prisma model/migration → API route → frontend), no new
  localStorage-only modules. See the 2026-06-22 decision in
  `decisions/90-decisions-log.md`

## Building rules

- TypeScript strict mode everywhere
- Routes thin, services hold business logic
- Components ≤ ~150 lines — split when larger
- All server state via TanStack Query + typed API wrappers in `apps/web/src/api/`
- Forms: Mantine `useForm` with a `validate` map (Dutch messages) — see `frontend/16-forms-validation.md`
- File naming: kebab-case files, PascalCase React components
- Log any non-obvious architectural choice in `decisions/90-decisions-log.md`

## Na een squash-merge: branch eerst gelijktrekken

PR's worden **squash**-gemerged. Master krijgt dus één nieuwe commit met de
inhoud van de branch, maar niet de commit van de branch zelf. Bouw je daarna
door op de oude branchtop, dan hebben master en de branch dezelfde wijzigingen
in verschillende commits en ontstaat er een conflict.

Daarom vóór elk nieuw stuk werk:

```
git fetch origin && git checkout -B <branch> origin/master
```

**Waarom dit meer is dan netjes opruimen:** een `pull_request`-workflow draait
niet tegen de branch maar tegen de merge-ref — de denkbeeldige samenvoeging van
branch en master. Bij een conflict kan GitHub die ref niet maken, en dan start
CI **helemaal niet**. Geen rode vinkjes, geen melding: de PR blijft gewoon leeg.
Dat is op 2026-09-11 gebeurd bij PR #26, die twee dagen zonder enige run stond
terwijl de workflow gewoon actief was.

Een tweede val uit diezelfde dag: een push naar een feature-branch waarvoor op
dat moment **geen open PR** bestaat triggert ook niets, want de workflow luistert
alleen op `push: branches: [master]` en op `pull_request`. Push dus pas als de
PR er is, of open hem meteen erna en controleer dat er een run verschijnt.

### En aan de kant van de werk-pc: nooit `git pull` op een agent-branch

Hierboven staat wat de agent doet vóór nieuw werk. De lokale checkout heeft
hetzelfde probleem vanaf de andere kant: zodra de branch gelijkgetrokken is met
master, is de lokale kopie een **andere geschiedenis met dezelfde inhoud**. Een
`git pull` probeert die twee dan samen te voegen en dat geeft gegarandeerd een
conflict — meestal in `CLAUDE.md`, `schema.prisma`, `index.ts` en het
beslissingenlogboek, precies de bestanden die beide kanten aanraken.

Op een branch waar alleen de agent naartoe schrijft is dit het juiste commando:

```
git fetch origin
git reset --hard origin/<branch>
```

Geen merge, dus geen conflict. Wat lokaal stond was toch een kopie van wat op
origin staat.

**Controleer dat wel één keer voor je reset**, want `--hard` gooit weg:

```
git status                                   # moet clean zijn
git log --oneline origin/<branch>..HEAD      # moet leeg zijn
```

Staat er wél iets in die log, dan zijn het bijna altijd de **originele commits
van al gemergede PR's** — master draagt dezelfde inhoud als squash-commit. Te
bewijzen met `git diff <lokale-top> origin/master`: is die leeg, dan bestaat de
inhoud al op master en kun je veilig resetten. Is hij niet leeg, dan is er echt
lokaal werk en hoort dat eerst ergens heen.

Dit is op 2026-09-14 gebeurd: `git pull` gaf vier conflicten, waarna `npm
install` en `prisma migrate deploy` afbraken op conflictmarkers in
`packages/shared/src/index.ts` en `schema.prisma`. De lokale top was
`85091cb`, en `git diff 85091cb origin/master` was leeg — niets te verliezen.

## Migraties draaien op een werk-pc

De omgeving staat in `.env.development` in de hoofdmap (gitignored, zie
`.env.example`). Prisma laadt dat bestand **niet** vanzelf, dus een kaal
`npx prisma migrate deploy` faalt met `Environment variable not found:
DATABASE_URL` — een melding die naar de verkeerde oorzaak wijst.

Gebruik daarom de projectscripts vanaf de hoofdmap:

```
npm run db:status     # welke migraties staan er nog open
npm run db:deploy     # openstaande migraties toepassen
```

Beide laden `.env.development` via `dotenv -e`, net als `npm run dev`.
`npm run db:deploy -w apps/api` (zonder `:dev`) is de kale variant voor de NAS,
waar `DATABASE_URL` gewoon in de omgeving staat.

**Waarom dit ertoe doet:** loopt de code voor op de database, dan geeft de API
sinds 2026-09-14 geen "Interne serverfout" meer maar noemt hij de ontbrekende
migratie bij naam — met dit commando erbij. Dat werkt alleen als het commando
klopt.

## De app bereiken vanaf een andere pc

Beide manieren van draaien luisteren op alle netwerkkaarten, dus een andere pc
op het LAN komt erbij via `http://<ip-van-de-pc>:<poort>`:

| | Poort | Wat het is |
|---|---|---|
| `npm run dev` | 5173 | Vite, met `/api` doorgestuurd naar de API op 3000 |
| `npm run build` + `npm start` | 3000 | Eén Express-proces, zoals op de NAS |

Vite luistert alleen op alle kaarten dankzij `host: true` in
`apps/web/vite.config.ts`. Staat dat er niet, dan meldt Vite bij het starten
`Network: use --host to expose` en weigert een andere pc de verbinding —
gemeten 2026-09-14: localhost gaf 200, het LAN-adres helemaal niets. De
werkvloer-pc draait de terminal in een browser en moet er dus bij kunnen, ook
tijdens ontwikkelen.

De proxy in die config wijst naar `http://localhost:3000`, en dat klopt ook van
buitenaf: de proxy draait op de ontwikkelmachine zelf, dus `localhost` is daar
de API. Voor de browser op de werkvloer is alles één herkomst.

Blijft het onbereikbaar terwijl het adres klopt, dan is het bijna altijd de
Windows Firewall die binnenkomend verkeer naar Node blokkeert.

## Reference UI

Theme/layout extraction from `C:\ClaudeProjects\ToolManager-main` is done —
the result is `frontend/19-visual-design.md` (tokens, spec) plus
`apps/web/src/theme/index.ts` and `apps/web/src/styles/tokens.css`
(implementation). Use those as the reference now; ToolManager itself
shouldn't need revisiting.

## Doc index

| Area | Files |
|---|---|
| Backend | `backend/20-backend-overview.md` · `21-api-design.md` · `22-database-schema.md` · `23-users-roles.md` · `24-locking.md` · `25-file-storage.md` · `26-deployment.md` |
| Frontend | `frontend/10-frontend-overview.md` · `11-routing.md` · `12-state-management.md` · `13-components.md` · `14-mobile-view.md` · `15-desktop-view.md` · `16-forms-validation.md` · `17-styling-theme.md` · **`18-design-patterns.md`** ← code patterns · **`19-visual-design.md`** ← visual spec (read before touching UI) |
| Features | `features/30-items-raw.md` · `31-items-finished.md` · `32-stock-movements.md` · `33-locations.md` · `34-grades-profiles.md` · `35-labels.md` · `36-search.md` · `37-low-stock.md` · **`38-article-calculator.md`** ← calculator modal/UI patterns · `39-graph-mail.md` · **`50-operator-terminal.md`** ← parked tablet/kiosk app · `60-mail-import.md` · **`61-orderproces-backlog.md`** ← werklijst orderproces · **`62-mail-import-ai-ontwerp.md`** ← ontwerp AI-leespad (nog niet gebouwd) |
| Workflows | `workflows/40-user-flows.md` · `41-receive-material.md` · `42-adjust-stock.md` · `43-edit-locking-flow.md` · `44-mobile-scan-flow.md` |
| Decisions | `decisions/90-decisions-log.md` |
| Parked | `03-parked.md` — things not decided yet, do not implement |
| Newer areas (no doc yet) | **Tijdregistratie/Nacalculatie**: `packages/shared/{schemas/tijdregistratie,calc/nacalculatie}.ts`, `apps/api/src/services/{tijdregistratie,nacalculatie}.ts`, `apps/api/src/middleware/terminal-scope.ts`, `components/{tijd,nacalculatie}/`, `routes/desktop/TijdregistratiePage.tsx`, `routes/TerminalPage.tsx` · Relaties: `api/relaties.ts`, `components/relaties/`, `routes/desktop/Relaties*Page.tsx` · Machines/Bedrijfskosten: `components/settings/{OverheadPage,OverheadTab,BedrijfskostenTab}.tsx` · Zaag calculator/Reserveringen/Zaagflow: `routes/desktop/{ZaagCalculatorPage,ReserveringenPage,ZaagflowPage}.tsx` · Binnen boeken: `routes/desktop/BinnenBoekenPage.tsx` (see `workflows/41-receive-material.md` status note) · **Projecten**: `api/projects.ts`, `components/projecten/`, `routes/desktop/Projecten*Page.tsx` · **Todos**: `api/todos.ts`, `components/todos/`, `routes/desktop/TodosPage.tsx` · **Materiaalselectie**: `packages/shared/calc/zaagplan.ts`, `apps/api/src/services/materiaal-selectie.ts`, `components/materiaal/` · **Prijshistorie**: `api/prijshistorie.ts`, `components/articles/{ArticlePrijshistorieTab,PrijshistorieGrafiek,prijshistorie-lijn}.tsx`, `apps/api/src/services/prijs-snapshot.ts` |

## Projecten UI conventions

- **Adding items uses a full-width modal, never a side drawer.** "Artikelen toevoegen" opens `ArtikelPickerModal` (80vh, article list + staging table). The drawer (`RegelForm`) is only for *editing* an existing regel.
- `ArtikelPickerModal`: auto-stages on checkbox click; bidirectional marge ↔ verkoopprijs; footer always visible (staging max-height 180px with internal scroll).
- Kostprijs is computed synchronously via `buildEstimateCtx` + `computeEstimateTotals` using `gradesApi.listSync()`, `profilesApi.listSync()`, `machinesApi.listSync()`.

## Sub-agent tips

When spawning sub-agents for parallel work (e.g. scaffold API routes while building frontend):
- Give the agent the relevant doc section(s) to read first
- The `packages/shared` Zod schemas must be defined before either app imports them
- Build order: shared → api (DB + routes) → web (pages + hooks)
