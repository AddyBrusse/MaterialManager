# Testomgeving voor de managers

Een tweede ShopCommand op de werk-pc, met een **kopie** van de echte gegevens in
een eigen database. Wat de managers daar doen, raakt de echte app niet: andere
map, andere database, andere poort. Weggooien kan altijd, de echte database
blijft staan.

| | Echte app | Test-app |
|---|---|---|
| Map | `C:\ClaudeProjects\ShopCommand` | `C:\ShopCommand-test` (eigen clone) |
| Adres | `http://<pc>:5173` (of 5174) | `http://<pc>:3100` |
| Database | `docker-db-1`, poort 5432, `stockmanager` | `shopcommand-testdb`, poort 5433, `shopcommand_test` |
| Instellingen | `.env.development` | `.env.test` |
| Tekeningen | `apps\api\uploads` | `apps\api\uploads-test` |

## De drie sloten

Iets kan per ongeluk naar de verkeerde kant wijzen; daarom drie sloten die
elkaar niet nodig hebben.

1. **De test-app start alleen tegen een testdatabase.** `OMGEVING=test` in
   `.env.test` maakt er de test-app van. Hij vraagt de database bij het starten
   hoe hij heet, en stopt als de naam niet op `_test` eindigt. Dat geldt ook als
   er in Windows een variabele `DATABASE_URL` staat die naar de echte database
   wijst. Migraties op de test (`bijwerken`) doen dezelfde controle eerst.
2. **`npm run db:seed` weigert op echte gegevens.** Staan er relaties,
   artikelen of voorraad in de database, dan seedt hij niet, in welke map dan
   ook. Het script hier wist alleen de container met zijn eigen label; van de
   echte container leest het alleen (`docker inspect`, `pg_dump`).
3. **Alles uit de test is als test te herkennen.**
   - Een oranje balk bovenin, met het moment van de kopie.
   - `[TEST]` in de tabtitel.
   - Op elke pdf (offerte, OB, pakbon, picklist, factuur, inkooporder,
     prijsaanvraag) het watermerk **TEST — NIET GELDIG**.
   - Een mail heeft **geen geadresseerde** en `[TEST]` in het onderwerp.

   De balk komt van de database zelf. Zet iemand de echte app per ongeluk op de
   testdatabase, dan ziet hij de balk ook.

## Eenmalig opzetten (cmd)

Nodig: Docker Desktop draait (de echte database draait er al in), Node 20+.

```
git clone https://github.com/AddyBrusse/MaterialManager C:\ShopCommand-test
cd /d C:\ShopCommand-test
npm install
npm run test-omgeving:db -- start
```

`start` maakt de testcontainer en schrijft `.env.test` met een eigen, willekeurig
wachtwoord. Stond er al een `.env.test` (bijvoorbeeld uit Kladblok), dan vult
`start` die aan: je eigen waarden blijven, `OMGEVING=test` staat er altijd in.
Draait Docker Desktop niet, dan zegt het script dat en verandert het niets.
Zet daarna in `C:\ShopCommand-test\.env.test` de AI-sleutel:
`ANTHROPIC_API_KEY=sk-ant-…` (dezelfde als in de echte app mag; elke vraag in de
test kost ook geld).

```
npm run test-omgeving:db -- kopie
npm run test-omgeving:db -- uploads C:\ClaudeProjects\ShopCommand
npm run test-omgeving:bijwerken
npm run test-omgeving:start
```

Open `http://localhost:3100`. Je ziet de oranje balk; zonder balk klopt er iets
niet: stop dan en kijk in het venster wat de server meldde.

## Vanaf een andere pc

`http://<ip-van-de-werk-pc>:3100`. Het ip-adres staat bij `ipconfig` (IPv4). De
werk-pc moet poort 3100 doorlaten. Eén keer, in een cmd **als administrator**:

```
netsh advfirewall firewall add rule name="ShopCommand test 3100" dir=in action=allow protocol=TCP localport=3100
```

Elk adres heeft zijn eigen browsergeheugen, dus op `:3100` kies je opnieuw wie je
bent; de keuze in de echte app blijft staan.

## Altijd aan (automatisch starten)

Zo staat de test klaar voor de andere pc's zonder dat iemand iets hoeft te
starten. Eén keer instellen op de werk-pc:

1. **Docker Desktop bij het aanmelden starten:** Docker Desktop → Settings →
   General → "Start Docker Desktop when you sign in to your computer" aan. De
   testdatabase start daarna vanzelf mee (de container staat op "unless-stopped").
2. **De test-app bij het aanmelden starten:** zet een snelkoppeling naar
   `start-test.cmd` in de map Opstarten, geminimaliseerd. In **PowerShell**
   (prompt begint met `PS`):
   ```
   $s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\ShopCommand test.lnk'); $s.TargetPath='C:\ShopCommand-test\tools\test-omgeving\start-test.cmd'; $s.WorkingDirectory='C:\ShopCommand-test'; $s.WindowStyle=7; $s.Save()
   ```
   In **cmd** dezelfde regel tussen `powershell -NoProfile -Command "` en `"`.
   Niet die cmd-vorm in PowerShell plakken: PowerShell vult `$s` dan al in en
   geeft "An expression was expected after '('".
   Controleren: `explorer shell:startup` toont "ShopCommand test". Weghalen =
   die snelkoppeling verwijderen.
3. **Geen slaapstand:** `powercfg /change standby-timeout-ac 0` (of Instellingen →
   Systeem → Energie → Slaapstand: Nooit). Een pc in slaapstand is voor de
   andere pc's onbereikbaar.

`start-test.cmd` wacht zelf tot Docker en de testdatabase klaar zijn: lukt het
starten niet, dan probeert hij het elke 30 seconden opnieuw. Stopt de test-app
later, dan start hij hem ook opnieuw.

**Na een herstart (Windows Update) moet iemand aanmelden.** Docker Desktop
draait alleen in een aangemelde sessie. Vergrendelen (Win+L) mag wel: dan blijft
alles draaien. Afmelden niet.

Met de hand starten kan altijd: dubbelklik `tools\test-omgeving\start-test.cmd`.
Het venster moet open blijven; sluiten = test-app uit.

## Verse echte gegevens erin

De opmerkingen van de managers ("Dit klopt niet", F8) staan in de test. Een
nieuwe kopie wist ze, dus eerst exporteren: in de test-app **ToDo →
Verbeterpunten → Exporteer voor Claude**. Het script weigert zolang er
verbeterpunten van na de kopie staan, tenzij je `--ja` meegeeft.

1. Test-app stoppen: het venster van `start-test.cmd` sluiten
2. `npm run test-omgeving:db -- kopie`
3. `npm run test-omgeving:bijwerken`
4. `start-test.cmd` weer dubbelklikken

Stoppen is nodig: de kopie verbreekt de verbinding van een draaiende test-app (het
eerste verzoek daarna geeft een foutmelding), en op Windows blokkeert een
draaiende app het bijwerken (`EPERM`).

## Nieuwe versie van de app in de test

```
cd /d C:\ShopCommand-test
git pull --ff-only
npm install
npm run test-omgeving:bijwerken
```

Test-app eerst stoppen (venster van `start-test.cmd` sluiten), daarna
`start-test.cmd` weer dubbelklikken. In deze map schrijft niemand anders, dus `git pull
--ff-only` kan geen conflict geven.

## Status en opruimen

- `npm run test-omgeving:db -- status`: draait hij, van wanneer is de kopie,
  hoeveel verbeterpunten sinds de kopie, en wijst `.env.test` naar deze
  database.
- `npm run test-omgeving:db -- weggooien`: container en gegevens weg; je typt
  `WEG` ter bevestiging. Daarna eventueel de map `C:\ShopCommand-test`
  verwijderen. De echte database wordt niet geraakt. Een nieuwe `start` maakt
  een nieuw wachtwoord: start de test-app daarna opnieuw.

## Voor de managers

- **Oranje balk = test.** Niets wat je hier doet komt in de echte app. Probeer
  gerust alles: verwijderen, versturen, in productie geven.
- **Mails gaan naar niemand.** Versturen zet een mail klaar in Outlook zonder
  geadresseerde. Wil je zien hoe hij aankomt, vul dan je eigen adres in. Stuur
  hem nooit naar een klant: de pdf zegt TEST — NIET GELDIG.
- **Klopt er iets niet, of mis je iets?** Druk op **F8** (of de knop links onder).
  Eén zin is genoeg; de pagina en een schermafbeelding gaan vanzelf mee.
- De gegevens zijn een kopie van het moment in de balk. Wat er daarna in de
  echte app gebeurde, staat hier niet in.

## Let op

- **Docker Desktop → Troubleshoot → "Clean / Purge data" of "Reset to factory
  defaults" wist álle containers en hun opslag, ook de echte database.** Nooit
  doen zonder verse backup van de echte database.
- **Wat de test niet afschermt:**
  - De **AI-sleutel** is echt: elke vraag aan de assistent en elke gesleepte
    mail kost geld, net als in de echte app.
  - **Taak in Outlook-agenda** (alleen als Microsoft 365 is ingesteld) komt in
    de echte agenda, met `[TEST]` ervoor.
  - Wie op het netwerk zit, kan `:3100` openen, net als de echte app: er is nog
    geen echte login. De test bevat een kopie van echte klantgegevens.
- Een Windows-variabele `DATABASE_URL` of `ANTHROPIC_API_KEY` gaat vóór
  `.env.test`. Voor `DATABASE_URL` vangt slot 1 dat op (de test-app start dan
  niet en zegt waarom).

## Getest (2026-11-03, cloud, Linux)

- **Sloten 1 en 2 met echte processen: 11/11.** De test-app weigert de echte
  database, ook via een omgevingsvariabele, en start niet zonder database. De
  echte app start zoals altijd. Seed weigert op echte gegevens en op de kopie.
- **Script: 28/28.** Getest: uploads, de bewaking van verbeterpunten, kopie
  over een draaiende test-app, weggooien (met en zonder `WEG`/`--ja`), een
  vreemde container met dezelfde naam. De echte database bleef ongewijzigd.
- **Browser: 88/88.**
  - Balk en `[TEST]` op alle 17 pagina's, het losse venster en de terminal.
  - Watermerk op offerte, OB, pakbon, picklist en factuur.
  - Versturen van offerte en factuur geeft een `.eml` zonder Aan en met
    `[TEST]`, en het venster "Heb je hem verstuurd?" noemt geen klantadres.
  - De echte app: geen balk, mail aan de klant, pdf zonder watermerk.
- Op Windows nog niet gedraaid: de opdrachten zijn gewone `npm`/`docker`, maar
  de eerste keer op de werk-pc is de echte proef.

Testscripts: `/mnt/project-files/testomgeving/` (`sloten-test.sh`,
`script-test.sh`, `schermen.cjs`).
