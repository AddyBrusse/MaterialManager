# 60 — Mail-import → automatisch project

Status: **spec / niet gebouwd.** Geen code schrijven voordat de open besluiten
onderaan (§8) zijn beslist.

Drag-drop test uitgevoerd op 2026-09-07 — **slepen vanuit Outlook werkt**,
zie §2.1 voor de meting en wat dat voor het ontwerp betekent.

Doel: een binnenkomende klantmail (offerteaanvraag of opdrachtbevestiging) leidt
tot een **concept-project met offerteregels**, klaar voor menselijke controle.
Nooit automatisch versturen.

Twee fasen, zoals gevraagd:

1. **Handmatig** — gebruiker haalt één mail de app in en de app vult het project.
2. **Automatisch** — de server haalt zelf mail op via Microsoft Graph.

Belangrijkste ontwerpkeuze: fase 1 en fase 2 delen **dezelfde pipeline** (§3).
Het enige verschil is wie de trigger is: een mens of een timer. Bouw fase 1
zó dat fase 2 er alleen een ingest-bron bij zet.

---

## 1. Wat er al staat

| Bestaand | Waar | Hergebruik |
|---|---|---|
| MSAL + Graph `sendMail` | `apps/web/src/services/graph-mail.ts`, `features/39-graph-mail.md` | Zelfde app-registratie; scope `Mail.Read` erbij, pas nodig vanaf fase 2 |
| `@azure/msal-browser` | al in `apps/web/package.json` | geen nieuwe auth-stack nodig |
| Project + Offerte + OfferteRegel | `packages/shared/src/schemas/project.ts` | de import produceert exact deze vorm |
| Kostprijsberekening | `buildEstimateCtx` + `computeEstimateTotals` | prijzen op geïmporteerde regels |
| Artikel-velden `tekening` / `rev` / `naam` | `Article` in `apps/api/prisma/schema.prisma` | matching-sleutels |
| Uploads per artikel | `apps/api/src/routes/uploads.ts`, `config.uploadsDir` | bijlagen wegschrijven, zelfde patroon |
| Offerte-PDF + versturen | `apps/api/src/routes/pdf.ts`, `OfferteTab.tsx` | de uitgaande kant is al klaar |

Conclusie: de uitgaande helft (offerte → PDF → mail) bestaat. Dit document gaat
alleen over de **inkomende** helft.

---

## 2. Fase 1 — hoe komt de mail binnen?

### 2.1 Slepen vanuit Outlook — GEMETEN, het werkt

Getest op 2026-09-07 op de werkplek met `tools/drag-drop-test.html`:
Windows 10/11, Chrome 152, klassiek Outlook. Een mail uit de berichtenlijst
naar de browser slepen levert **een echt `.msg`-bestand met inhoud** op:

```
types         : text/plain | Files
files.length  : 1
  [0] name="RE_ Orderbevestiging 0003772761 Klantref Addy.msg"
      type="(leeg)"   size=166912 bytes
getData('text/plain') → "Van\tOnderwerp\tOntvangen\tGrootte\tCategorieën\n
                         Remco de Laat\tRE: Orderbevestiging …\t30-7-2026\t137 kB"
```

Eerdere aanname in dit document was dat Chromium dit *niet* kon (virtueel
bestand via `CFSTR_FILEDESCRIPTOR`, geen `CF_HDROP`). **Die aanname was onjuist**
voor deze combinatie. Vandaar de meting; niet alsnog op de theorie bouwen.

Vier gevolgen voor het ontwerp:

1. **Geen MIME-type.** `file.type` is leeg. Detectie dus op de extensie `.msg`
   plus de magic bytes van een OLE2 compound file
   (`D0 CF 11 E0 A1 B1 1A E1`, eerste 8 bytes). Nooit op `file.type` vertrouwen.
2. **Bestandsnaam ≠ onderwerp.** Windows saneert: `RE: ` werd `RE_ `. De naam is
   dus lossy. Onderwerp, afzender en datum uit de `.msg`-inhoud halen, niet uit
   de bestandsnaam.
3. **`text/plain` is een gratis controle.** Het is de Outlook-lijstregel
   (kolomkoppen + één tab-gescheiden rij) met weergavenaam, onderwerp en datum.
   Bruikbaar als kruiscontrole op de parse, maar het bevat **geen e-mailadres** —
   relatie-resolutie (§3.2) kan hier niet op leunen.
4. **`.msg`-parsing is nu wél nodig** voor fase 1. Zie §2.3.

**Tweede meetronde** (zelfde opstelling, 13:55):

| Gesleept | Resultaat |
|---|---|
| Nieuwsbrief van Microsoft | `.msg`, 112 KB — ook niet-klantmail komt gewoon binnen |
| `koppel order: 2026077` (interne mail, 332 kB in de lijst) | `.msg`, **382 KB** — de omvang wijst erop dat bijlagen in het `.msg` zitten |
| Losse bijlage `2026077-001.STEP` uit die mail | bestand, 110 KB, `type` leeg |

Drie dingen die dit toevoegt:

5. **Een losse bijlage slepen werkt óók**, maar levert alléén `Files` op —
   **geen `text/plain`**. De kruiscontrole uit punt 3 bestaat dus niet bij
   bijlagen; daar is de bestandsnaam alle context die er is.
6. **De bestandsnaam van de bijlage is goud.** `2026077-001.STEP` is
   `<ordernummer>-<positie>.<extensie>`, en `2026077` staat óók in het
   onderwerp van de mail (`koppel order: 2026077`). Dat is precies het verband
   waar §3.4 op mikt: de bijlagen van één mail zijn te koppelen aan het
   ordernummer uit het onderwerp, en `-001`, `-002` … geven de regelvolgorde.
   Dit patroon eerst bevestigen op meer echte mail voordat er hard op
   gerekend wordt — één waarneming is geen conventie.
7. **Niet elke binnenkomende mail is een klantmail.** De Microsoft-nieuwsbrief
   is het bewijs; in fase 2 (§5.3) is dat de regel, niet de uitzondering.

**Nog niet gemeten:**

- [ ] **meerdere mails tegelijk** geselecteerd en gesleept (`files.length > 1`)
- [ ] Edge, en de "new Outlook"-client als die ergens in gebruik is
- [ ] Of het `.msg` van een mail mét bijlagen die bijlagen ook daadwerkelijk
      bevat — de omvang suggereert van wel, maar dat blijkt pas uit de
      parser-proef (fase 0)

De testpagina blijft in `tools/` staan om dit later opnieuw te kunnen meten,
bijvoorbeeld na een Chrome- of Outlook-update. Dit gedrag is niet
gegarandeerd door een standaard; het kan met een update verdwijnen. Daarom
blijft §2.3 als terugval bestaan en is de pipeline (§3) bewust losgekoppeld
van de manier waarop de mail binnenkomt.

### 2.2 Route voor fase 1: dropzone op een leeg project

Een leeg project krijgt een dropzone: sleep de mail erin, de app vult het
project. Precies wat gevraagd is, en het is nu aantoonbaar mogelijk.

Server-side stappen: `.msg` ontvangen → parsen → normaliseren naar de vorm van
§3.1 → pipeline in. De `MailImport`-rij (§4) wordt óók bij deze route
aangemaakt, met `bron: 'drop'` — zodat fase 2 later niets nieuws hoeft te
introduceren en er één audit-trail is.

De Graph-picker uit de oorspronkelijke opzet vervalt hiermee **niet**; hij is
alleen niet meer nodig om fase 1 mogelijk te maken. Fase 2 heeft Graph
sowieso nodig (§5), en een picker is dan een kleine toevoeging op code die er
al staat.

### 2.3 Terugvalroutes

Blijven bestaan, voor als de drag-route stukgaat op een update of op een
andere werkplek anders werkt:

1. **`.msg` vanaf het bureaublad.** Identiek pad, alleen sleept de gebruiker de
   mail eerst naar het bureaublad. Kost niets extra in code.
2. **Alleen bijlagen + plaktekst.** Dropzone voor PDF/STEP/Excel plus een
   textarea voor de mailtekst. De handmatige nooduitgang; hoe dan ook bouwen.
3. **Graph-picker.** Zie §2.2 — komt met fase 2 vanzelf beschikbaar.

### 2.4 `.msg` parsen — het echte risico van fase 1

`.msg` is een OLE2 compound file met MAPI-property-streams, geen open
mailformaat. Gekozen: **`@kenjiuno/msgreader`** (v1.28.0, pure JS, geen Outlook op de server
nodig), getest op een echt `.msg` — zie hieronder.

**Uitkomst van de proef (2026-09-07).** Werkt: onderwerp, body, ontvangstdatum,
ontvangers, bijlagen mét bytes, en **berichten-als-bijlage recursief** (een
embedded `.msg` levert zijn eigen onderwerp, afzender, body én bijlagen op).
Daarmee is de werkafspraak "doorsturen als bijlage" uit §3.2 technisch rond.

Twee dingen die de proef bevestigde, en die het ontwerp dus moet dragen:

- **Niet elk bericht draagt een afzender of een message-id.** Het testbestand
  (een nooit verzonden bericht) had geen `senderEmail`, geen `messageId` en geen
  transport headers. Het adres zat alleen in `lastModifierName`. De parser
  probeert daarom `senderSmtpAddress` → `senderEmail` → `lastModifierName`, en
  elk veld mag ontbreken zonder dat het misgaat.
- **De hash-terugval van §4 is geen theorie maar de praktijk.** `dedupeKey()`
  gebruikt het message-id als het er is en valt anders terug op een hash over
  afzender + onderwerp + datum.

Een Exchange-DN (`/O=EXCHANGELABS/…`) wordt expliciet als "geen adres"
behandeld: liever niets dan een string die nergens op matcht.

**Zelf narekenen op eigen mail:**

```
npm run probe:msg -w apps/api -- "/pad/naar/mail.msg"
PROBE_OWN_DOMAINS=boers-metaalbewerking.nl npm run probe:msg -w apps/api -- "…"
```

Dat drukt per veld af of het aanwezig is, plus de afzender-resolutie en de
idempotentie-sleutel. Het script leest alleen; het schrijft niets weg.

Wat er getest moet worden op een echt bestand, in deze volgorde:

| Te extraheren | Risico |
|---|---|
| Onderwerp, bodytekst | laag |
| Ontvangstdatum | laag |
| Bijlagen (naam + bytes) | midden — embedded messages en inline images |
| **Afzender-e-mailadres** | **hoog** — zie hieronder |
| `internetMessageId` | midden — bepaalt de idempotentie van §4 |

Het afzenderadres is het bekende pijnpunt: bij interne/Exchange-afzenders staat
er soms geen SMTP-adres maar een Exchange-DN
(`/O=EXCHANGELABS/OU=…/CN=RECIPIENTS/CN=…`) in de property. Bij externe klanten
— het geval dat hier telt — is het meestal wel een gewoon SMTP-adres, maar dat
moet aangetoond worden, niet aangenomen. Terugval als het adres ontbreekt:
matchen op weergavenaam uit `text/plain` (§2.1) en de gebruiker in het
reviewscherm laten bevestigen. Nooit stil raden.

Ook `internetMessageId` verdient aandacht: ontbreekt die in een gesleept `.msg`,
dan moet de idempotentie-sleutel van §4 een hash over
(afzender + onderwerp + ontvangstdatum) worden. Dat is zwakker, en het is beter
dat nú te weten dan bij het bouwen van fase 2.

**Concrete volgende stap:** één echte klantmail als `.msg` opslaan (mag een
onschuldige zijn) en daarop de parser uitproberen. Dat beantwoordt de hele
tabel hierboven in één keer.

---

## 3. De pipeline (gedeeld door fase 1 en 2)

```
ingest → relatie → intent → regel-extractie → artikel-matching → concept → review
```

### 3.1 Ingest

Normaliseer elke bron naar één vorm, ongeacht herkomst:

```
afzender (naam + adres), ontvangstdatum, onderwerp,
body als platte tekst (+ HTML bewaard), internetMessageId,
bijlagen: [{ bestandsnaam, mimetype, bytes }]
```

Bijlagen worden weggeschreven volgens het bestaande uploads-patroon
(`config.uploadsDir`), niet in de database.

### 3.2 Relatie-resolutie

Matchen op afzenderadres tegen `Relatie.email`, `emailOfferte`, `emailFactuur`
en `contacten[].email`; daarna op maildomein. Resultaat is een **suggestie**;
de gebruiker bevestigt in het reviewscherm. Bij geen match: nieuwe relatie
aanmaken of handmatig kiezen. Nooit stil toewijzen.

#### Doorgestuurde mail — beantwoord 2026-09-07

Beide paden komen voor: klanten sturen rechtstreeks, én er wordt intern
doorgestuurd, door **iedereen in het eigen domein**. De afzender van het `.msg`
is dus soms de klant en soms een collega. Daarom deze volgorde, en niet anders:

```
1. is de afzender een eigen adres?          → ja: doorgestuurd, ga naar 2
                                              nee: afzender = de klant, klaar
2. zoek het doorstuur-blok in de body       → oorspronkelijke afzender eruit
3. niets bruikbaar gevonden                 → geen suggestie, gebruiker kiest
```

**Stap 1 — eigen adres herkennen.** Twee bronnen, beide al aanwezig of
triviaal toe te voegen:

- de M365-adressen van de gebruikers (`User.email`, zie `frontend`/Instellingen)
- een lijstje eigen domeinen in Instellingen → Bedrijf (nu: één domein, maar
  als lijst opslaan — bedrijven krijgen extra domeinen)

Dit is óók een netjes af te vangen randgeval: mail die een gebruiker aan
zichzelf stuurt, of een interne mail zonder klant erin, hoort geen project op
te leveren.

**Stap 2 — het doorstuur-blok.** Outlook zet er een kop in als
`Van: … / Verzonden: … / Aan: … / Onderwerp: …` (NL) of
`From: / Sent: / To: / Subject:` (EN). Regels om te hanteren:

- Beide talen ondersteunen; de client-taal ligt niet vast.
- Bij meerdere hops staan er meerdere blokken, nieuwste bovenaan. De klant is
  het **diepste** blok met een adres dat niet van het eigen domein is.
- Het adres kan ontbreken en alleen een weergavenaam bevatten (afzender stond
  in het adresboek). Dan matchen op naam tegen `Relatie.naam` en
  `contacten[].naam` — als suggestie, met lagere zekerheid.

Dit blijft brozer dan een envelope-afzender, en dat is acceptabel omdat het
resultaat sowieso een suggestie is die iemand bevestigt (§3.7). Het faalt naar
"gebruiker kiest zelf", nooit naar een verkeerde klant.

**Werkafspraak die dit grotendeels oplost.** Wie een klantmail doorstuurt naar
de app: **doorsturen als bijlage** (Outlook: *Als bijlage doorsturen* /
`Ctrl+Alt+F`) in plaats van inline. Dan zit het originele bericht als embedded
`.msg` in de doorgestuurde mail, mét de echte kop — geen tekstparsing nodig,
en de afzender is gewoon het adres van de klant. De parser moet embedded
messages dus sowieso aankunnen: **zit er een embedded bericht in, gebruik dan
dát als de eigenlijke mail.** Inline doorsturen blijft werken via de regels
hierboven; het is alleen minder betrouwbaar.

### 3.3 Intent-classificatie

Onderscheid **offerteaanvraag** vs. **opdrachtbevestiging**:

- Trefwoorden NL/EN: `offerte`, `aanvraag`, `prijsopgave`, `prijs`, `RFQ`,
  `quotation` ↔ `bestelling`, `order`, `opdracht`, `PO`, `purchase order`,
  `akkoord`, `gaan we mee akkoord`.
- **Belangrijker dan trefwoorden:** staat er een eigen `OFF-YYYY-NNN` in body of
  bijlage? Dan hoort de mail bij een **bestaand project** — geen nieuw project
  aanmaken, maar de bestaande offerte op `geaccepteerd` voorstellen en de
  opdrachtbevestiging klaarzetten. Dit is de belangrijkste dubbelwerk-preventie.
- Bij twijfel: intent `onbekend`, mens beslist. Niet gokken.

### 3.4 Regel-extractie

Kandidaatregels (`{ ruweTekst, tekeningnr?, rev?, qty?, bron }`) uit, op volgorde
van signaalwaarde:

1. **Bijlage-bestandsnamen** — in een verspanend bedrijf het sterkste signaal:
   `123456_rev B.pdf`, `ART-0012.step`, `P-4471 (3x).pdf`. In de eigen mail is
   het patroon `<ordernummer>-<positie>.<ext>` waargenomen
   (`2026077-001.STEP`, bij onderwerp `koppel order: 2026077`) — als dat
   consistent blijkt, levert dat zowel de koppeling mail → order als de
   regelvolgorde gratis op.
2. **Excel/CSV-bijlagen** — veel inkooppakketten sturen een regeltabel mee.
   Kolomkoppen herkennen (aantal/qty, tekening/drawing, omschrijving).
3. **Bodytekst** — patronen als `3x 123456`, `123456 - 3 stuks`, `aantal: 3`.
4. **PDF-tekst** — tekstlaag uit de PDF halen. Let op: scans zonder tekstlaag
   leveren niets op zonder OCR (buiten scope, zie open besluiten).

#### Rangorde: document vóór tekening (2026-09-08)

Een klantmail draagt twee soorten bijlagen, en die zijn niet gelijkwaardig:

| Soort | Wat het is | Wat we ermee doen |
|---|---|---|
| **document** | inkooporder, aanvraag, opdrachtbevestiging | bepaalt de regels: welke onderdelen, hoeveel, in welke volgorde |
| **tekening** | dwg, step, pdf met een tekeningnummer | hangt *aan* een regel; wordt zelf nooit een regel zolang er een document is |
| overig | handtekeningplaatjes, voorwaarden, losse rommel | genegeerd |

`attachment-kind.ts` doet die indeling; `leidendDocument()` kiest het eerste
leesbare document. Is er zo'n document, dan maakt alleen zijn regeltabel regels
en worden de tekeningen via `hoortBij()` aan de juiste regel gehangen — de klant
noemt zijn tekening `<order>-<positie>-<ons nummer>-<rev>`, dus het onze zit
erin besloten. Is er géén leesbaar document, dan zijn de bestandsnamen alles wat
we hebben en mogen die wél regels maken.

De mailtekst mag altijd regels toevoegen: "en graag ook 2x P-4471 erbij" staat
in geen enkel document.

Herkenning van een document gaat op **inhoud vóór naam**. Elke klant verzint
zijn eigen bestandsnaam — `Purchase offer_RFQ2600241_20260902_07-17.pdf` bleek
op naam niet als document herkenbaar — maar in de tekst staat gewoon
"Offerteaanvraag" en "Inkoopofferte". Let bij naamherkenning op de eigen
woordgrens: `\brfq\b` matcht níet tussen `_` en `R`, dezelfde val als in
`findRev`. En `RFQ2600241-1-…​dwg` is een tékening met het aanvraagnummer erin,
geen document — daarom moet het losse woord door niet-alfanumeriek gevolgd
worden.

**Waarom dit moest:** zonder de rangorde stond hetzelfde onderdeel twee keer in
het reviewscherm — één regel uit de ordertabel (mét aantal) en één uit de
bestandsnaam van de tekening (zonder aantal). Waargenomen op echte mail van een
klant, 2026-09-08.

### 3.5 Artikel-matching

> **Gebouwd** — `services/extract-lines.ts` en `services/match-articles.ts`.
> Drempels: onder 0,45 geen suggestie; pas een tekeningtreffer (0,75+) vult
> voor; staat de beste minder dan 0,1 boven de tweede, dan wordt er niets
> voorgevuld. Een naamgelijkenis alleen levert nooit een voorgevulde koppeling
> op. Een correctie in het reviewscherm wordt als `ArticleAlias` bewaard, en
> een handmatige keuze blijft staan als er opnieuw gematcht wordt.

Per kandidaat scoren tegen bestaande artikelen:

| Sleutel | Score |
|---|---|
| `tekening` exact (+ `rev` gelijk) | zeer hoog |
| `tekening` genormaliseerd (scheidingstekens weg, voorloopnullen weg, case-insensitief) | hoog |
| `ArticleAlias`-treffer voor deze relatie (§4) | zeer hoog |
| `naam` fuzzy (Postgres `pg_trgm` similarity) | midden |
| eerder geleverd aan déze relatie | bonus |

Uitkomst per regel: **match** / **twijfel (top-3 keuzes)** / **nieuw artikel nodig**.
Drempels conservatief: liever twijfel tonen dan fout koppelen. Een fout gekoppeld
artikel betekent een verkeerde prijs in een offerte naar de klant.

### 3.6 Concept opbouwen

- Project `status: 'concept'`, naam uit onderwerp, `klantRef` uit een herkend
  PO-/referentienummer, relatie uit §3.2.
- Offerte v1 met `OfferteRegel`s: gematchte regels krijgen prijs via
  `buildEstimateCtx` + `computeEstimateTotals`; niet-gematchte regels worden
  placeholderregels met prijs 0 en een duidelijke markering.
- Bijlagen gekoppeld aan het project en, waar een artikel gematcht is, aan dat
  artikel (bestaande attachments-structuur).

#### Een tekeningnummer is van de klant

`loadArticles` geeft de relatie van elk artikel mee, en `matchLine` weet welke
klant deze mail is. Een treffer op een artikel van een **andere** klant blijft
zichtbaar als kandidaat maar wordt nooit meer automatisch voorgevuld, en zegt
erbij van wie hij is.

Waarom dat moet: tekeningnummers zijn van de klant. Dat de "4471" van een nieuwe
klant gelijk is aan de "4471" van Stinis zegt niets. Vóór deze rem werd zo'n
regel automatisch gekoppeld aan het artikel van de verkeerde klant — aangetoond
met een test op 2026-09-08, en precies het soort fout dat pas opvalt als er
verkeerd geoffreerd is. Wegfilteren doen we niet: soms maak je hetzelfde
onderdeel voor twee klanten, en oude artikelen dragen helemaal geen relatie.

### 3.6 Wat er bij het koppelen gebeurt — **GEBOUWD**

"Koppelen en N regels overnemen" doet vier dingen, in deze volgorde:

1. **Projectgegevens invullen** — het ordernummer van de klant (`klantRef`) en de
   gevraagde leverdatum, allebei door het model uit het document gehaald. Alleen
   wat nog leeg was: wie het project met de hand invulde had daar een reden voor.
2. **Ontbrekende artikelen aanmaken.** Vroeg de klant om iets dat niet in de
   database staat, dan ontstaat daar een artikel voor — naam, tekeningnummer,
   revisie — en de meegestuurde tekening en STEP worden er als bijlage aan
   gehangen (server-side gekopieerd, de bytes gaan niet door de browser). Zonder
   dit blijft die tekening in de mailmap liggen en begint de volgende aanvraag
   van dezelfde klant weer bij nul. Er wordt géén calculatie verzonnen: dat
   artikel heeft nog geen prijs, en die regel staat dus op € 0.
3. **Regels op een concept-offerte zetten**, met de prijs bij het gevraagde
   aantal (instelkosten gelden per batch). Ook bij een opdrachtbevestiging gaat
   het eerst naar een offerte — één route is minder verrassend dan twee, en de
   prijzen zijn sowieso te controleren voordat er iets de deur uit gaat.
4. **De import op 'verwerkt' zetten** en aan het project koppelen.

Bij een regel die aan een *bestaand* artikel hangt gaan de meegestuurde
bestanden **niet** naar dat artikel: die houdt zijn eigen, gecontroleerde
tekening. Een export uit het systeem van de klant mag die niet stilzwijgend
vervangen. De bestanden blijven bij de mail-import staan, en die hangt aan het
project.

Wat er ontstaat is overal een concept: niets is verstuurd, alles blijft
aanpasbaar.

### 3.7 Review — de enige weg naar buiten

Het controlescherm beantwoordt in volgorde de vragen die je bij een order stelt:

**Wie is de klant?** Klant en contactpersoon staan bovenaan. Het contact wordt
alleen op e-mailadres herleid (`suggestContact`) — een naam die lijkt op een
contact is te zwak bewijs, en een verkeerd contact op een offerte is pijnlijker
dan een leeg veld. Is de klant nog niet bekend, dan maak je hem hier aan met de
gegevens van de afzender; koppelen blijft geblokkeerd tot er een klant staat.

**Wat wil hij?** Eén regel per onderdeel: aantal, artikelnummer van de klant,
ons tekeningnummer, omschrijving, zijn prijs, en ons artikel. De preview
(3D-render of tekening) staat vooraan, want daar herken je een onderdeel het
snelst aan.

**Klopt de prijs?** Noemt de klant een stuksprijs, dan wordt die vergeleken met
onze calculatie bij dát aantal (`mail-prijzen.ts`). Wijkt hij af, dan staat er
een waarschuwing boven de tabel en is het bedrag rood met het verschil in de
tooltip. Dit is het geval van de klant die bestelt tegen een oude prijslijst: de
order ziet er normaal uit, en pas bij het factureren blijkt dat er te weinig op
staat. Onder een cent verschil zwijgt hij — dat is afronding.

**Technische details staan ingeklapt.** Uitgelezen pdf-tekst, zekerheids-
onderbouwing, herkomst van de afzender en de ruwe berichttekst hebben één plek
onderaan het scherm in plaats van evenveel gewicht als de regels zelf. Een
scherm dat je dagelijks gebruikt hoort niet ingericht te zijn op het geval dat
zelden voorkomt.

**Tijdens het inlezen loopt er een teller.** Uploaden, pdf's lezen en twee
lezingen door het model kosten tientallen seconden; zonder terugkoppeling lijkt
het scherm te hangen. De dropzone toont welke stap loopt en hoe lang het al
duurt — "het duurt lang" is iets anders dan "het doet niets", en dat verschil
zie je alleen aan een lopende teller.



Eén scherm, links de mail (afzender, tekst, bijlagen), rechts de voorgestelde
regels met per regel de matchstatus. De gebruiker corrigeert, bevestigt, en pas
dan bestaat het project echt. Daarna de normale flow: offerte → PDF →
`sendViaMicrosoft365`.

**Harde regel: er gaat nooit iets naar de klant zonder menselijke bevestiging.**
Dat geldt ook in fase 2.

---

#### Opnieuw uitlezen

`POST /mail-imports/:id/opnieuw` laat het model vers naar een al binnengehaalde
mail kijken. Nodig omdat de mail opnieuw slepen niet helpt: die wordt op zijn
`dedupeKey` herkend en teruggegeven zoals hij was zodra er iets mee gedaan is
(genegeerd, gekoppeld, of een handmatige keuze).

Het originele `.msg` bewaren we niet, en dat hoeft ook niet: onderwerp, bericht
en alle bijlagen staan op schijf, inclusief de uitgelezen pdf-tekst
(`mailUitRij` + `buffersUitMap`). Een gescande order gaat dus nog steeds als
afbeelding mee. De vorige uitkomst gaat weg — handmatige koppelingen inbegrepen
— dus het reviewscherm vraagt eerst om bevestiging als die er zijn. Een mail die
al aan een project hangt wordt geweigerd (409).

## 4. Datamodel-toevoegingen

### `MailImport`

Audit-trail en — belangrijker — idempotentie.

```
id, bron ('graph' | 'drop' | 'plak'), internetMessageId (UNIQUE), graphMessageId,
afzenderNaam, afzenderEmail, onderwerp, ontvangenOp, bodyText, bodyHtmlPath,
bijlagen (Json), relatieId, intent, extractie (Json), status, projectId,
foutmelding, createdAt
```

`status`: `nieuw` | `verwerkt` | `genegeerd` | `fout`.

De unique index op `internetMessageId` is **niet optioneel** — zonder dat maakt
de poller uit fase 2 bij elke herstart dezelfde projecten opnieuw aan.
`extractie` bewaart wat de matcher voorstelde, zodat achteraf te zien is waarom
er iets misging.

### `ArticleAlias`

```
id, relatieId, externalRef, articleId, createdAt, createdBy
```

Als een gebruiker in het reviewscherm een match corrigeert, wordt die correctie
onthouden: klant X's `P-4471` is voor altijd onze `ART-0012`. Dit is wat de
matcher over ~20 mails van middelmatig naar goed brengt, en het kost bijna niets.

---

## 5. Fase 2 — automatisch ophalen via Graph

### 5.1 Polling, geen webhooks

Graph change notifications vereisen een publiek bereikbaar HTTPS-endpoint waar
Microsoft naartoe kan POSTen. De app draait LAN-only op de QNAP → **niet
bruikbaar**. In plaats daarvan een **delta query** elke 2–5 minuten vanuit het
Express-proces.

### 5.2 Credentials

Een browser-MSAL-token verdwijnt zodra het tabblad dicht gaat. Voor achtergrond-
verwerking moet de **server** credentials hebben. Twee opties:

| | App-only (client credentials) | Delegated + bewaarde refresh token |
|---|---|---|
| Permissie | `Mail.Read` **application** | `Mail.Read` delegated, device-code login |
| Admin-consent | ja, nodig | nee |
| Secret op server | client secret / certificaat | refresh token |
| Reikwijdte beperken | Application Access Policy → precies één mailbox | de ingelogde gebruiker |
| Robuustheid | draait door | token kan verlopen, dan opnieuw inloggen |

Aanbeveling: **app-only met Application Access Policy** op één postbus
(bijv. `offertes@…`). Dat is de nette daemon-oplossing; de policy zorgt dat de
app-registratie ondanks tenant-brede permissie maar bij die ene mailbox kan.

### 5.3 Reikwijdte en noodrem

- Alleen mail in een **specifieke map** verwerken (aparte `ShopCommand`-map of
  een gedeelde postbus). Regel in Outlook zet mail van bekende klanten daarin.
- Na verwerking het bericht verplaatsen/categoriseren, zodat de status ook in
  Outlook zichtbaar is.
- Onbekende afzenders → `MailImport` met status `nieuw`, géén project.
- **Let op de volgorde:** de eigen-domein-check van §3.2 gaat vóór deze
  filter. Een intern doorgestuurde klantorder heeft een *bekende* afzender
  (een collega) en zou anders als "geen klant" worden weggefilterd — precies de
  mails die de automatisering juist moet oppikken.
- Noodrem: stop met mail in de map zetten en de automatisering ligt stil. Plus
  een aan/uit-schakelaar in Instellingen.

### 5.4 Wat de gebruiker ziet

Een pagina **Mail-inbox** met binnengekomen imports en hun status; nieuwe
concept-projecten verschijnen in de projectlijst met een duidelijke
"uit mail, nog niet gecontroleerd"-markering. Een import zonder controle mag
nooit stilletjes verdwijnen.

---

## 6. Extractie: alleen de AI — **GEBOUWD**

Sinds 2026-09-08 leest **alleen** het taalmodel de mail. De patroonmotor
(`extract-lines.ts`) is verwijderd. Zekerheid gaat hier boven dekking: liever
geen regel dan een verkeerde regel.

**Waarom eruit:** patronen kennen alleen de vormen die we hebben gezien. Op een
echte offerteaanvraag stond `2611-1456-0234 As ø50x178 4 4-9-2026pcs` — de
leverdatum plakte in de uitgelezen pdf-tekst tegen de eenheid aan — en las het
patroon **2026 stuks**. Een leeg veld vraagt om aandacht; een fout getal dat er
uitziet als een gelezen aantal niet. Elke guard die we erbij zetten dekte precies
één waargenomen layout af, en de volgende klant heeft er weer een andere.

### 6.1 Werkverdeling: de AI leest, de code kiest

| Stap | Wie | Waarom |
|---|---|---|
| Wat vraagt de klant? | Claude (`claude-opus-5`) | Layouts verschillen per klant; lezen is precies wat een taalmodel goed kan. |
| Welk artikel uit onze database is dat? | `match-articles.ts` | `2615-0090-0530` en `2615-0091-0530` bestaan allebei en schelen één cijfer. Die keuze hoort in code die te testen is, niet in een model dat aannemelijk gokt. |
| Welke bijlage is het handelsdocument? | `attachment-kind.ts` | Deterministisch, op inhoud vóór naam; stuurt de rangorde uit §3.4. |

Het model krijgt onderwerp, body, bijlagenamen en de uitgelezen pdf-tekst, en
geeft via een Zod-schema (`messages.parse` + `zodOutputFormat`) regels terug:
`{ tekening, omschrijving, qty, rev, positie, bronBestand, bronTekst, zekerheid }`.

### 6.2 Gescande documenten: het model kijkt ernaar

`pdf-text.ts` haalt alleen een tekstlaag eruit. Een gescande inkooporder levert
niets op — en dat is precies het document dat de regels moet bepalen. Zo'n pdf
gaat als **document-blok** mee, handelsdocumenten eerst (`scansVoorModel`),
hoogstens 3 bijlagen van maximaal 8 MB.

### 6.3 Drie controles op wat eruit komt

Elk op een andere manier van fout gaan, en **geen ervan gooit een regel weg** —
ze bepalen de zekerheid, en een mens beslist. Stil verwijderen zou het ergste van
twee werelden zijn: je ziet niet dát er iets stond en je kunt het niet nakijken.

| Controle | Vangt | Hoe |
|---|---|---|
| `gegrond` | een verzonnen regel | `bronTekst` moet letterlijk in de mail of bijlage staan (genormaliseerd op spaties; anders alle losse woorden) |
| `tekeningGegrond` | een verschoven cijfer | het tekeningnummer zélf moet er teken voor teken staan — de duurste fout die deze functie kan maken |
| `bevestigd` | toeval | een **tweede, onafhankelijke lezing** van dezelfde mail moet dezelfde regel met hetzelfde aantal opleveren |

De controlelezing verving het "twee motoren zijn het eens"-signaal dat wegviel
met de patroonmotor, en is sterker: die tweede lezing kijkt naar dezelfde tabel
in plaats van naar een bestandsnaam. Kost wel twee keer de invoer-tokens — uit
met `MAIL_AI_CONTROLE=uit`. Uit een scan valt niets terug te zoeken; die regels
krijgen `null` en tellen als *onzeker*, niet als *fout*.

### 6.4 Zekerheidsscore

Per regel, `certainty.ts`, gewogen over drie dingen:

| Weegt | Wat het meet |
|---|---|
| 35 % herkenning | zelfrapportage van het model, gecorrigeerd met de drie controles hierboven |
| 45 % koppeling | hoe sterk de artikelmatch is (handmatig = 1, twijfel telt maar deels) |
| 20 % volledigheid | weten we een tekeningnummer én een aantal |

In het reviewscherm staat per regel een balkje met percentage; de tooltip somt de
redenen op. Boven de tabel het gemiddelde, de laagste regel, of er een
controlelezing was, en hoeveel regels ongegrond of onbevestigd zijn.

**Wees hier eerlijk over:** dit is een *vertrouwensindicatie*, geen gemeten
nauwkeurigheid. Het zegt hoe goed onderbouwd een regel is, niet hoe vaak dit
soort regels achteraf klopte. Echte nauwkeurigheid kan pas uit de correcties die
mensen in het reviewscherm maken; die worden bewaard maar nog niet geteld.

### 6.5 Wat er gebeurt als de AI wegvalt

Er is geen terugval meer. Zonder sleutel, met `MAIL_AI=uit`, of bij een storing
levert een gesleepte mail **geen regels** op, met de reden in gewone taal in het
reviewscherm. Dat is de bedoeling: de afzender, de bijlagen en de relatie zijn er
nog, en de regels worden dan handmatig toegevoegd. Een leeg scherm met een
melding is eerlijker dan een half resultaat dat er compleet uitziet.

De sleutel staat in de omgeving, niet in de database — hij hoort niet in een
backup van de shopdata. Klantmail verlaat het netwerk; akkoord gegeven op
2026-09-08, zie `decisions/90-decisions-log.md`.

---

## 7. Bouwvolgorde

**Fase 0 — parser-proef (een halve dag, doe dit eerst)**
Eén echte klantmail als `.msg`, een `.msg`-parser erop, en kijken of onderwerp,
body, bijlagen, afzenderadres en `internetMessageId` er bruikbaar uitkomen
(§2.4). Valt het afzenderadres of het message-id tegen, dan verandert dat het
ontwerp van §3.2 en §4 — beter nu weten dan halverwege fase 1a.

**Fase 1a — ingest + review (grootste deel van de waarde)**
`MailImport`-model → dropzone op een leeg project → `.msg` parsen →
normalisatie → relatie-suggestie → reviewscherm met handmatige regelinvoer →
project + offerte aanmaken.
Zonder enige slimme matching is dit al sneller dan overtypen.

**Fase 1b — matching**
Regel-extractie, artikel-matching, `ArticleAlias`, leren van correcties.
Hier wordt gemeten hoe goed het is, op échte mail.

**Fase 2 — automatisering**
App-registratie uitbreiden, server-side credentials, delta-poller,
mail-inbox-pagina, aan/uit in Instellingen.

Fase 2 heeft pas zin als fase 1b op de eigen mail aantoonbaar accuraat is. Een
poller die slechte concepten produceert kost meer tijd dan hij bespaart.

---

## 8. Open besluiten

- [x] ~~Uitkomst van de drag-drop test (§2.1)~~ — **gemeten 2026-09-07: werkt.**
      Gevolg: `.msg`-parsing is nodig (§2.4), de dropzone is de route voor fase 1.
- [x] ~~Welke `.msg`-parser?~~ — **`@kenjiuno/msgreader`**, gekozen en getest
      (§2.4). Afzender en message-id kunnen ontbreken; beide hebben nu een
      terugval. Nog wel narekenen op een échte klantmail uit de eigen mailbox.
- [ ] Werkt de drag ook met meerdere mails tegelijk, en in Edge? (§2.1)
- [x] ~~Komen klantmails rechtstreeks binnen of doorgestuurd?~~ — **beantwoord
      2026-09-07: allebei**, en doorsturen kan door iedereen in het eigen
      domein. Uitgewerkt in §3.2 (eigen-domein-check vóór alles).
- [ ] Wordt de werkafspraak "doorsturen als bijlage" (§3.2) overgenomen? Dat
      scheelt de brooste code in het hele ontwerp.
- [ ] Is `<ordernummer>-<positie>.<ext>` in bijlagenamen een vaste conventie of
      toeval? De extractie leest het patroon **alleen** als het voorvoegsel ook
      echt een ordernummer uit het onderwerp is, dus een verkeerde aanname doet
      geen kwaad — maar met een bevestiging kan die controle losser.
- [ ] Eigen postbus (`offertes@…`) of de persoonlijke mailbox van één gebruiker?
- [ ] App-only + admin-consent, of delegated met bewaarde token? (§5.2)
- [ ] Mag mailinhoud het netwerk verlaten voor AI-extractie? (§6)
- [ ] Wat te doen met gescande PDF's zonder tekstlaag — OCR erbij of accepteren
      dat die handmatig gaan?
- [ ] Automatisch nieuwe artikelen aanmaken bij niet-gematchte regels, of altijd
      handmatig?
- [ ] Bewaartermijn van `bodyHtml` en bijlagen van genegeerde imports (AVG).
