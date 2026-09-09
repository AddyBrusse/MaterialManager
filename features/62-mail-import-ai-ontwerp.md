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

**Om verduidelijking: er worden geen screenshots gemaakt.** De pdf-bytes gaan als
`document`-blok mee; het omzetten naar pagina's gebeurt aan de kant van de API.
Wij renderen niets en slaan niets extra's op. (`renderArtikelPreview` met pdfjs
is iets anders: dat maakt de duimnagels in het controlescherm en blijft zoals het
is.)

### 3.1b Niet alles altijd — escaleren in trappen

Alles meesturen is duur en traag. Daarom in trappen, van goedkoop naar duur:

1. **Altijd native:** het handelsdocument. Eén of twee pagina's, en juist dát is
   het document met de ordertabel waar de fouten in zitten.
2. **Tekeningen eerst alleen op naam.** De deterministische matcher doet zijn
   werk. Bij de Stinis-aanvraag en de Veratio-bestelling was dat genoeg — daar
   hoeft geen enkele tekening naar het model.
3. **Alleen als een regel géén bestand krijgt:** de eerste pagina van de
   onbekende tekeningen alsnog meesturen, zodat het model het titelblok kan
   lezen en de koppeling op het echte tekeningnummer kan leggen.

Zo betaalt de gewone mail de goedkope route en alleen de lastige mail de volle
prijs. Ruwe inschatting: van ~€0,25 per mail naar ~€0,05 voor het overgrote deel.

### 3.2 Het titelblok lezen, niet de bestandsnaam raden

Het echte tekeningnummer staat in het **titelblok van de tekening**. Bij de
Veratio-aanvraag stond er letterlijk `Drawing No 507957355` in de pdf, terwijl wij
zaten te raden uit `206413050_507957355_A_Bewerken.pdf`.

Dit is ook wat de markt doet: [CNCQuote](https://cncquote.io/) leest het titelblok
voor materiaal en nummers rechtstreeks van de pdf, en er zijn losse API's die
alléén dit doen ([Werk24](https://docs.werk24.io/features/title_block.html),
[Apryse](https://apryse.com/blog/automate-cad-title-block-extraction)).

Met het echte nummer in handen wordt de koppeling een opzoeking in onze eigen
artikeldatabase (§4.1) in plaats van een oordeel over een bestandsnaam. Daarmee
kunnen weg: `classifyAttachment`, `hoortBij` in drie trappen, `komtVanTekening` en
`schoonOmschrijving` — ruwweg de helft van de 1674 regels die dit nu kost.

Let op: een **STEP-bestand heeft geen titelblok**; dat is pure geometrie. In de
praktijk komen ze in paren (`Motor Housing_v2.pdf` naast `Motor Housing.step`),
dus de pdf levert het nummer en de step hangt eraan op naam.

De bestandsnaam blijft meedoen als extra signaal — [Paperless Parts wijst
bestanden toe "based on filenames *and* AI suggestions"](https://www.paperlessparts.com/press/paperless-parts-cuts-quote-setup-time-by-90-with-new-ai-supported-workflow/),
dus niet het één óf het ander. Maar hij is niet langer de bron van waarheid.

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

Dit deel is herschreven op 2026-09-09 na het bekijken van Basecone, dat precies
dit probleem oplost voor facturen. Hun aanpak is eenvoudiger dan wat hier eerst
stond, en wij hebben de kern er al van.

### 4.1 De omkering

Basecone vergelijkt de factuurgegevens met de **stamgegevens uit het
boekhoudsysteem**: *"zodra er voldoende overeenkomsten zijn (dit zou zelfs één
uniek element kunnen zijn), maakt Basecone de match en selecteert de
leverancier"*.

Ze proberen het document dus niet in het abstracte te begrijpen. Ze zoeken welke
van hun **bekende** entiteiten dit is.

Toegepast op ons: wij vragen bij een tekening *"is dit een tekening en bij welke
regel hoort hij"* — en daar hebben we regels voor geschreven die blijven breken.
De betere vraag is *"welk van onze bekende artikelen is dit"*. Staat er
`507957355` in het titelblok, dan is dat een opzoeking in onze eigen
artikeldatabase, geen oordeel over een bestandsnaam.

Dat wordt bovendien vanzelf beter naarmate er meer artikelen zijn — het
tegenovergestelde van regels, die met elke nieuwe klant brozer worden.

### 4.2 Het leren bestaat al

`ArticleAlias` is precies de Basecone-lus, en hij staat er al. Corrigeer je in
het controlescherm een regel naar een ander artikel, dan wordt
`(relatie, tekening) → artikel` bewaard; dezelfde klant met hetzelfde nummer
staat de volgende keer meteen goed. Geen model dat traint, geen gewichten — een
opzoektabel die jouw correctie onthoudt.

Wat eraan moet gebeuren is klein: de tabel leert nu alleen van `line.tekening`.
Laat hem ook leren van het tekeningnummer uit het titelblok en van de
bestandsnaam. Zelfde tabel, meer sleutels die naar hetzelfde artikel wijzen.

### 4.3 Twee soorten fouten, en maar één is zo leerbaar

| Soort | Voorbeeld | Leerbaar als tabel? |
|---|---|---|
| **Koppelfout** | dit nummer hoort bij dat artikel | **ja** |
| **Leesfout** | aantal 2026 in plaats van 2 | nee |

Koppelfouten zijn het grootste deel van het werk én perfect leerbaar. Leesfouten
los je niet op met geheugen maar met beter lezen — dat is wat §3.1 (native pdf)
en het titelblok doen.

### 4.4 Zelf regels toevoegen, in volgorde van veiligheid

| | Wat | Risico |
|---|---|---|
| 1 | Correcties in het controlescherm (automatisch) | geen — bestaat al |
| 2 | Een koppeling zelf intypen: klantnummer → artikel | laag |
| 3 | Een goede mail aanwijzen als voorbeeld voor die klant | laag |
| 4 | Vrije leesinstructie per klant ("het aantal staat in kolom Hoev.") | hoger |

De eerste drie zijn data. Alleen de vierde verandert hóe het model leest, en dat
is het enige waar een testset echt voor nodig is voordat je hem aanzet. Een
voorbeeld aanwijzen (3) werkt in de praktijk beter dan een geschreven regel (4):
je hoeft niet te formuleren wat je bedoelt, en het is echte data in plaats van een
bewering over data.

### 4.5 Het deksel dat open moet kunnen

Op de relatiepagina: **wat heeft het systeem van deze klant geleerd?** Een lijst
met een prullenbak per regel, en zichtbaar of een regel uit een correctie kwam of
met de hand is ingetypt (`createdBy` en `createdAt` staan er al).

Dit is geen bijzaak. Zonder dat scherm onthoudt het systeem stilletjes dingen die
je niet kunt zien; leert het per ongeluk een verkeerde koppeling, dan zit die er
voor altijd in, matcht elke volgende mail fout mét hoge zekerheid, en snap je niet
waarom. Dát is hoe zo'n systeem ondoorgrondelijk wordt — niet door de techniek,
maar door het ontbreken van een deksel dat opengaat.

Basecone doet hetzelfde: hun boekingsregels per leverancier zijn zichtbaar en
aanpasbaar.

## 5. Meten — dit is geen luxe, dit is de voorwaarde

Zolang kennis in code zit, vangt een unittest een regressie. Zodra kennis in
prompts en klantprofielen zit, is dat weg: een promptwijziging die klant A beter
maakt kan klant B stilletjes slopen, en dat merk je pas als er verkeerd
geoffreerd is.

Daarom eerst een **testset van echte mails met het goede antwoord erbij**. Er
liggen er drie klaar; twee staan er sinds 2026-09-09 in:

| Mail | Waarom hij erin hoort |
|---|---|
| Stinis, offerteaanvraag RFQ2600241 | inkooporder als scan, tekeningnummer in de bestandsnaam — **nog toe te voegen** |
| Veratio, offerteaanvraag 2663270 | geen handelsdocument, regels in de mailtekst, zeven tekeningen in een zip |
| Veratio, bestelling 2690655 | inkooporder mét zip, tekeningen genoemd bij naam in plaats van nummer |

Elke mail die misgaat komt erbij. Gescoord per veld: aantal regels, qty,
tekeningnummer, welke bestanden aan welke regel. Dan wordt "helpt deze
wijziging?" een meting in plaats van een gok — en dat is wat prompt-werk
überhaupt beheersbaar maakt.

### 5.1 Hoe de set eruitziet

Eén map per mail, met de mail zelf en het goede antwoord ernaast:

```
apps/api/src/services/__tests__/mails/
  stinis-rfq2600241/
    mail.msg
    verwacht.json
  veratio-2663270-offerteaanvraag/
    mail.msg
    verwacht.json
  veratio-2690655-bestelling/
    mail.msg
    verwacht.json
```

Draaien met `npm run score:mails -w apps/api` (of met een stuk van een mapnaam
erachter voor één mail). Het roept het echte model aan, dus er moet een
`ANTHROPIC_API_KEY` staan en het kost geld — daarom is het een script en geen
vitest-test.

De twee Veratio-mails zijn van **verschillende mensen** bij dezelfde klant:
Damiano Blonk schrijft zijn regels in de mailtekst, Jeroen van der Hoorn stuurt
een inkooporder als pdf. Dat is geen toeval maar precies waarom de set zo moet:
klantkennis die aan één opmaak vastzit breekt op de collega.

`verwacht.json` bevat **alleen de velden waar je iets van vindt**:

```json
{
  "regels": [
    {
      "tekening": "206413050_507957355_A_",
      "qty": 2,
      "materiaalDoorKlant": true,
      "bestanden": [
        "206413050_507957355_A_Bewerken.pdf",
        "206413050_507957355_A_.stp"
      ]
    }
  ]
}
```

Dat is geen slordigheid maar de belangrijkste eigenschap van de set: **de scorer
vergelijkt alleen wat er in het bestand staat.** Komt er later een veld bij —
zoals `certificaat` vandaag — dan blijven alle bestaande fixtures geldig; je vult
het nieuwe veld alleen in bij de mails waar het speelt. Zonder die eigenschap
moet je bij elke schemawijziging alle testdata bijwerken, en dan verrot de set
binnen een maand.

### 5.2 Waar de mails staan

**In de repo**, naast de tests (besloten 2026-09-09). Daarmee draait de set
automatisch mee bij elke wijziging en kan hij niet stilletjes achterlopen.

De prijs daarvan is bewust aanvaard: deze mails bevatten klantprijzen,
contactgegevens en tekeningen van Veratio en Stinis, en die staan daarmee voorgoed
in de git-geschiedenis en in elke kloon. De repo is privé en het team is vier man.
Het alternatief — de set op de NAS, buiten git — betekent dat CI hem niet kan
draaien, en een testset die alleen handmatig start is een testset die doodbloedt.

### 5.3 Aanpassen, later

| Wat verandert | Hoe | Release nodig? |
|---|---|---|
| Deze klant doet iets anders | klantprofiel typen (§4) | nee |
| Algemene leesregel | prompt in code, gemeten tegen de set | ja |
| Nieuwe vorm ontdekt | mail toevoegen aan de set | nee |
| Nieuw veld in het schema | veld invullen bij de mails waar het speelt | ja, voor het veld zelf |

## 6. Wat het kost aan tijd

Dit is gemeten, niet geschat — `ingest_runs` legt elke inleesbeurt vast:

| Situatie | Gemeten duur |
|---|---|
| Kleine mail, alles als tekst | ~44 s |
| Grote gescande order, pagina's als afbeelding naar het model | ~92 s |

Ruwweg een **verdubbeling** dus, en dat is geen aanname: scans gaan nu al als
afbeelding mee, dus het verschil tussen die twee regels ís wat deze wijziging
breed zou maken. De escalatie uit §3.1b houdt de gewone mail aan de snelle kant.

De voortgangsbalk corrigeert zichzelf — die voorspelt uit de eigen historie, dus
na een paar mails klopt de verwachte tijd weer.

## 7. Wat het kost aan geld

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

## 8. Bouwvolgorde

Elke stap is los te bouwen en levert op zichzelf iets op.

- [x] **A. Testset.** (2026-09-09) `apps/api/src/services/__tests__/mails/` met
      de twee Veratio-mails en hun `verwacht.json`, `npm run score:mails -w apps/api`
      als scorer, en `mail-score.ts` met eigen unittests — een scorer die zelf
      niet klopt zou een verslechtering als winst kunnen melden. De Stinis-mail
      moet nog opnieuw aangeleverd worden; die map ontbreekt.
- [x] **B. Handelsdocument native meesturen** (§3.1, plus trap 1 en 2 van §3.1b).
      (2026-09-09) `scansVoorModel` heet nu `documentenVoorModel` en stuurt het
      leidende document altijd als volledige pdf mee, ook mét tekstlaag; de
      uitgeklopte tekst van diezelfde pdf gaat er dan juist uit, zodat het model
      niet de kapotte versie leest. Tekeningen gaan niet meer mee zolang er een
      document is. Nog niet gemeten met A — daar is een API-sleutel voor nodig.
- [ ] **C. Titelblok lezen** (§3.2) en het nummer opzoeken in onze artikelen
      (§4.1). Dit haalt de klasse bugs van vandaag structureel weg.
- [ ] **D. Opruimen.** `classifyAttachment`, `hoortBij` in drie trappen,
      `komtVanTekening`, `schoonOmschrijving` — weg, zodra C ze overbodig maakt.
      Meten met A dat er niets stukgaat.
- [ ] **E. Escalatie** (§3.1b): tekeningen alleen volledig meesturen als een
      regel er anders geen krijgt. Houdt de gewone mail snel en goedkoop.
- [ ] **F. Het geleerde zichtbaar maken** (§4.5) op de relatiepagina, met een
      prullenbak per regel. Klein, en het verschil tussen vertrouwen en niet.
- [ ] **G. Zelf een koppeling kunnen intypen** (§4.4 stap 2).
- [ ] **H. Een goede mail als voorbeeld aanwijzen** (§4.4 stap 3).
- [ ] **I. Citations** voor de gronding, zodra §3.3 is uitgezocht.
- [ ] **J. Vrije leesinstructie per klant** (§4.4 stap 4) — als laatste, en
      alleen als A t/m H de gaten niet dichten.

## 9. Wat ik niet zou doen

- **Fine-tunen.** In de Claude API zoals die nu is bestaat geen fine-tuning. En
  zelfs als het kon: het vraagt honderden voorbeelden, levert een bevroren model
  op, en het probleem is juist dat een klant volgende maand iets nieuws doet.
- **Er een agent van maken.** Dit is een extractietaak, geen open onderzoek. Een
  goed opgebouwde aanroep (of twee) doet het beter, goedkoper en voorspelbaarder
  dan een lus die zelf mag beslissen wat hij doet.
- **RAG.** Er is geen corpus om uit te zoeken; de mail zelf is de invoer.
- **Artikelmatching naar het model.** Zie §2.

## 10. Open punten

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
