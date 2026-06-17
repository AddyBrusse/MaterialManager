# 44 — Mobile Scan Flow

> **Status: not yet built.** Depends on the mobile views in
> `frontend/14-mobile-view.md`, which are currently a stub. This describes
> the target flow once mobile is implemented.

## Entry

Mobile home → **Scannen** tile.

## Steps

1. Scan view opens
2. Camera preview area (scanning library integration — TBD when building; candidates: `zxing-browser`, `html5-qrcode`)
3. Manual input field visible as fallback ("Of typ het nummer in")
4. User aligns code in viewfinder → scan succeeds → code captured
5. Frontend lookup: `GET /api/raw-materials?code=...` (or finished if `ART-` prefix)
6. Found → navigate to `/item/:id`
7. Not found → toast "Code niet gevonden"

## Item detail (mobile)

- Toggle at top: **Samenvatting** | **Detail**
- Action button at bottom: **Voorraad aanpassen**
- If item locked by another user → banner shown, adjust button still enabled (movements don't require lock)

## Camera permissions

- Browser will prompt for camera on first scan
- If denied → manual input remains usable, show hint "Sta camera-toegang toe voor scannen"

## Offline

If network drops:
- Lookup fails → show error "Geen verbinding"
- No queueing — user retries when back online (per project decision)

## Notes

- Code format detection: prefix `#` → raw, `ART-` → finished
- Code formats parked beyond `#NNNNN` and `ART-NNNN` until further notice
