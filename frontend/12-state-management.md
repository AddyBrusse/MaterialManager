# 12 — State Management

## Serverstate — TanStack Query

Alle data loopt via TanStack Query, met getypeerde wrappers in
`apps/web/src/api/` — één module per resource. Op één uitzondering na
(hieronder) praten die allemaal met de echte API via `apiFetch` uit
`api/client.ts`.

Querysleutels die daadwerkelijk in gebruik zijn:

```
['raw-materials']            ['projects']                ['todos']
['finished-goods']           ['projects', id]            ['documenten']
['grades']                   ['projects', 'terminal']    ['company']
['profiles']                 ['reservations']            ['users']
['locations']                ['reservations', 'terminal']
['surface-finishes']         ['movements']  ['movements', itemId]
['machines']                 ['lock', 'project', id]
['articles']  ['article', id]
['relaties']  ['relaties', id]
['prijshistorie', articleId]
['preference', userId, key]
['materiaal-plan', artikelId, aantal, machineId]
['tijdregistratie']  ['tijdregistratie', 'order', id]  ['tijdregistratie', 'stap', id]
['nacalculatie']     ['nacalculatie', 'project'|'order'|'artikel'|'artikelen', id]
```

Mutaties roepen `qc.invalidateQueries({ queryKey: [...] })` aan bij succes —
meestal de lijstsleutel van de resource die net veranderde (een contactpersoon
opslaan invalideert zowel `['relaties', id]` als `['relaties']`).

## Cachelaag in localStorage

Een aantal `api/*.ts`-modules houdt naast de Query-cache een eigen
in-memory array bij die in localStorage gespiegeld wordt (`sm_projects`,
`sm_articles`, …). Dat is géén mock meer: `initProjects()` en soortgelijke
init-functies halen bij het opstarten de echte lijst op van de API en
overschrijven de cache. De localStorage-kopie dient twee doelen:

- **synchrone lezers** — `gradesApi.listSync()`, `profilesApi.listSync()`,
  `machinesApi.listSync()` voeden de kostprijsberekening, die synchroon moet
  kunnen rekenen (zie `ArtikelPickerModal` in CLAUDE.md);
- **een zichtbaar scherm als de API even niet antwoordt**.

Mutaties schrijven optimistisch in de cache en sturen daarna een
achtergrondverzoek naar de API (`syncProject` in `api/projects.ts`). Mislukt
dat, dan wordt de gebruiker gewaarschuwd — een mislukte opslag mag zich niet
voordoen als een geslaagde.

## Nog niet gemigreerd

`api/overhead.ts` (bedrijfskosten + opslagpercentages) is **alleen**
localStorage: er is geen `/api/overhead`-route. Gevolg: deze instellingen
staan per browser, terwijl ze wél in elke kostprijs doorwerken. Twee pc's
kunnen dus een verschillende kostprijs berekenen voor hetzelfde artikel. Zie
`backend/21-api-design.md`.

Twee modules zijn geen opslag en horen niet in dit rijtje thuis:
`api/estimate.ts` is een re-export van de calculatiekern in
`@stockmanager/shared`, en `api/zaag-jobs.ts` groepeert reserveringen die zelf
van de API komen.

## Clientstate — Zustand (licht)

- `useUserStore` (`stores/user.ts`) — de gekozen gebruiker, bewaard via
  `zustand/middleware persist` onder `stockmanager-user`. Vorm:
  `{ user: { id, name, role } | null }`.

Er is geen `useDeviceStore`; mobiel/desktop wordt inline in `App.tsx` bepaald.

Schermvoorkeuren die per gebruiker op de **server** horen (kolominstellingen
bijvoorbeeld) lopen via `api/preferences.ts` en `hooks/useUserPreference.ts`,
niet via localStorage.

## localStorage-sleutels

| Sleutel | Waarde |
|---|---|
| `stockmanager-user` | zustand-persist: `{ user: { id, name, role } }` |
| `sm_projects` · `sm_articles` · `sm_relaties` · `sm_grades` · `sm_profiles` · `sm_locations` · `sm_machines` · `sm_surface_finishes` · `sm_company` | cachekopie van de API-lijst |
| `sm_overhead` | bedrijfskosten — **enige echte opslag zonder backend** |
| `sm_seq_<prefix>` | nummerteller per documentsoort (PRJ/OFF/PROD/PL/FACT), bij elke load opnieuw geijkt op de hoogste ID die de server kent |
| `sm_open_tabs` · `sm_popout_open_routes` · `sm_popout_channel` | tabbalk en losgemaakte vensters |
| `sm_wq_kpi` · `sm_wq_zoom` · `sm_prognose_gran` | weergavekeuzes op Wachtrij en Prognose |
