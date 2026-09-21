# 21 — API Design

Alle routes onder `/api`. JSON in en uit.

## Gebruikerscontext

De frontend stuurt `x-user-id: <uuid>` mee op elk verzoek. `user-context`
laadt de gebruiker en hangt hem aan `req.user`. Geen gebruiker → 401.

Daarna draait `terminal-scope`: voor de rol `terminal` is alles dicht behalve
wat expliciet op de **toelatenlijst** staat. Een nieuwe route is dus standaard
onbereikbaar voor een machinescherm — dat is opzet, zie
`apps/api/src/middleware/terminal-scope.ts`.

`/api/health` en `/api/pdf` staan vóór de gebruikerscontext en vragen geen
gebruiker.

## Endpoints

### Gebruikers
- `GET /api/users` — lijst (voor de dropdown)
- `POST` / `PATCH /:id` / `DELETE /:id` — beheerder

### Grondstoffen, eindproducten, mutaties
- `GET|POST /api/raw-materials`, `GET|PATCH|DELETE /api/raw-materials/:id`
- `GET|POST /api/finished-goods`, `GET|PATCH|DELETE /api/finished-goods/:id`
- `GET /api/movements` (met `?itemId=`), `POST /api/movements`
- `GET /api/low-stock`, `GET /api/search?q=…`

### Stamgegevens
- `/api/locations`, `/api/grades`, `/api/profiles`, `/api/surface-finishes`,
  `/api/machines` — steeds `GET` lijst, `POST` nieuw, `PATCH /:id`,
  `DELETE /:id`; schrijven is beheerder
- `/api/relaties` — idem, plus `GET /:id`
- `/api/articles` — idem, plus een subroute voor bijlagen
- `GET|PUT /api/settings/company` — bedrijfsgegevens

### Projecten
De grootste router. Naast `GET /`, `GET /:id`, `POST /`, `PATCH /:id`,
`DELETE /:id`:

| Pad | Wat |
|---|---|
| `POST /:id/status/stop` · `/status/hervat` | on hold zetten en hervatten |
| `POST /:id/offertes` | nieuwe offerteversie |
| `POST|PATCH|DELETE /:id/offertes/:offId/regels[/:regelId]` | offerteregels |
| `POST /:id/offertes/:offId/verzend` · `/accepteer` | versturen, accepteren (schrijft de prijssnapshot) |
| `POST /:id/opdrachtbevestiging` · `/opdrachtbevestiging/verzend` | OB aanmaken en versturen |
| `POST /:id/orders/:orderId/stap/:stapId/check` · `/uncheck` | stap gereedmelden en terugdraaien |
| `PATCH /:id/orders/:orderId/stap/:stapId/plan` · `/hold` | planning en `notBefore` |
| `POST /:id/orders/:orderId/gereed` | hele order gereed |
| `POST /:id/paklijst` · `/paklijst/verzend` | paklijst |
| `POST /:id/factuur` · `/factuur/verzend` | factuur |
| `POST /:id/revert/{bevestigd,productie,paklijst,verzonden,gefactureerd}` | één fase terugdraaien |

### Productie en uren
- `/api/tijdregistratie` — `GET /lopend`, `GET /dag`, `GET /stap/:stapId`,
  `GET /order/:orderId`, `POST /start`, `POST /:id/{pauze,hervat,wissel,stop,corrigeer}`,
  `DELETE /:id`
- `/api/nacalculatie` — `GET /project/:id`, `/order/:id`, `/artikel/:id`,
  `/artikelen`, plus `POST /artikel/:id/norm` ("norm bijstellen")

### Zaagpijplijn
`/api/reservations` — lijst/aanmaken/verwijderen, `PATCH /:id/priority`,
`POST /plan`, `PATCH /:id/status`, `POST /:id/afboeken`, `POST /:id/annuleer`,
`GET /beschikbaarheid/:barId`, en het materiaalvoorstel
(`POST /materiaal-plan`, `POST /materiaal-plan/bevestig`).

### Overig
- `/api/todos` — lijst, aanmaken, `PATCH /:id`, `/:id/claim`, `/:id/complete`,
  `/:id/calendar-event`
- `/api/documenten` — alle documenten over projecten heen
- `/api/mail-imports` — het mail-importpad, zie `features/60-mail-import.md`
- `/api/preferences` — schermvoorkeuren per gebruiker (`GET`/`PUT`/`DELETE`)
- `/api/sequences` — een documentnummer uitgeven
- `/api/labels`, `/api/locks`, `/api/uploads`, `/api/pdf`

Voor de sloten: zie `backend/24-locking.md`. Voor uploads:
`backend/25-file-storage.md`.

## Foutvorm

```json
{ "error": { "code": "LOCK_HELD", "message": "Item wordt bewerkt door <naam>", "details": { "userId": "..." } } }
```

Veelgebruikte codes: `VALIDATION`, `NOT_FOUND`, `FORBIDDEN`, `LOCK_HELD`,
`LOCK_NOT_HELD`, `LABEL_TAKEN`.

## Nog geen route

- **`/api/overhead`** — bedrijfskosten staan nog alleen in localStorage
  (`apps/web/src/api/overhead.ts`). Die waarden werken wél door in elke
  kostprijs, dus ze verschillen per browser. Dit is het laatste restje van de
  mockfase.
- **`/api/estimate`** — met opzet geen route: de kostprijs wordt synchroon in
  de browser berekend met `buildEstimateCtx` + `computeEstimateTotals` uit
  `@stockmanager/shared`. De API gebruikt diezelfde kern voor de
  prijssnapshot.
