# 03 — Parked Items

Open decisions to revisit. Do not block initial build on these.

## Altec ATP300 label printer
- Driver / integration approach (Windows print dialog vs backend service)
- Whether to talk directly to the printer (network/USB) or rely on system print
- Label dimensions and physical media

## Label layout
- Exact template (size + grade only, layout TBD)
- Font, sizing on the physical label
- Whether to support multiple templates later

## Machineterminal & tijdregistratie
- Pc met touchscreen per machine (was: tablet) — wachtrij, tekening, NC naar de
  machinemap op de NAS, tijdregistratie, "stap gereed"
- Tijdregistratie spiegelt de calculatie: instellen vs. draaien, bemand vs.
  onbemand (persoon óf robot), aantal stuks — anders valt geschat niet tegen
  werkelijk te leggen
- Volledig plan in `features/50-operator-terminal.md` (herschreven 2026-09-08)
- Fase 0 daaruit (`TimeEntry` + start/stop in de bestaande app) kan los, en is de
  voorwaarde voor elke vorm van kostenschatting op basis van eerder werk
- Nog niet beginnen; open besluiten staan in §9 van dat document

## Backup strategy
- Postgres dump schedule (nightly?)
- Uploads folder snapshot (rsync to NAS share?)
- Use QNAP HBS 3 vs in-app cron job
- Retention policy
