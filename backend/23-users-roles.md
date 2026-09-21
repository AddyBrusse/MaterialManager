# 23 — Users & Roles

## Geen wachtwoorden

Alleen identificatie. Elk verzoek draagt `x-user-id`; de middleware laadt de
gebruiker uit de database, ontbrekend of onbekend → 401.

Dat kan omdat de app alleen op het LAN draait, de gebruikers bekend zijn en er
geen betaalgegevens in staan. Komt de app ooit buiten het LAN, dan moet dit
vervangen worden door wachtwoorden of SSO.

## Drie rollen

| Rol | Mag |
|---|---|
| `admin` | Alles: instellingen (gebruikers, locaties, kwaliteiten, profielen, machines, bedrijfskosten, nummering), sloten forceren, items verwijderen |
| `user` | Alles lezen, voorraad bijstellen, items bewerken waarvan hij het slot heeft, materiaal ontvangen |
| `terminal` | Alleen het kioskscherm — zie hieronder |

## De rol `terminal`

`terminal` is het account van een **machinescherm**, geen persoon. De app
toont kostprijzen, marges en klantgegevens; een pc in de hal waar iedereen
langsloopt hoort daar niet bij te kunnen. Een herkenbare naam is geen slot,
een rol wel, want die valt serverside af te dwingen.

`middleware/terminal-scope.ts` is een **toelatenlijst**: alles is dicht behalve
wat er expliciet in staat. Een nieuwe route is daardoor standaard onbereikbaar
voor de werkvloer-pc; een vergeten regel levert hooguit een kapot kioskscherm
op, niet een prijslijst in de hal. Toegestaan zijn nu:

- `/tijdregistratie` — lezen én schrijven; de klok is waar de terminal voor
  bestaat
- `/users` — alleen lezen, zodat de operator zichzelf kan kiezen bij bemand
  werk
- `/projects/:id/orders/:orderId/stap/:stapId/check` — schrijven; gereedmelden
  hoort aan de machine thuis. Deze regel staat vóór de brede `/projects`-regel,
  want de eerste die past wint
- `/projects`, `/machines`, `/articles/:id`, `/documenten`, `/reservations` —
  alleen lezen: wachtrij, tekening, instelblad, welke staaf erbij hoort

In de frontend krijgt dit account geen router: `App.tsx` rendert direct
`<TerminalPage />`, zonder zijbalk en zonder weg terug.

De wachtrij van een terminal hangt aan **`User.machineId`**, niet aan de
accountnaam — die zou anders exact gelijk moeten zijn aan wat er op de
productiestap staat, en dan blijft het scherm leeg terwijl er werk ligt. De
koppeling komt van de server (`bepaalMachineId`), niet uit de `persist`-store,
zodat koppelen op kantoor binnen tien seconden in de hal aankomt.

## Middleware

- `userContext` — laadt `req.user` uit `x-user-id`. Verplicht op alle
  `/api/*`-routes behalve `/api/health` en `/api/pdf`, die ervóór gemount zijn.
- `terminalScope` — draait daarna, alleen actief voor de rol `terminal`.
- `requireAdmin` — 403 als `req.user.role !== 'admin'`, op de beheerroutes.

## Frontend

- Bij de eerste keer laden: `GET /api/users` voor de dropdown.
- Na de keuze staat `{ id, name, role }` in `useUserStore` (localStorage).
- De API-client zet `x-user-id` op elk verzoek.
- De rol stuurt zichtbaarheid: `Instellingen` verdwijnt voor niet-beheerders,
  knoppen verbergen zich per actie. De server dwingt het af; de frontend
  verbergt alleen.
