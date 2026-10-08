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
- **Voorraad kent drie getallen**: fysiek, gereserveerd, vrij (`fysiek − gereserveerd`). Alleen `apps/api/src/services/voorraad.ts` bepaalt wat "gereserveerd" is; schermen rekenen dat niet zelf uit. Reserveren raakt de fysieke voorraad niet — afboeken doet dat, in één transactie mét voorraadmutatie. Afboeken gebeurt in de Zaagflow (gemeten rest) of vanzelf bij het gereedmelden van de order (uitgerekende rest, `services/zaagbon.ts`)
- **Materiaal kiezen gebeurt bij het aanmaken van de opdracht**, via een todo per orderregel en een voorstel uit `packages/shared/calc/zaagplan.ts` (stangenlader-lengte + welke staven). Nooit automatisch vastleggen — een mens ziet het voorstel eerst
- **Tijdregistratie spiegelt de calculatie**: instellen telt per batch, draaien per stuk — dezelfde splitsing als `computeEstimateTotals`. Zonder dat onderscheid valt geschat en werkelijk achteraf niet te vergelijken. Alleen `effectieveSeconden` (in `packages/shared/schemas/tijdregistratie.ts`) bepaalt wat "werkelijk" is; schermen rekenen dat niet zelf uit. Een correctie vervangt de gemeten waarde nooit — beide blijven staan, want het verschil is zelf een signaal
- **Nacalculatie wordt afgeleid, nooit opgeslagen**: een bewaarde nacalculatie loopt stil achter zodra er een uur bijkomt. `services/nacalculatie.ts` haalt uren uit de tijdregistratie, materiaal uit afgeboekte zaagbonnen en de verkoopprijs uit de offerteregel. "Norm bijstellen" past de artikelcalculatie aan én schrijft een prijssnapshot — zonder die terugkoppeling is het een rapport dat niemand leest
- **Rol `terminal`** is het account van een machinescherm, geen persoon. Ziet alleen de kioskroute; `middleware/terminal-scope.ts` is een **toelaat**lijst, zodat een nieuwe route standaard dicht is voor de werkvloer-pc. Wie er staat kiest zichzelf op de terminal bij bemand werk. De wachtrij hangt aan `User.machineId` en **niet aan de accountnaam** — die moest anders exact gelijk zijn aan wat er op de productiestap staat, en dan blijft het scherm leeg terwijl er werk ligt
- **Bewerkingsnamen komen uit de machinelijst**, niet uit een vrij naamveld: `bewerkingenVan` lost ze op via `machineId`. Die naam wordt `bewerkingen` op de offerteregel en `machine` op de productiestap, waar de terminal en de planning hem tot een machine moeten kunnen herleiden. Valt de `machineId` niet te herleiden, dan blijft de naam van de calculatieknoop staan
- **De koppeling van de terminal aan zijn machine komt van de server** (`bepaalMachineId`), niet uit de `persist`-store: die is een momentopname van het inloggen, en koppelen gebeurt daarna op kantoor. De namenlijst ververst elke 10 s, dus een koppeling komt binnen tien seconden aan in de hal zonder herladen
- **De wachtrij van de terminal filtert op machine-identiteit, niet op tekst.** Op een stap staat de machine als tékst, en bij een order uit een offerte is dat gewoon de naam van de bewerking. Benoemt die tekst een bestaande machine, dan geldt de toewijzing strikt; benoemt hij er geen, dan is de stap aan geen machine toegewezen en hoort hij op élke terminal zichtbaar te zijn (`utils/terminal-wachtrij.ts`) — anders verdwijnt al het werk zodra de bewerking anders heet dan de machine
- **Gereedmelden gebeurt op de terminal, en rondt de klok af in dezelfde transactie** (`rondAfVoorStap`). Een gereedgemelde stap met een lopende klok telt door: `lopendSinds` is een tijdstip, geen teller, dus de nacalculatie groeit dan ná het werk nog dagen door. Het mag ook zonder klok — wie vergeet te klokken moet het werk alsnog kunnen afmelden
- **Een terminal mag werk van een andere machine pakken.** Planning verandert op het laatste moment; standaard toont hij de eigen wachtrij, één tik toont alles. De registratie boekt dan op de machine waar het werk **werkelijk** gebeurt (`StartTijd.machineNaam`), niet op de geplande — anders rekent de nacalculatie met het uurtarief van een machine die niets gedaan heeft
- **Leveren gaat in delen** (2026-10-02): een pakbon draagt een deel van de regels en van een regel een deel van de stuks, nooit meer dan er klaarligt (`waaromNietPakbon`). De projectstatus in de leverfase komt alleen uit `statusNaLevering` (`packages/shared/calc/levering.ts`): Productie zolang er iets gemaakt moet worden, "Gereed voor levering" (`paklijst`) als alles gemaakt is, "Geleverd" (`verzonden`) als alles op een verstuurde pakbon staat. Een route die orders of pakbonnen wijzigt, zet de status niet zelf. Pakbonnen maak, pas aan en verstuur je op de **Pakbonnen-tab** (`tabs/PakbonnenTab.tsx`); een nieuwe pakbon neemt alleen regels die helemaal klaar zijn (`voorstelPakbon`)
- **Factureren gaat los van pakbonnen** (2026-10-03): over verstuurde stuks (`teFactureren = verstuurd − gefactureerd`), op de **Facturen-tab** (`tabs/FacturenTab.tsx`). Een nieuwe factuur neemt alles wat verstuurd en open is (`voorstelFactuur`); aantal en prijs zijn in het concept aan te passen, btw altijd 21 %. Een credit hoort bij een verstuurde factuur. Het mailadres komt uit `factuurMailadres` (factuurmail van de relatie vóór de contactpersoon). Regels en voorwaarden staan in `packages/shared/calc/factuur.ts`; "Gefactureerd" komt ook uit `statusNaLevering`
- **Documenten in één huisstijl** (2026-10-05): offerte, opdracht, factuur/credit, pakbon, picklist en inkooporder komen uit `apps/web/src/services/document/` (opmaak naar `design_handoff_offerte`, jsPDF met ingebouwde Plex/Space Grotesk). Een nieuw document is een spec in `documenten.ts`, geen eigen opmaak. Gegevens per project (klant, adressen, materiaal, tekening) haalt `features/projects/detail/lib/document-gegevens.ts` op
- **Projectenoverzicht** (2026-10-05): tegels en filterbalk werken met signalen uit `components/projecten/overzicht/signalen.ts`, afgeleid per project en nooit opgeslagen. Een nieuw signaal komt daar, plus een tegel of filter, en geen eigen telling in de pagina. De drempel voor "geen reactie op offerte" is `Company.offerteNabelDagen` (Instellingen → Projecten). Bewaarde weergaven staan in de gebruikersvoorkeur `projects.views`. Rechtermuisknop op een rij opent `overzicht/RijMenu.tsx` (snelle filters uit `snelle-filters.ts`, acties uit `useRijActies.tsx`; bij een selectie op de hele selectie). Een project verwijderen kan alleen zolang er niets verstuurd of gemaakt is (`waaromNietProjectVerwijderen`), anders annuleren
- **Documentnummers geeft alleen de server**, per soort per jaar (`apps/api/src/services/doc-nummer.ts`, teller `OFF-2026` in `doc_sequences`); op 1 januari begint elke reeks bij 001. De browser verzint geen nummer: nieuw project en nieuwe offerte wachten op de server, de rest toont kort een tijdelijk id (`PL-nieuw-…`). Een admin kan het volgende nummer zetten in Instellingen → Nummering (niet lager dan wat bestaat, gat in factuurnummers alleen na bevestiging, altijd met reden in het logboek `doc_reeks_wijzigingen`). Versturen gaat voor elk document via een `.eml` in Outlook en pas na "Ja, verstuurd" vastgelegd; de pakbon gaat naar de contactpersoon van de order
- **Materiaal in de calculatie gaat over de bruto lengte** (2026-10-06): `lengthMm` is netto; `brutoLengte` (`packages/shared/calc/bruto-lengte.ts`) telt zaagsnede en afvlakken, en bij een draaibank met lader in de bewerkingen (`Machine.heeftStangenlader`, `laderVan`) ook afsteek en opspanstukje per laderstang — dezelfde opbouw als het zaagplan. Bruto wordt nooit opgeslagen
- **Exoten en leveranciersprijzen** (2026-10-06): een exoot is een regel in de materiaallijst met `exoot = true`, voor één klant, op voorraad 0 tot hij binnen is; hij telt niet als "niet op voorraad" en het zaagplan slaat hem over. In de calculatie rekent hij met de geleverde maat ÷ `stuksUitEen`, zonder bruto (`materialCostPerPiece`). Leveranciersprijzen (`leverancier_prijzen`, `packages/shared/schemas/leverancier-prijs.ts`) zijn per materiaal óf per kwaliteit, per kg óf per stuk (per stuk alleen bij een materiaal: `waaromNietLeverancierPrijs`), materiaal gaat voor kwaliteit (`geldendePrijzen`). Ze dienen voor vergelijken en bestellen; de calculatie blijft op de €/kg van de kwaliteit. Scherm: `components/inkoop/`
- **Inkoop** (2026-10-06, deel 3a + 3b): bestelregels gaan over een maat (stuks × lengte), niet over een staaf (`bestel_regels`); bronnen zijn een exoot bij de opdracht, een tekort uit de materiaalselectie, met de hand en "Op bestellijst" in de voorraad. Status gaat alleen vooruit, "aangevraagd" pas na "Ja, verstuurd". Prijsaanvragen (`PA-`) gaan per leverancier als `.eml`. Vergelijken en de prijs bij "Kies" komen uit dezelfde functies (`packages/shared/calc/bestelling.ts`), en een keuze legt de prijs vast. Deel 3b: inkooporders (`INK-`) per leverancier met de vastgelegde prijs; verstuurd ligt vast, wijzigen = intrekken (vervallen, met reden) en een nieuwe maken. Ontvangen per regel, ook in delen: elk stuk een regel in de materiaallijst met mutatie "ontvangen", een exoot meteen gereserveerd voor zijn project via een zaagreservering. Het project toont alle bestelregels op de Algemeen-tab. Server: `services/{bestellingen,prijsaanvragen,inkooporders,ontvangst}.ts`
- **Inkoop in vier tabbladen** (2026-10-07): Te bestellen (leveranciers per regel, `leverancierIds`; per leverancier één `PA-` en mail) → Open prijsaanvragen (antwoord per cel in de rij, kiezen per regel) → Inkoopbuffer (status `buffer`, per leverancier, franco-grens `Relatie.francoBedrag`, "Bestel regels" maakt de `INK-`) → Besteld (verwacht/nodig/prognose, binnen boeken; helemaal binnen = weg). Scherm: `routes/desktop/BestellingenPage.tsx`, `components/inkoop/tabs/`. Nodig voor productie, uiterlijk bestellen, verwacht binnen en de stand komen alleen uit `packages/shared/calc/inkoop-planning.ts` (werkdagen, marge `Company.inkoopMargeDagen`) via `services/inkoop-overzicht.ts`; het getal bij Bestellingen en het belletje tellen alleen wat vandaag moet (`STAND_VANDAAG`). **Materiaalnummer** `260042` (jaar + volgnummer, alleen cijfers zodat het snel te typen is) per inkooporderregel (reeks `M`, server), op de pdf in "Ons nr."; bij binnen boeken ingetypt, en het voorraadstuk krijgt hetzelfde nummer (`stukNummers`, -1/-2 bij meer stuks). **Wacht op materiaal** is een afgeleide status van de productieorder (`wachtOpMateriaal`, nooit opgeslagen): aan zolang er voor die orderregel een bestelregel open staat; zo'n order staat niet op de terminal, de planning toont een label. "Niet beginnen vóór" bestaat niet meer
- **Planning als tabel** (2026-10-08): naast de Tijdlijn een Tabel (kolom = machine, rij = plek in de wachtrij, cel = productiestap), `components/planning-tabel/`. Geen eigen planning: dezelfde velden (`geplandMachine`, `queuePosition`, `geplandDatum`) en dezelfde rekenfuncties als de Wachtrij (`planningQueueUtils`); een verplaatsing schrijft de stap zelf, de rest rekent de planner. Slepen alleen naar dezelfde **`Machine.soort`** (zagen/draaien/frezen/handwerk/uitbesteed; onbekend = overal, met melding). Rode datum = start na `computeLatestStart`. "Inplannen" per project geeft een voorstel (`maakVoorstel`: receptmachine eerst, dan vroegste van de soort; in de rij op uiterlijke start) dat in zijn geheel wordt opgeslagen (`samenvoegen`)
- **Automatisch plannen** (2026-10-08): Planning → **Opdrachten** (standaardweergave) = Gantt per opdracht (één tijdlijn, kleur per machine, rode lijn = levering) met het **werkbord** eronder (kolommen wacht op materiaal / vorige stap / klaar / bezig / gereed vandaag; knop "Werkbord in eigen venster", popout `/planning-werkbord`). Rekenen gebeurt in de browser (`utils/auto-planning.ts`: prioriteit per stap `ProductieStap.prioriteit`, receptvolgorde ook op dezelfde machine, gaten vullen, nooit zelf van machine wisselen); vastleggen en terugzetten alleen via de server (`services/planning-herberekening.ts`, tabel `planning_herberekeningen` met oud/nieuw per stap). Rekent vanzelf na "in productie geven" en na slepen op het werkbord (hoger = eerder; op een machine-chip = andere machine van dezelfde soort). De melding zegt wat er ingepland is, of de levering gehaald wordt en wat er verschoof, met **Ongedaan maken**: alleen de nieuwste, helemaal of niet. Wat de werkvloer sindsdien deed (klok gestart, gereedgemeld) houdt het tegen en is in de melding met één klik te wissen — inclusief de automatische materiaalafboeking terug op voorraad (`herstelAfboekingBijGereed`). Vastzetten bestaat niet
- **Weight** is computed on read (never stored) from profile formula + dimensions + grade density
- **Mock phase ended (2026-06-22)** — nieuwe functionaliteit gaat rechtstreeks
  op de echte stack (shared schema → Prisma model/migratie → API-route →
  frontend), geen nieuwe localStorage-only modules. Zie het besluit van
  2026-06-22 in `decisions/90-decisions-log.md`.
  **Eén uitzondering is blijven staan**: `apps/web/src/api/overhead.ts`
  (bedrijfskosten) heeft nog geen backend en staat dus per browser — terwijl die
  waarden in elke kostprijs doorwerken. Zie `backend/21-api-design.md`

## Building rules

- TypeScript strict mode everywhere
- Routes thin, services hold business logic
- Components ≤ ~150 lines — split when larger
- All server state via TanStack Query + typed API wrappers in `apps/web/src/api/`
- Forms: Mantine `useForm` with a `validate` map (Dutch messages) — see `frontend/16-forms-validation.md`
- File naming: kebab-case files, PascalCase React components
- Log any non-obvious architectural choice in `decisions/90-decisions-log.md`

## Foutmeldingen: wat, waar, gevolg

Afgesproken 2026-09-25. **Elke fout die een gebruiker kan tegenkomen krijgt een
melding met drie delen**, en nooit alleen "mislukt":

- **Wat** ging er mis — in de woorden van de server als die iets zei
- **Waar** — de handeling in gewone taal, met het verzoek erbij
  (`Offerte versturen · POST /projects/…/verzend → 500 MIGRATIE_ONTBREEKT`)
- **Gevolg** — wat er wél en níet is gebeurd. Is er iets opgeslagen, klopt het
  scherm nog, moet je het opnieuw doen?

Hoe:

- `meldFout({ actie, fout, gevolg })` uit `apps/web/src/utils/fout-melding-toon.tsx`.
  De tekst zelf komt uit `foutTekst` in `utils/fout-melding.ts` (getest)
- `apiFetch` gooit een `ApiFout` (`api/client.ts`) met code, status, verzoek en
  de reden van de server — ook bij een time-out of een onbereikbare server
- **Nooit een lege `catch {}`** rond iets wat de gebruiker in gang zette.
  Terugvallen op een browserkopie mag, maar dan mét melding: stil terugvallen
  liet iemand op 2026-09-25 werken op een kopie zonder het te weten
- **Een optimistische wijziging die mislukt, gaat van het scherm af.**
  `syncProject` haalt dan op wat er op de server staat; is die ook niet te lezen,
  dan terug naar de stand van vóór de handeling
- **Groen pas als de server het bevestigd heeft** (`wachtOpOpslag`). Anders staat
  er "gelukt" en direct daaronder "mislukt"
- Het **gevolg** schrijf je bij de aanroep: alleen daar weet je wat er half of
  niet gebeurd is. Bij een time-out is dat "onbekend", niet "niets opgeslagen"
- **"Wat" is een zin voor de gebruiker, geen dump.** De technische reden
  (Prisma, Engelse parserfout) staat apart als `technisch`, klein onder de
  melding. Validatiefouten vertaalt de server per veld (`apps/api/src/lib/zod-nl.ts`:
  "Externe referentie is te lang: maximaal 200 tekens") — een nieuw veld krijgt
  daar zijn schermnaam
- **Kan iets niet, zeg dan wat er eerst moet.** Voorwaarden staan in
  `packages/shared/calc/offerte-voorwaarden.ts` (`waaromNiet…` → zin of `null`).
  Het scherm vraagt het vóór de handeling (`eis(...)` gooit een `Weigering`,
  oranje melding, er gaat niets naar de server); de server vraagt het nog eens
  en antwoordt `409 VOORWAARDE` met dezelfde zin. Geen grijze knop zonder
  uitleg: een knop die niet kan, zegt bij klikken waarom

Nog niet omgezet (stand 2026-09-25): de rode meldingen in de componenten buiten
de projectpagina — `components/{articles,materiaal,raw-materials,settings}/`,
`components/projecten/Mail*`, `hooks/use{ArticleAttachmentUpload,Nacalculatie,Reserveringen,Tijdregistratie,UserPreference}.ts`,
`routes/desktop/{Instellingen,Todos,Voorraad}Page.tsx`. Die tonen wel iets,
maar niet alle drie de delen. Wie daar iets aanraakt, zet het om.

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
npm run db:deploy     # openstaande migraties toepassen + prisma generate
```

`db:deploy` draait daarna ook `prisma generate`, en `npm run dev` doet dat bij
het starten. `migrate deploy` alleen bouwt de Prisma-client niet opnieuw op: dan
heeft de database de kolom wel, maar de server kent hem niet, en elke schrijfactie
faalt met "Unknown argument `externeRef`" (2026-09-25). De API meldt dat nu als
`CLIENT_VEROUDERD`, met het veld erbij. Op Windows moet de server daarvoor
**gestopt** zijn: een draaiende server houdt het Prisma-bestand vast, en dan faalt
`generate` met `EPERM`.

Beide laden `.env.development` via `dotenv -e`, net als `npm run dev`.
`npm run db:deploy -w apps/api` (zonder `:dev`) is de kale variant voor de NAS,
waar `DATABASE_URL` gewoon in de omgeving staat.

**Waarom dit ertoe doet:** loopt de code voor op de database, dan geeft de API
sinds 2026-09-14 geen "Interne serverfout" meer maar noemt hij de ontbrekende
migratie bij naam — met dit commando erbij. Dat werkt alleen als het commando
klopt. Sinds 2026-09-25 ook bij een ontbrekende kolom of tabel zoals Prisma die
zelf meldt (`P2022`/`P2021`); daarvóór viel precies dat geval nog door naar
"Interne serverfout".

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
| Features | `features/30-items-raw.md` · `31-items-finished.md` · `32-stock-movements.md` · `33-locations.md` · `34-grades-profiles.md` · `35-labels.md` · `36-search.md` · `37-low-stock.md` · **`38-article-calculator.md`** ← calculator modal/UI patterns · `39-graph-mail.md` · `50-operator-terminal.md` ← ontwerp achter de machineterminal (gebouwd) · `60-mail-import.md` · **`61-orderproces-backlog.md`** ← werklijst orderproces · **`62-mail-import-ai-ontwerp.md`** ← ontwerp AI-leespad (nog niet gebouwd) |
| Workflows | `workflows/40-user-flows.md` · `41-receive-material.md` · `42-adjust-stock.md` · `43-edit-locking-flow.md` · `44-mobile-scan-flow.md` |
| Decisions | `decisions/90-decisions-log.md` |
| Parked | `03-parked.md` — things not decided yet, do not implement |
| Newer areas (no doc yet) | **Tijdregistratie/Nacalculatie**: `packages/shared/{schemas/tijdregistratie,calc/nacalculatie}.ts`, `apps/api/src/services/{tijdregistratie,nacalculatie}.ts`, `features/projects/detail/tabs/{NacalculatieTab.tsx,nacalculatie/}` (boom order → machine → klokregel), `apps/api/src/middleware/terminal-scope.ts`, `components/{tijd,nacalculatie}/`, `routes/desktop/TijdregistratiePage.tsx`, `routes/TerminalPage.tsx` · Relaties: `api/relaties.ts`, `components/relaties/`, `routes/desktop/Relaties*Page.tsx` · Machines/Bedrijfskosten: `components/settings/{OverheadPage,OverheadTab,BedrijfskostenTab}.tsx` · Zaag calculator/Reserveringen/Zaagflow: `routes/desktop/{ZaagCalculatorPage,ReserveringenPage,ZaagflowPage}.tsx` · Binnen boeken: `routes/desktop/BinnenBoekenPage.tsx` (see `workflows/41-receive-material.md` status note) · **Projecten**: `api/projects.ts`, `components/projecten/`, `routes/desktop/Projecten*Page.tsx` · **Todos**: `api/todos.ts`, `components/todos/`, `routes/desktop/TodosPage.tsx` · **Materiaalselectie**: `packages/shared/calc/zaagplan.ts`, `apps/api/src/services/materiaal-selectie.ts`, `components/materiaal/` · **Prijshistorie**: `api/prijshistorie.ts`, `components/articles/{ArticlePrijshistorieTab,PrijshistorieGrafiek,prijshistorie-lijn}.tsx`, `apps/api/src/services/prijs-snapshot.ts` |

## Projecten UI conventions

- **Adding items uses a full-width modal, never a side drawer.** "Artikelen toevoegen" opens `ArtikelPickerModal` (80vh, article list + staging table). The drawer (`RegelForm`) is only for *editing* an existing regel.
- `ArtikelPickerModal`: auto-stages on checkbox click; bidirectional marge ↔ verkoopprijs; footer always visible (staging max-height 180px with internal scroll).
- Kostprijs is computed synchronously via `buildEstimateCtx` + `computeEstimateTotals` using `gradesApi.listSync()`, `profilesApi.listSync()`, `machinesApi.listSync()`.

## Sub-agent tips

When spawning sub-agents for parallel work (e.g. scaffold API routes while building frontend):
- Give the agent the relevant doc section(s) to read first
- The `packages/shared` Zod schemas must be defined before either app imports them
- Build order: shared → api (DB + routes) → web (pages + hooks)
