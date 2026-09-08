# 50 — Machineterminal & tijdregistratie

> **Status: ontwerp, niet gebouwd.** Herschreven 2026-09-08 na de keuze voor een
> **pc met touchscreen per machine** (was: tablet) en voor een actor die een
> **persoon óf een robot** kan zijn. Geen code voordat de open besluiten in §9
> beslist zijn.

---

## 1. Waarom dit er komt

Er zijn twee doelen, en ze delen één bouwwerk.

**Bedienen bij de machine.** De operator ziet zijn wachtrij, opent de tekening,
krijgt het NC-programma waar het hoort, en vinkt af als de stap klaar is.

**Meten wat het werkelijk kost.** Vandaag legt het systeem alleen `gereedOp`
vast: het moment waarop iemand een stap afvinkte. Dat is een tijdstip, geen
tijdsduur — en zeker geen machinetijd. De enige "waarheid" in de database is nu
de calculatie, dus jullie eigen schatting. Zolang dat zo blijft, kan geen enkele
analyse (en geen model) meer doen dan die schatting consistenter napraten.

Het tweede doel heeft de langste doorlooptijd: data groeit per week, niet per
sprint. Zie §8 — daarom kan het datamodel eerder landen dan de terminal.

---

## 2. Hardware: pc met touchscreen, geen tablet

Gekozen 2026-09-08.

| | Pc + touchscreen | Tablet |
|---|---|---|
| NC naar de machine | Zit op het netwerk, schrijft rechtstreeks in de machinemap op de NAS — **de USB-stick verdwijnt** | Alleen via een omweg |
| Tekening lezen | 22" is leesbaar bij de machine | Knijpen en schuiven |
| Beheer | Browser in kioskmodus op de bestaande webapp | App-store, accu, apparaatbeheer |
| Kosten per plek | vergelijkbaar | vergelijkbaar |

De NC-route is de doorslaggevende reden, en die stond niet in de vorige versie
van dit document. Hij lost een probleem op dat losstaat van tijdregistratie.

**Waar rekening mee te houden:**

- Koelvloeistof, spanen en olie. Een spatwaterdicht scherm of een kast, en geen
  toetsenbord — alles moet met de vingers kunnen.
- Windows-updates die 's ochtends een dialoog over het kioskscherm zetten. Eén
  keer goed inrichten (updates buiten werktijd, automatisch herstarten naar de
  kiosk) of het blijft irriteren.
- Per plek stroom en netwerk.

De terminal draait de bestaande webapp in kioskmodus op een eigen route; er komt
geen aparte Vite-app zoals de vorige versie voorstelde, tenzij §9 anders beslist.

---

## 3. Wie doet het werk: machine én actor

Beslist 2026-09-08: **per machine én per persoon of robot.**

Een stap wordt uitgevoerd op een machine, door een actor. Die actor is een mens
of hij is er niet — bij onbemand draaien (robotcel, stangenlader, pallet­wisselaar,
of gewoon een lange cyclus die 's nachts doorloopt) staat er niemand bij.

Dat onderscheid is niet cosmetisch, want het **verandert de kostprijs**. De
calculatie kent al twee losse tarieven per machine:

```
machineRatePerHour    ← de machine draait
operatorRatePerHour   ← er staat iemand bij
```

Bij onbemand draaien telt alleen het eerste. Wie dat niet vastlegt, rekent
onbemande uren te duur en weet niet hoeveel een robotcel oplevert — precies de
vraag waarvoor je hem koopt.

**Beperking om eerlijk over te zijn:** zonder koppeling met de besturing weet het
systeem niet uit zichzelf dat er onbemand gedraaid is. De operator verklaart dat
bij het starten ("laten lopen"). Een echte machinekoppeling (MTConnect, OPC UA,
of desnoods een signaallampje op een IO-module) is een apart traject; zie §9.

---

## 4. De registratie moet de calculatie spiegelen

Dit is de belangrijkste ontwerpregel van dit document.

De calculatie (`ArticleEstimate`) rekent per machineknoop met:

- `setupMin` — instellen, **per batch**
- `cycleMin` — draaien, **per stuk**

Meet je alleen "deze stap duurde 3 uur", dan kun je dat nergens tegenaan
leggen: je weet niet hoeveel daarvan instellen was en op hoeveel stuks de rest
sloeg. De registratie moet dus dezelfde vorm hebben als de schatting, anders is
vergelijken onmogelijk en is de hele dataset alleen achteraf leuk om naar te
kijken.

Daarom draagt elke tijdregel drie dingen die vaak vergeten worden:

| Veld | Waarom |
|---|---|
| `soort` — instellen of draaien | Anders kun je `setupMin` en `cycleMin` niet los toetsen |
| `bemanning` — bemand of onbemand | Bepaalt of het operatortarief meetelt (§3) |
| `aantalStuks` | Zonder dit geen cyclustijd per stuk, en `cycleMin` is per stuk |

---

## 5. Datamodel

### Nieuw: `TimeEntry`

```prisma
model TimeEntry {
  id              String    @id @default(uuid())
  productieStapId String    @map("productie_stap_id")
  machineId       String    @map("machine_id")

  // Wie: een mens, of niemand (onbemand). Nooit allebei leeg én bemand.
  operatorId      String?   @map("operator_id")
  bemanning       String    // 'bemand' | 'onbemand'

  // Wat: instellen of draaien. Spiegelt setupMin / cycleMin (§4).
  soort           String    // 'instellen' | 'draaien'

  startedAt       DateTime  @map("started_at")
  stoppedAt       DateTime? @map("stopped_at")
  /** Afgeleid bij stoppen, maar apart opgeslagen: een correctie achteraf mag
   *  de gemeten klok niet overschrijven. */
  minuten         Int?
  /** Aantal stuks dat in deze regel gemaakt is. Null bij instellen. */
  aantalStuks     Int?      @map("aantal_stuks")

  /** Handmatig bijgesteld, met reden. Zo blijft zichtbaar wat gemeten is en
   *  wat iemand er later van vond — dat verschil is zelf een signaal. */
  gecorrigeerd    Boolean   @default(false)
  notitie         String?

  createdAt       DateTime  @default(now()) @map("created_at")

  @@index([productieStapId])
  @@index([machineId, startedAt])
  @@map("time_entries")
}
```

Meerdere regels per stap is normaal: instellen en draaien zijn aparte regels, een
onderbreking levert een nieuwe regel op, en twee mensen aan één machine leveren
twee gelijktijdige regels op.

### Uitgebreid: `Machine`

```prisma
model Machine {
  // ... bestaande velden ...
  networkPath String? @map("network_path")  // \\NAS\share\machines\DMG-450TC
  /** Kan deze machine onbemand draaien? Stuurt of de terminal die knop toont. */
  onbemandMogelijk Boolean @default(false) @map("onbemand_mogelijk")
}
```

### Nieuw: `ArticleFile`

Ongewijzigd overgenomen uit de vorige versie: tekeningen, NC-programma's en
instelbladen per artikel, met het pad op de NAS. Nodig omdat de terminal ze moet
kunnen openen zonder dat iemand een map opzoekt.

---

## 6. Schermindeling (1920×1080, liggend)

Met een 22"-scherm hoeft er niets weggeklapt te worden: wachtrij, actieve stap
en tekening passen naast elkaar. Dat is het verschil met het tabletontwerp, waar
je moest wisselen.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  DMG-450TC · Addy · 14:32                              [ wissel gebruiker ]│
├───────────────┬──────────────────────────────┬───────────────────────────┤
│  WACHTRIJ     │  ACTIEVE STAP                │  TEKENING                 │
│  (~22%)       │  (~38%)                      │  (~40%)                   │
│               │                              │                           │
│  PRJ-2026-007 │  ART-0042 · As ø50x178       │   [ pdf / 3d-weergave ]   │
│  ART-0042     │  Stap 2 van 4 · draaien      │                           │
│  4 st         │  4 stuks                     │   [ NC naar machine ]     │
│  ─────────    │  ───────────────────────     │                           │
│  PRJ-2026-004 │   ⏱  01:12:40                │                           │
│  ART-0031     │   instellen · bemand         │                           │
│  12 st        │                              │                           │
│  ─────────    │  [ pauze ]     [ stap klaar ]│                           │
│  …            │                              │                           │
│               │  [ overschakelen naar draaien ]                          │
│               │  [ onbemand laten lopen ]    │                           │
└───────────────┴──────────────────────────────┴───────────────────────────┘
```

Knoppen zijn vingergroot (min. 44 px), en de belangrijkste — *stap klaar* —
staat het verst van de rand zodat je hem niet per ongeluk raakt bij het
schoonvegen van het scherm.

---

## 7. Wat er op de vloer misgaat, en wat het systeem daaraan doet

Een tijdregistratie die niet tegen de werkelijkheid kan, levert data op die je
later niet durft te gebruiken. Deze gevallen moeten in het ontwerp zitten, niet
achteraf aangeplakt:

| Wat er gebeurt | Wat het systeem doet |
|---|---|
| Iemand vergeet te stoppen | Na een instelbare tijd (voorstel: 2× de geschatte tijd, minimaal een uur) een melding op de terminal, en de regel wordt gemarkeerd als "loopt nog" in plaats van stilzwijgend door te tellen |
| De dag eindigt met een lopende regel | 's Nachts automatisch afsluiten op de laatste bekende activiteit, gemarkeerd als geschat — nooit stilzwijgend een nacht meetellen |
| Twee mensen aan één machine | Twee gelijktijdige regels, elk met hun eigen actor. Geen conflict |
| Onbemand doorgedraaid | Eén regel met `bemanning: 'onbemand'`, geen operator, alleen machinetarief |
| Verkeerd gestart | Corrigeren mag, maar de gemeten klok blijft staan naast de correctie |
| Terminal offline | Geen offline-eis (LAN, zoals de hoofdapp) — maar een gestarte regel mag niet verdwijnen bij een herstart van de browser |

Het laatste punt van §7 is een ontwerpeis, geen implementatiedetail: de lopende
regel staat op de server, niet in de browser.

---

## 8. Bouwvolgorde

De terminal is de voorkant; het datamodel is de basis. Ze hebben verschillende
doorlooptijden, en dat is het argument om ze te scheiden.

**Fase 0 — meten kan eerder dan de terminal.**
`TimeEntry`, de API, en start/stop op de wachtrijkaart die er al staat. Draait op
de kantoor-pc, met de mensen die er nu zijn. Vanaf dat moment groeit de dataset,
terwijl de hardware nog uitgezocht wordt. Levert bovendien de kennis die het
terminalontwerp beter maakt: hoe vaak wordt er vergeten te stoppen, hoe lang
duren stappen echt, werken er twee mensen aan één machine.

**Fase 1 — bestanden per artikel.** `ArticleFile`, upload en download, beheer
vanuit kantoor. De terminal kan niets tonen wat er niet is.

**Fase 2 — jobmappen en NC-route.** `Machine.networkPath`, mappenboom op de NAS
bij het accepteren van een offerte, NC naar de machinemap bij het starten van een
stap.

**Fase 3 — de terminal.** Kioskroute, wachtrij, actieve stap, tijdregistratie met
de knoppen uit §6.

**Fase 4 — terugkoppeling naar kantoor.** Geschat versus werkelijk per project en
per artikel. Dit is waar het om begonnen was: pas hier zie je of de calculatie
klopt, en pas hier ontstaat de dataset voor een kostenschatter (zie het gesprek
over LLM-schatting — dat komt hierná, niet ervoor).

---

## 9. Open besluiten

- [ ] **Draait er nu al onbemand, en op welke machines?** Bepaalt of
      `onbemandMogelijk` meteen zin heeft of voorbereidend is.
- [ ] **Machinekoppeling later?** Een signaal uit de besturing (MTConnect / OPC UA
      / IO-module) zou bemand-versus-onbemand en cyclustijden kunnen meten in
      plaats van laten verklaren. Apart traject, maar het datamodel moet het niet
      uitsluiten.
- [ ] **Inloggen aan de terminal:** namenlijst zoals in de hoofdapp, of een pincode
      per persoon? Een namenlijst op een gedeeld scherm is snel maar niemand is
      dan echt "ingelogd".
- [ ] **Kioskroute in de bestaande webapp, of toch `apps/operator`?** De vorige
      versie koos een aparte app; met een pc-browser is een route in de bestaande
      app waarschijnlijk genoeg en scheelt het een tweede bundel.
- [ ] **NAS-pad instellen** in Instellingen → Bedrijf, of alleen via `.env`?
- [ ] **NC al aanwezig op de machine:** overschrijven of waarschuwen?
- [ ] **Automatisch afsluiten 's nachts:** op welk tijdstip, en telt zo'n
      geschatte regel mee in de vergelijking geschat-versus-werkelijk of wordt hij
      apart gehouden?
