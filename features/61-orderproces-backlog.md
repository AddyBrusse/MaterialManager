# 61 — Orderproces backlog

Werklijst voor de doorontwikkeling van het orderproces: projectstatussen,
materiaalreserveringen, inkoopsuggesties en documenten (offerte, paklijst,
factuur).

Opgesteld 2026-09-09 na een inventarisatie van de bestaande keten in
`apps/api/src/routes/projects.ts`, `apps/web/src/api/projects.ts` en
`apps/web/src/components/projecten/`.

Punten zijn los te bouwen en te testen. Waar een punt op een ander leunt
staat dat erbij. Vink af met `[x]` zodra een punt op master staat.

---

## Wat er nu gebeurt per statusstap

Referentie voor de rest van dit document — dit is de bestaande situatie.

| Status | Trigger | Wat de code doet |
|---|---|---|
| `concept` | project aanmaken / mail koppelen | Regels toevoegen (artikel, qty, marge, verkoopprijs). Kostprijs synchroon berekend. Offerte aanmaken = snapshot van de regels incl. bevroren `bewerkingen`. |
| `offerte` | `verzendOfferte` | Offerte → `verzonden` + `verzondenOp`; project `concept` → `offerte`. PDF via `buildOffertePdf`, verzending via `sendViaMicrosoft365`. Meerdere offertes naast elkaar mogelijk. |
| `bevestigd` | `accepteerOfferte` | Offerte → `geaccepteerd`, alle andere → `vervallen`. Maakt de opdrachtbevestiging als bevroren snapshot. Maakt per regel een `ProductieOrder` met stappen uit de bevroren `bewerkingen`, status `gepland`. Project → `bevestigd`. OB heeft eigen PDF + mail. |
| `productie` | `checkOffStap` / `markOrderGereed` | Stap krijgt `gereedOp` + `gereedDoor`. Order herberekent zichzelf: `gepland` → `in_productie` (≥1 stap) → `gereed` (alle stappen). Project `bevestigd` → `productie`. Werkbon-PDF bestaat (`services/productie-pdf.ts`). |
| `paklijst` | `createPaklijst` | Neemt alleen orders met status `gereed`, één regel per order. 409 als er al een paklijst is. Project → `paklijst`. |
| `verzonden` | `verzendPaklijst` | Zet `verzondenOp` op de paklijst, project → `verzonden`. Geen PDF, geen mail. |
| `gefactureerd` | `createFactuur` | Bouwt regels uit de geaccepteerde offerte, btw 21%, vervaldatum +30 dagen. Project → `gefactureerd`. `verzendFactuur` zet alleen `verzondenOp`. |

Terug kan via revert-endpoints per stap, met server-side guards: terug naar
bevestigd kan niet als er stappen zijn afgevinkt, terug naar productie niet
als een order gereed is of de paklijst verzonden is.

---

## Fase 0 — beslissen (geen code)

- [ ] **0. Documentopslag: JSONB of eigen tabellen?**
  Offertes, OB, paklijst en factuur zitten nu als JSON in de `projects`-rij.
  Werkt voor de huidige schermen, maar is niet te queryen: geen omzet per
  maand, geen openstaand bedrag, geen index op factuurnummer.
  Bepaalt hoe punt 2, 3, 9 en 12 gebouwd worden.
  Voorstel: **factuur** naar een eigen tabel (queryen, indexeren,
  betaalstatus, bewaarplicht), offerte/OB/paklijst voorlopig JSONB laten.
  Beslissing loggen in `decisions/90-decisions-log.md`.

## Fase 1 — vinden en overzicht

Snelle winst, weinig risico, geen onderlinge afhankelijkheden behalve waar
vermeld.

- [ ] **1. Tab-deeplinks op de projectpagina**
  `/projecten/PRJ-2026-003?tab=factuur`. De tab is nu alleen component-state,
  dus niets is te bookmarken of in een mail te plakken. Punt 2 leunt hierop.

- [ ] **2. Documentenpagina `/documenten`**
  Platte lijst van alle offertes, OB's, paklijsten en facturen door elkaar:
  nummer, type, klant, datum, bedrag, status. Filters op type, periode en
  klant. Klik → project op de juiste tab (punt 1).
  Nu is er geen enkele plek waar documenten wonen; je kunt een factuurnummer
  wel in de zoekbalk op `/projecten` plakken (die doorzoekt ook verborgen
  kolommen), maar niets in de UI suggereert dat.
  *Hangt af van 0: met JSONB moet de API dit uit alle projectrijen
  platslaan, met tabellen is het een gewone query.*

- [ ] **3. Zoeken op alle offertes, niet alleen de huidige**
  `projectColumns.tsx` zoekt via `currentOfferte(p)` — de geaccepteerde,
  anders de laatste. Een vervallen offerte is daardoor onvindbaar.

- [ ] **4. `on_hold` en `geannuleerd` bereikbaar maken**
  Beide statussen bestaan in de enum, de badges, het filter op
  `ProjectenPage` en in `deriveProjectStatus`, maar nergens in de code wordt
  een project erop gezet. Via `PATCH /:id` kan het technisch wel — er is
  alleen geen knop. Nodig: knop, reden, en een besluit over wat er met
  lopende productieorders en reserveringen gebeurt.

- [ ] **5. `deriveProjectStatus` versus het opgeslagen `status`-veld**
  Er zijn nu twee bronnen van waarheid die uit elkaar kunnen lopen. Kiezen
  welke leidend is. Doen vóór punt 4 iets aan de statussen verandert.

## Fase 2 — materiaal

Het grootste blok. Projecten raken op dit moment nergens de voorraad: geen
mutatie, geen reservering, in de hele keten niet.

- [ ] **6. Reserveringen aan projecten koppelen**
  `ZaagReservering` hangt in het Prisma-schema aan `calculatieNr`, zonder
  `projectId` of `artikelId`. Reserveringen en projecten zijn nu twee losse
  werelden. Model uitbreiden + migratie, zodat een reservering bij een
  projectregel hoort.

- [ ] **7. Reserveren bij accepteren van de offerte**
  `accepteerOfferte` bepaalt wat er aan materiaal nodig is en zet dat vast.
  *Hangt af van 6.*

- [ ] **8. Voorraad afboeken**
  Beslissen op welk moment de mutatie valt: bij gereedmelden van de
  productieorder, of bij het verzenden van de paklijst.
  *Hangt af van 6 en 7.*

- [ ] **9. Inkoopsuggesties**
  Bij accepteren: wat is nodig, wat ligt er, wat moet besteld worden.
  *Hangt af van 6–8; zonder reserveringen is er niets om tegen af te zetten.*

## Fase 3 — levering en facturatie

- [ ] **10. Deelleveringen: meerdere paklijsten per project**
  `createPaklijst` gooit een 409 bij een tweede paklijst. Openzetten en per
  regel bijhouden hoeveel er al geleverd is.

- [ ] **11. Factuur uit de levering in plaats van uit de offerte**
  `createFactuur` leest `offertes.find(o => o.status === 'geaccepteerd')`.
  Lever je 8 van 10 stuks, dan factureer je toch 10.
  *Hangt af van 10.*

- [ ] **12. Betaalstatus op de factuur**
  `FactuurSchema` kent `verzondenOp` en `vervaldatum`, maar geen `betaaldOp`.
  De vervaldatum wordt berekend en verder nergens gebruikt — niets signaleert
  een te late betaling. Nodig: betaalstatus, bewaking, debiteurenoverzicht.
  Meteen meenemen: de KPI "Open facturen" op `ProjectenPage` telt projecten
  met status `verzonden`, dus wat er nog *gefactureerd* moet worden. Hernoemen
  naar "Nog te factureren" voordat er een tweede betekenis bij komt.

- [ ] **13. Creditnota**
  Een verzonden factuur kan nu alleen weg via `revertGefactureerd`, die hem
  gewoon weggooit.
  *Hangt af van 0 en 12.*

## Fase 4 — documenten

- [ ] **14. Paklijst-PDF**
  De knop staat er al, `disabled`, met de titel "PDF generatie beschikbaar na
  backend implementatie" (`PaklijstTab.tsx`).

- [ ] **15. Factuur-PDF**
  Idem (`FactuurTab.tsx`). Zelfde patroon als `buildOffertePdf`.

- [ ] **16. Mailflow voor paklijst en factuur**
  Offerte en OB gaan via `sendViaMicrosoft365` met PDF-bijlage. Bij paklijst
  en factuur zet `verzend` alleen een timestamp — je moet zelf handmatig
  mailen terwijl het systeem doet alsof het verzonden is.
  *Hangt af van 14 en 15.*

- [ ] **17. Verzonden facturen archiveren**
  PDF's worden telkens opnieuw gegenereerd uit de huidige data. Voor offerte
  en OB is dat veilig (bevroren snapshots), voor een factuur wil je een kopie
  van wat er daadwerkelijk de deur uit ging.
  *Hangt af van 15. Bewaartermijn eerst navragen bij de boekhouder.*

## Los

- [ ] **18. Documentnummering per jaar resetten**
  `nextDocId` maakt `${prefix}-${year}-${n}`, maar `doc_sequences.last_n`
  loopt globaal door per prefix en wordt nooit gereset. De eerste offerte van
  2027 wordt `OFF-2027-042`.
  *Eerst navragen wat hier voor facturen verplicht is.*

---

## Voorgestelde volgorde

0 → 1 → 2 → 4 → 5 → fase 2 in één stuk → 10 → 11 → 12 → 14 → 15 → 16 → rest.
