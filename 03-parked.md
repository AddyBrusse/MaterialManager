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

## Backup strategy
- Postgres dump schedule (nightly?)
- Uploads folder snapshot (rsync to NAS share?)
- Use QNAP HBS 3 vs in-app cron job
- Retention policy
