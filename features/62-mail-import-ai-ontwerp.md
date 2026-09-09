# 62 — Mail-import: het AI-leespad opnieuw opgezet

Ontwerp, nog niet gebouwd. Opgesteld 2026-09-09 na een dag waarin drie keer een
regel gerepareerd moest worden omdat een klant zijn spullen anders benoemde.

## 1. Waarom het nu blijft breken

Er zitten twee soorten kennis in het systeem, en ze zitten op de verkeerde plek.

| Kennis | Waar het nu zit | Wie het kan aanpassen |
|---|---|---|
| Wat er in de mail staat | het model | niemand hoeft iets |
| **Hoe déze klant zijn spullen benoemt** | **regex in `attachment-kind.ts`** | **alleen een programmeur, met een release** |

Die tweede rij is het probleem. Drie voorbeelden van vandaag, alle drie dezelfde
vorm:

- `\d{3,}` in `classifyAttachment` — "een onderdeel draagt altijd een nummer".
  Klopt voor Stinis, niet voor Veratio, die `Motor Housing_v2.pdf` stuurt.
- `MIN_OVERLAP = 6` in `hoortBij` — een aanname over hoe lang een tekeningnummer
  is.
- De lijst met documentnamen — elk klantsysteem verzint een eigen naam voor zijn
  inkooporder.

Elke klant die het anders doet, breekt een regel. Dat is geen bug die je
wegwerkt; het is de architectuur.

## 2. Wat deterministisch blijft, en waarom

Niet alles moet naar het model. Deze dingen horen in code, met tests:

- **Artikelmatching.** `2615-0090-0530` en `2615-0091-0530` schelen één cijfer en
  zijn verschillende onderdelen. Daar wil je een test, geen oordeel.
- **Prijsvergelijking.** Rekenen.
- **Bestanden kopiëren, paden, opslag.** Geen oordeel nodig.
- **De grondingscontrole.** Of een citaat echt in de bron staat, controleer je;
  dat vraag je niet.

Wat wél naar het model gaat, is alles waar je een oordeel over vorm nodig hebt:
is dit een tekening of een folder, hoort dit bestand bij die regel, welke kolom
is het aantal.

## 3. Het nieuwe leespad

### 3.1 Documenten native meesturen — de grootste winst

**Nu:** `pdfText()` haalt de tekst uit een pdf en die wordt als platte tekst in
een prompt-string geplakt. Alleen pdf's *zonder* tekstlaag gaan als document-blok
mee (`scansVoorModel`, maximaal drie).

Daarmee gooien we de tabelstructuur weg voordat het model iets ziet. Kolommen,
rijen en uitlijning zijn verdwenen; wat overblijft is tekstsoep. Zo ontstond
`4-9-2026pcs`: de leverdatum plakte tegen de eenheid omdat de tabel was
platgeslagen.

**Nieuw:** het handelsdocument gaat altijd als `document`-blok mee, ongeacht of
er een tekstlaag in zit. De API leest de pdf met layout — dat is precies waar een
ordertabel om vraagt.

Dit is één wijziging die een hele klasse fouten wegneemt, en het maakt de
scan-uitzondering overbodig: gescand of niet, het gaat dezelfde route.

### 3.2 Het model deelt de bijlagen in

`classifyAttachment` verdwijnt als beslisser. Het model krijgt de bestandsnamen
plus, voor tekeningen, de eerste pagina, en geeft per bijlage terug wat het is en
bij welke regel het hoort.

Waarom dat beter werkt: het echte tekeningnummer staat in het titelblok van de
tekening. Bij de Veratio-aanvraag stond er letterlijk `Drawing No 507957355` in
de pdf. Het model dat de tekening zíet, hoeft niet uit de bestandsnaam te raden —
het leest het nummer en legt de koppeling op wat er staat.

De bestaande matcher (`hoortBij`) blijft bestaan, maar als **controle** naast het
oordeel van het model, niet als beslisser. Waar ze het eens zijn: hoge zekerheid.
Waar ze verschillen: laag, en dat zie je in het controlescherm.

### 3.3 Gronding via citations in plaats van zelfgebouwd

**Nu:** elke regel draagt een `bronTekst` die het model zegt letterlijk te hebben
overgenomen, en `tekeningStaatErIn` / `gegrond` controleren dat achteraf tegen
een genormaliseerde tekstbrij.

Dat is een goede vondst, maar het leunt op de bewering van het model dát het
citeert. De API kan het beter: met `citations: {enabled: true}` op een
document-blok geeft de API zélf terug uit welk document, welke pagina en welke
tekens een bewering komt.

Dat tilt de zekerheidsscore van "het model zegt dit te hebben gelezen" naar "de
API zegt dat dit op pagina 2 staat" — en het maakt de preview in het
controlescherm klikbaar naar de juiste plek in de tekening.

> **Let op — dit moet uitgezocht worden.** Citations zijn volgens de documentatie
> níet te combineren met `output_config.format`, en dat is precies wat
> `messages.parse()` gebruikt voor het Zod-schema. Twee mogelijke uitwegen:
> het schema als *strict tool* uitdrukken in plaats van als output-format, of
> citations in de tweede lezing zetten (§3.4) en daar de vindplaatsen ophalen.
> Welke van de twee werkt, weet ik nog niet — dit is het eerste dat je uitprobeert.

### 3.4 De tweede lezing wordt een controle

**Nu:** dezelfde mail wordt twee keer identiek gelezen (`MAIL_AI_CONTROLE`) en de
uitkomsten worden vergeleken. Verschillen ze, dan zakt de zekerheid.

Dat werkt, maar twee identieke lezingen vinden vooral dezelfde fouten. Een
tweede lezing met een ándere opdracht vindt andere: geef het model de bron plus
het uitgelezen resultaat en vraag waar het misgaat.

Welke van de twee hier beter werkt, is een meetbare vraag — zie §5. Ik zou beide
houden en laten meten in plaats van er nu over te beslissen.

## 4. Wat het systeem per klant onthoudt

Dit is het deel dat het "dynamisch" maakt: klantkennis wordt data, geen code.

**Een klantprofiel per relatie.** Vrije tekst, door jou aanpasbaar in het scherm,
die meegaat in de prompt bij elke mail van die klant:

> *Veratio noemt tekeningen bij naam, niet bij nummer. Nummerformaat in de
> ordertekst is `<artikelnr>_<tekeningnr>_<rev>_`; een streepje op de derde plek
> betekent geen revisie. Stuurt tekeningen altijd in een zip. "Toegeleverd
> materiaal" betekent dat zij het materiaal aanleveren.*

Geen release nodig om dat te veranderen. Wat vandaag een regex-wijziging was, is
dan een zin die jij typt.

**Voorbeelden uit je eigen correcties.** Dit bestaat al half: `ArticleAlias`
onthoudt welk klantartikelnummer bij welk van onze artikelen hoort, gevuld
doordat iemand in het controlescherm corrigeert. Datzelfde principe uitbreiden
naar de extractie: elke correctie wordt een voorbeeld, en de laatste stuk of tien
gaan als voorbeelden mee in de prompt voor die klant.

Na drie mails van een nieuwe klant weet het systeem hoe ze werken, zonder dat er
iemand aan te pas is gekomen.

**Kosten:** het profiel en de voorbeelden zijn een stabiel voorvoegsel, dus
prompt caching maakt ze vrijwel gratis (ongeveer een tiende van de normale
invoerprijs bij hergebruik).

## 5. Meten — dit is geen luxe, dit is de voorwaarde

Zolang kennis in code zit, vangt een unittest een regressie. Zodra kennis in
prompts en klantprofielen zit, is dat weg: een promptwijziging die klant A beter
maakt kan klant B stilletjes slopen, en dat merk je pas als er verkeerd
geoffreerd is.

Daarom eerst een **testset van echte mails met het goede antwoord erbij**. Er
liggen er al drie:

| Mail | Waarom hij erin hoort |
|---|---|
| Stinis, offerteaanvraag RFQ2600241 | inkooporder als scan, tekeningnummer in de bestandsnaam |
| Veratio, offerteaanvraag 2663270 | geen handelsdocument, regels in de mailtekst, zeven tekeningen in een zip |
| Veratio, bestelling 2690655 | inkooporder mét zip, tekeningen genoemd bij naam in plaats van nummer |

Elke mail die misgaat komt erbij. Gescoord per veld: aantal regels, qty,
tekeningnummer, welke bestanden aan welke regel. Dan wordt "helpt deze
wijziging?" een meting in plaats van een gok — en dat is wat prompt-werk
überhaupt beheersbaar maakt.

## 6. Wat het kost

Bij dit volume is nauwkeurigheid alles en zijn tokens bijzaak. Ruwe schatting per
mail, met `claude-opus-5` op hoge denkdiepte:

| Onderdeel | Tokens | Kosten |
|---|---|---|
| Handelsdocument als document-blok (2 pagina's) | ~5.000 | ~€0,02 |
| Mailtekst | ~500 | — |
| Eerste pagina van 7 tekeningen | ~14.000 | ~€0,06 |
| Systeemprompt + klantprofiel + voorbeelden (gecached) | ~3.000 | ~€0,00 |
| Antwoord | ~2.000 | ~€0,05 |
| **Twee lezingen samen** | | **~€0,20 – €0,30** |

Bij tien mails per dag is dat rond de €60 per maand. Afgezet tegen wat het aan
overtypen scheelt is dat niets, maar het is wel een bewuste keuze: de tekeningen
meesturen is het duurste onderdeel, en dat is precies het onderdeel dat de
koppeling betrouwbaar maakt.

## 7. Bouwvolgorde

Elke stap is los te bouwen en levert op zichzelf iets op.

- [ ] **A. Testset.** De drie mails met hun goede antwoord, plus een script dat
      scoort. Dit eerst, anders is de rest niet te beoordelen.
- [ ] **B. Handelsdocument native meesturen.** Kleinste wijziging, grootste
      directe winst. Meet met A wat het doet.
- [ ] **C. Bijlage-indeling naar het model**, met `hoortBij` als controle
      ernaast. Dit haalt de klasse bugs van vandaag structureel weg.
- [ ] **D. Klantprofiel als bewerkbaar veld** bij de relatie.
- [ ] **E. Correcties als voorbeelden** voor die klant.
- [ ] **F. Citations** voor de gronding, zodra §3.3 is uitgezocht.
- [ ] **G. Tweede lezing als controle**, en met A meten welke variant wint.

## 8. Wat ik niet zou doen

- **Fine-tunen.** In de Claude API zoals die nu is bestaat geen fine-tuning. En
  zelfs als het kon: het vraagt honderden voorbeelden, levert een bevroren model
  op, en het probleem is juist dat een klant volgende maand iets nieuws doet.
- **Er een agent van maken.** Dit is een extractietaak, geen open onderzoek. Een
  goed opgebouwde aanroep (of twee) doet het beter, goedkoper en voorspelbaarder
  dan een lus die zelf mag beslissen wat hij doet.
- **RAG.** Er is geen corpus om uit te zoeken; de mail zelf is de invoer.
- **Artikelmatching naar het model.** Zie §2.

## 9. Open punten

- Kunnen citations samen met een strict tool als uitvoervorm? Zo niet, dan wordt
  het een aparte tweede aanroep. **Dit moet als eerste uitgezocht worden**, want
  het bepaalt de vorm van §3.3.
- Hoeveel van een tekening moet het model zien om de koppeling te leggen — alleen
  de eerste pagina, of het titelblok uitgesneden? Het titelblok zou goedkoper zijn
  maar vraagt uitsnijden op een vaste plek, en die plek verschilt per klant.
- Twee identieke lezingen of één lezing plus een controlelezing: meten, niet
  beredeneren.
- Wat gebeurt er met een mail van een klant zonder profiel? Terugvallen op de
  algemene prompt is het antwoord, maar dat is dan wel het pad dat het minst
  getest wordt.
