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

- [x] **0. Documentopslag: JSONB of eigen tabellen?** — *besloten 2026-09-09*
  **Alle vier de documenten (offerte, OB, paklijst, factuur) krijgen een eigen
  tabel met een `projectId`-FK.** `projects` houdt naam, relatie, contact,
  klantreferentie, status, leverdatum en notities.
  Onderbouwing en trade-offs staan in `decisions/90-decisions-log.md`.

  Uitvoering is punt 0a hieronder; de rest van de lijst gaat daarvan uit.

- [x] **0a. Migratie: documenten uit JSONB naar eigen tabellen** — *gedaan 2026-09-09*
  Prisma-modellen + migratie, bestaande projectrijen omzetten, en de
  serverkant meeverhuizen: `withProject` (row lock + read-modify-write op
  één rij), `serialize`, en `deriveProjectStatus` dat zijn gegevens nu uit
  meerdere tabellen moet halen. Frontend: de vier tabs veranderen van
  databron.
  Uitgevoerd: tien tabellen (de vier documenten plus productieorders, met hun
  regels en stappen), migratie met backfill uit de JSONB, en
  `services/project-store.ts` als enige plek die de tabellen kent. Het
  API-contract is niet veranderd — routes leveren nog steeds één genest
  `Project`, zodat de planningwachtrij, `ProductieTab`, `projectColumns` en
  `todoAlerts` ongewijzigd bleven.

  Twee dingen kwamen bij het verifiëren boven water en zijn meegenomen: een
  document-id is nu een globale primary key, dus een botsend nummer overschreef
  stilletjes het document van een ánder project (`persist` controleert nu het
  eigendom) en `nextDocId` gaf nummers uit zonder te kijken of ze vrij waren
  (telt nu door tot er een vrij nummer ligt).

### Bewaarplicht — uitgangspunten

Uitgezocht op 2026-09-09, uit openbare bronnen (Belastingdienst,
Rijksoverheid, art. 52 AWR); **nog niet door een boekhouder bevestigd**.

- Bewaartermijn **7 jaar** voor de hele administratie, **10 jaar** voor
  gegevens over onroerende zaken.
- Het gaat om meer dan facturen: grootboek, debiteuren/crediteuren, in- en
  verkoopadministratie, contracten. Een geaccepteerde offerte en de
  opdrachtbevestiging horen bij de verkoopadministratie.
- **Digitaal bewaren mag**, en is zelfs het uitgangspunt: bewaren in de vorm
  waarin je het hebt verzonden of ontvangen. Een verstuurde pdf uitprinten en
  het bestand weggooien is juist fout.
- Converteren mag onder voorwaarden (art. 52 AWR): juiste en volledige
  weergave, de hele termijn beschikbaar, binnen redelijke tijd leesbaar, en
  de echtheidskenmerken gaan mee.
- Gevolg voor ons: de factuur-pdf wordt nu telkens opnieuw gegenereerd uit
  live data en de huidige template, dus na een layoutwijziging is niet meer
  aan te tonen wát er verstuurd is. Zie punt 17.
- Het archief moet de 7 jaar overleven. Op één QNAP is een backupstrategie
  daarmee onderdeel van de bewaarplicht, geen losse zorg.

## Fase 1 — vinden en overzicht

Snelle winst, weinig risico, geen onderlinge afhankelijkheden behalve waar
vermeld.

- [x] **1. Tab-deeplinks op de projectpagina** — *gedaan 2026-09-09*
  `/projecten/PRJ-2026-003?tab=factuur` opent meteen de factuur. De open tab
  staat in de URL in plaats van in component-state, dus een document is te
  bookmarken en in een mail te plakken. Een onbekende waarde valt terug op de
  offertetab, en de offertetab zelf laat de parameter weg zodat de URL schoon
  blijft. Tabwisselingen gebruiken `replace`, dus vijf keer klikken kost geen
  vijf stappen terug om de pagina te verlaten.

- [x] **2. Documentenpagina `/documenten`** — *gedaan 2026-09-09*
  Platte lijst van alle offertes, OB's, paklijsten en facturen door elkaar:
  nummer, soort, klant, project, referentie, datum, status, regels, bedrag.
  Zoeken op nummer, project, klant of referentie; filters op soort en klant.
  Een rij opent het project op de tab van dát document (punt 1).
  `GET /api/documenten` doet vier gerichte queries — dat kan pas sinds de
  documenten eigen tabellen hebben.

  Nog niet gedaan: filteren op periode, en sorteren op een kolom. De lijst
  staat op datum aflopend en het filteren gebeurt in de browser, net als op de
  projectenlijst. Bij een paar duizend documenten is dat prima; daarna moet het
  filter naar de server.

- [ ] **3. Zoeken op alle offertes, niet alleen de huidige**
  `projectColumns.tsx` zoekt via `currentOfferte(p)` — de geaccepteerde,
  anders de laatste. Een vervallen offerte is daardoor onvindbaar.

- [x] **4. `on_hold` en `geannuleerd` bereikbaar maken** — *gedaan 2026-09-09*
  Knoppen in de projectkop met een **verplichte reden**; die staat naast de
  badge en in de tooltip op de projectenlijst, en is doorzoekbaar. Het project
  onthoudt waar het vandaan kwam (`statusVorige`), zodat hervatten terugkeert
  naar precies die stap — ook als je eerst on hold zette en daarna annuleerde.

  Wat er met lopende productieorders gebeurt: **niets wordt weggegooid**. Orders
  en afgevinkte stappen blijven staan. Wat wél verandert is dat de planning het
  project overslaat: `buildStapItems` en `berekenGhostBelasting` slaan een
  stilgelegd project over, dus het bezet geen plek meer in de machinewachtrij en
  telt niet mee in de prognose. Bij hervatten komt het terug op zijn plek.

  Reserveringen zijn hier nog niet bij betrokken — die bestaan nog niet per
  project (punt 6). Zodra ze er zijn moet on hold ook daar iets doen.

- [x] **5. `deriveProjectStatus` versus het opgeslagen `status`-veld** — *gedaan 2026-09-09*
  `deriveProjectStatus` is verwijderd. Hij werd **nergens aangeroepen** en was
  het bovendien oneens met de routes: zodra er productieorders bestonden gaf hij
  'productie', terwijl een zojuist geaccepteerde offerte 'bevestigd' hoort te
  geven. Het opgeslagen `status`-veld is nu de enige bron van waarheid; de
  routes zetten het bij elke overgang.

## Fase 2 — materiaal

Het grootste blok. Projecten raken op dit moment nergens de voorraad: geen
mutatie, geen reservering, in de hele keten niet.

- [x] **6. Reserveringen aan projecten koppelen** — *gedaan 2026-09-09*
  `ZaagReservering` draagt nu een optionele `projectId` en `artikelId` naast het
  bestaande `calculatieNr`. Beide optioneel, want er wordt ook gezaagd voor
  voorraad en intern werk, en `calculatieNr` blijft de groepering van een
  zaagbon. In de zaagcalculator kies je project en artikel bij het reserveren
  (kies je een project, dan beperkt de artikellijst zich tot dat project); op de
  projectpagina staat onder Productie wat er vastligt; op de
  reserveringenpagina staat een kolom met een link naar het project.

  Bij het verwijderen van een project of artikel blijft de reservering bestaan
  met een losse verwijzing (`ON DELETE SET NULL`) — het materiaal ligt immers
  nog steeds vast, dus die keuze hoort iemand te zien.

  Onderweg gevonden en meegenomen: `toNum` in de reserveringsroute zette een
  Prisma `Decimal` niet om, waardoor alle maten als **string** de API uit gingen
  en elke optelling stringplakwerk deed (`0 + "870"` → `"0870"`). Dat raakte de
  beschikbare lengte per staaf op de voorraadpagina en de totalen op de
  reserveringenpagina.

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
  gewoon weggooit — bij een verzonden factuur mag dat niet.
  *Hangt af van 0a en 12.*

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
  Pdf's worden telkens opnieuw gegenereerd uit de huidige data én de huidige
  template. De regels zijn bevroren, de vórm niet — verandert het briefpapier
  of de layout, dan ziet een factuur uit 2026 er volgend jaar anders uit dan
  wat de klant kreeg. Bewaren: de pdf-bytes zoals verstuurd, plus aan wie en
  wanneer.
  *Hangt af van 15. Zie de uitgangspunten bij fase 0. Bewaartermijn nog
  bevestigen bij de boekhouder.*

## Los

- [ ] **18. Documentnummering per jaar resetten**
  `nextDocId` maakt `${prefix}-${year}-${n}`, maar `doc_sequences.last_n`
  loopt globaal door per prefix en wordt nooit gereset. De eerste offerte van
  2027 wordt `OFF-2027-042`.
  *Eerst navragen wat hier voor facturen verplicht is.*

---

## Voorgestelde volgorde

0, 0a, 1, 2, 4 en 5 (gedaan) → fase 2 in één stuk → 10 → 11 → 12 → 14 → 15 → 16 → rest.
