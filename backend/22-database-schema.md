# 22 — Database Schema

**`apps/api/prisma/schema.prisma` is de enige bron.** Dit document spiegelt
hem niet kolom voor kolom — dat liep uit elkaar zodra er een veld bijkwam.
Hieronder staat wat je uit het schema alleen niet afleest: welke modellen bij
elkaar horen en welke regels erachter zitten.

Conventies in het schema: UUID's als sleutel behalve waar een natuurlijke
sleutel bestaat (documentnummers als `PRJ-2026-003`), `snake_case`-kolommen
via `@map`, `camelCase` in Prisma en TypeScript.

## De 36 modellen, gegroepeerd

| Gebied | Modellen |
|---|---|
| Stamgegevens | `Company`, `User`, `UserPreference`, `Location`, `LocationSlot`, `Grade`, `Profile`, `SurfaceFinish`, `Machine`, `Relatie` |
| Voorraad | `RawMaterial`, `FinishedGood`, `StockMovement`, `Label` |
| Sloten | `Lock`, `LockRequest` |
| Artikelen | `Article`, `ArtikelPrijsSnapshot`, `ArticleAlias` |
| Project en documenten | `Project`, `Offerte`, `OfferteRegel`, `Opdrachtbevestiging`, `ObRegel`, `Paklijst`, `PaklijstRegel`, `Factuur`, `FactuurRegel`, `DocSequence` |
| Productie | `ProductieOrder`, `ProductieStap`, `TijdRegistratie`, `ZaagReservering`, `Todo` |
| Mail-import | `MailImport`, `IngestRun` |

## Regels die niet uit het schema blijken

- **Gewicht wordt nooit opgeslagen.** `weight_kg` komt bij het lezen uit
  `profile.volume_formula` + `dimensions` + `length_mm` + de dichtheid van de
  kwaliteit (`services/weight.ts`).
- **Voorraad kent drie getallen**: fysiek, gereserveerd, vrij. Alleen
  `services/voorraad.ts` bepaalt wat gereserveerd is — in de database staat
  alleen het fysieke aantal plus de reserveringen. Reserveren raakt de fysieke
  voorraad niet; afboeken doet dat, in één transactie mét voorraadmutatie.
- **Nacalculatie staat nergens.** Er is geen tabel voor: ze wordt afgeleid uit
  `TijdRegistratie`, afgeboekte zaagbonnen en de offerteregel. Een bewaarde
  nacalculatie loopt achter zodra er een uur bijkomt.
- **Planning hangt aan de stap, niet aan het project.** `ProductieStap` draagt
  `geplandDatum`, `geplandMachine`, `queuePosition` en `notBefore`.
  `queuePosition` is een breukgetal, zodat invoegen tussen twee buren geen
  hernummering van de hele wachtrij vraagt.
- **Een stap heeft geen 'bezig'-status**: gereed of niet, via `gereedOp` /
  `gereedDoor`. "In productie" staat op de order, "wacht op materiaal" volgt
  uit `notBefore`.
- **`Paklijst` heeft geen statusveld**; verzonden volgt uit `verzondenOp`.
  Voor de factuur bestaat geen betaalstatus — alleen een vervaldatum.
- **Er is geen auditlogtabel.** Wie wat wanneer deed is alleen te
  reconstrueren uit de tijdstempels die er wel zijn (`verzondenOp`,
  `geaccepteerdOp`, `gereedOp`, `updatedAt`). Wil je een echte geschiedenis,
  dan is daar een nieuw model voor nodig.
- **`User.machineId`** koppelt een terminal-account aan een machine. De
  wachtrij van de terminal hangt daaraan, niet aan de accountnaam.

## Migraties

Prisma Migrate. Op een werk-pc via de projectscripts, omdat Prisma
`.env.development` niet zelf laadt:

```
npm run db:status     # welke migraties staan open
npm run db:deploy     # openstaande migraties toepassen
```

Op de NAS staat `DATABASE_URL` in de omgeving en volstaat
`npm run db:deploy -w apps/api`. Zie CLAUDE.md.
