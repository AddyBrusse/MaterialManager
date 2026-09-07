# 60 — Mail-import → automatisch project

Status: **spec / niet gebouwd.** Geen code schrijven voordat de open besluiten
onderaan zijn beslist en de drag-drop test (§2) is uitgevoerd.

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
| MSAL + Graph `sendMail` | `apps/web/src/services/graph-mail.ts`, `features/39-graph-mail.md` | Zelfde app-registratie, scope uitbreiden met `Mail.Read` |
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

### 2.1 Het probleem met slepen vanuit Outlook

Outlook (klassiek, Windows) biedt een gesleepte mail aan als *virtueel bestand*
(`CFSTR_FILEDESCRIPTOR` / `FILECONTENTS`), niet als `CF_HDROP`. Chromium heeft
dat nooit geïmplementeerd — in Chrome/Edge is `e.dataTransfer.files` daardoor
naar verwachting **leeg** bij het droppen van een mail.

> **Niet 100% zeker.** Dit is niet getest op de daadwerkelijke werkplek en hangt
> mogelijk af van de Outlook-build (klassiek vs. "new Outlook") en de
> browserversie. **Eerst meten, dan bouwen.**

**Test:** open `tools/drag-drop-test.html` (dubbelklik, of via de dev-server op
`/drag-drop-test.html`) op een Windows-machine met Outlook. Sleep achtereenvolgens:

- een mail uit de berichtenlijst
- een mail met bijlagen
- een losse bijlage uit een geopende mail
- een `.msg` dat eerst naar het bureaublad is gesleept (controlegeval)

Noteer per geval `files.length` en de aangeboden `types`. Uitkomst bepaalt de route:

| Uitkomst | Route |
|---|---|
| `files.length > 0` bij mail-drop | Echte drag-drop kan; server parst `.msg` (§2.3) |
| `files.length === 0` | Graph-picker (§2.2) als hoofdroute |

### 2.2 Aanbevolen hoofdroute: "Importeer uit Outlook" (Graph-picker)

Op een leeg project een knop **Importeer uit Outlook**. Die opent een modal met
de laatste ~20 mails uit de eigen mailbox (onderwerp, afzender, datum, aantal
bijlagen), met zoekveld. Eén klik = importeren.

Waarom dit de voorkeur heeft boven slepen:

- Werkt gegarandeerd — geen afhankelijkheid van clipboard-formaten van Windows.
- **Geen `.msg`-parser nodig.** Graph levert body en bijlagen als JSON/base64.
- Het is exact de datavorm die fase 2 ook oplevert → één pipeline, geen tweede.
- MSAL staat er al; alleen de scope `Mail.Read` erbij (delegated, geen
  admin-consent nodig).

Kosten: de gebruiker moet één keer per sessie het MSAL-popup doorlopen — dat
gebeurt nu al bij het versturen van een offerte.

### 2.3 Terugvalroutes

1. **`.msg` / `.eml` droppen.** Gebruiker sleept de mail eerst naar het
   bureaublad (Windows schrijft dan een echt `.msg`) en dat bestand de app in.
   Werkt altijd, kost één extra handeling. Server-side parsen:
   - `.eml` → `mailparser` (volwassen, betrouwbaar)
   - `.msg` → `@kenjiuno/msgreader` (pure JS, geen Outlook nodig).
     *Pakketnaam met redelijke maar niet volledige zekerheid — verifiëren
     voordat we hierop leunen.*
2. **Alleen bijlagen + plaktekst.** Dropzone voor PDF/STEP/Excel plus een
   textarea waar de mailtekst in geplakt wordt. Lelijk maar werkt overal en is
   de handmatige nooduitgang als Graph plat ligt. Bouw deze hoe dan ook.

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

**Fase 1a — ingest + review (grootste deel van de waarde)**
`MailImport`-model → Graph-picker modal → normalisatie → relatie-suggestie →
reviewscherm met handmatige regelinvoer → project + offerte aanmaken.
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

- [ ] Uitkomst van de drag-drop test (§2.1) — bepaalt of `.msg`-parsing nodig is.
- [ ] Eigen postbus (`offertes@…`) of de persoonlijke mailbox van één gebruiker?
- [ ] App-only + admin-consent, of delegated met bewaarde token? (§5.2)
- [ ] Mag mailinhoud het netwerk verlaten voor AI-extractie? (§6)
- [ ] Wat te doen met gescande PDF's zonder tekstlaag — OCR erbij of accepteren
      dat die handmatig gaan?
- [ ] Automatisch nieuwe artikelen aanmaken bij niet-gematchte regels, of altijd
      handmatig?
- [ ] Bewaartermijn van `bodyHtml` en bijlagen van genegeerde imports (AVG).
