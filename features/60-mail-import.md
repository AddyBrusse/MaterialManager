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

**Nog niet gemeten** (verwachting: werkt ook, maar niet aangetoond):

- [ ] een mail **mét bijlagen** — bepaalt of alles in één `.msg` binnenkomt of
      dat er een apart pad nodig is
- [ ] een **losse bijlage** uit een geopende mail
- [ ] **meerdere mails tegelijk** geselecteerd en gesleept (`files.length > 1`)
- [ ] Edge, en de "new Outlook"-client als die ergens in gebruik is

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
mailformaat. Kandidaat: **`@kenjiuno/msgreader`** — bestaat, v1.28.0 op npm,
pure JS, geen Outlook op de server nodig. Alternatief: `msg-parser` (v1.0.10),
dat expliciet embedded messages en bijlagen noemt. *Geschiktheid is nog niet
geverifieerd — eerst testen op een échte mail uit de eigen mailbox voordat er
iets omheen gebouwd wordt.*

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
   `123456_rev B.pdf`, `ART-0012.step`, `P-4471 (3x).pdf`.
2. **Excel/CSV-bijlagen** — veel inkooppakketten sturen een regeltabel mee.
   Kolomkoppen herkennen (aantal/qty, tekening/drawing, omschrijving).
3. **Bodytekst** — patronen als `3x 123456`, `123456 - 3 stuks`, `aantal: 3`.
4. **PDF-tekst** — tekstlaag uit de PDF halen. Let op: scans zonder tekstlaag
   leveren niets op zonder OCR (buiten scope, zie open besluiten).

### 3.5 Artikel-matching

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

### 3.7 Review — de enige weg naar buiten

Eén scherm, links de mail (afzender, tekst, bijlagen), rechts de voorgestelde
regels met per regel de matchstatus. De gebruiker corrigeert, bevestigt, en pas
dan bestaat het project echt. Daarna de normale flow: offerte → PDF →
`sendViaMicrosoft365`.

**Harde regel: er gaat nooit iets naar de klant zonder menselijke bevestiging.**
Dat geldt ook in fase 2.

---

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
- Noodrem: stop met mail in de map zetten en de automatisering ligt stil. Plus
  een aan/uit-schakelaar in Instellingen.

### 5.4 Wat de gebruiker ziet

Een pagina **Mail-inbox** met binnengekomen imports en hun status; nieuwe
concept-projecten verschijnen in de projectlijst met een duidelijke
"uit mail, nog niet gecontroleerd"-markering. Een import zonder controle mag
nooit stilletjes verdwijnen.

---

## 6. Extractie: deterministisch vs. AI

De regels uit §3.4/§3.5 werken goed op gestructureerde mail (bestandsnamen,
Excel-orders, vaste klanten) en **slecht op vrije tekst** zoals
*"kun je me een prijs geven voor 5 van die flenzen van vorig jaar"*.

Een LLM die naar een Zod-schema extraheert is daar aanzienlijk beter in, maar
betekent: uitgaand internet vanaf de QNAP, een API-sleutel, en klantmail die het
eigen netwerk verlaat.

Aanpak: de extractor achter **één interface** bouwen —

```
extractLines(mail: NormalizedMail): Promise<CandidateLine[]>
```

— met eerst een deterministische implementatie. Een AI-implementatie (Claude API,
of een lokaal model via Ollama als de data binnen moet blijven) is dan later een
instelling, geen verbouwing. Niet in fase 1 bouwen.

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
- [ ] Welke `.msg`-parser (`@kenjiuno/msgreader` of `msg-parser`), en levert die
      een bruikbaar afzenderadres en `internetMessageId`? (§2.4 — fase 0)
- [ ] Werkt de drag ook met bijlagen, met meerdere mails tegelijk, en in Edge?
      (§2.1, nog niet gemeten)
- [ ] Eigen postbus (`offertes@…`) of de persoonlijke mailbox van één gebruiker?
- [ ] App-only + admin-consent, of delegated met bewaarde token? (§5.2)
- [ ] Mag mailinhoud het netwerk verlaten voor AI-extractie? (§6)
- [ ] Wat te doen met gescande PDF's zonder tekstlaag — OCR erbij of accepteren
      dat die handmatig gaan?
- [ ] Automatisch nieuwe artikelen aanmaken bij niet-gematchte regels, of altijd
      handmatig?
- [ ] Bewaartermijn van `bodyHtml` en bijlagen van genegeerde imports (AVG).
