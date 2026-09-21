# 11 — Routing

## Vier schillen, gekozen in `App.tsx`

`App.tsx` kiest vóór de router welke schil je krijgt:

1. **Geen gebruiker gekozen** → `<UserSelectScreen />`, geen router.
2. **Rol `terminal`** → `<TerminalPage />`, geen router en geen weg terug. Een
   machinescherm in de hal hoort de rest van de app niet te kunnen bereiken;
   de API weigert dit account sowieso alles behalve de klok
   (`apps/api/src/middleware/terminal-scope.ts`).
3. **Pad begint met `/pop/`** → `<PopoutShell />`, de losgemaakte-vensterschil.
4. **Anders** → `<MobileLayout />` bij breedte ≤ 900 px (`MOBILE_BREAKPOINT`),
   anders `<AppLayout />`.

De mobiel/desktop-keuze wordt inline in `App.tsx` uit `window.innerWidth`
berekend bij mount en bij resize; er is geen store voor.

## Desktoproutes (`AppLayout`)

| Pad | Pagina | Notities |
|---|---|---|
| `/` | — | Redirect naar `/voorraad` |
| `/voorraad` | `VoorraadPage` | Grondstoffen, tabel + filters; detail/bewerken via drawer (geen route) |
| `/binnenboeken` | `BinnenBoekenPage` | Materiaal ontvangen — zie `workflows/41-receive-material.md` |
| `/artikelen` | `ArtikelenPage` | Artikellijst, zoeken + filters |
| `/artikelen/:id` | `ArtikelDetailPage` | Artikeldetail met tabs, zie `features/31-items-finished.md` |
| `/instellingen` | `InstellingenPage` | Beheer — Materiaalbeheer + Bedrijfskosten/Machines |
| `/zaagcalculator` | `ZaagCalculatorPage` | Zaagsnedes plannen uit voorraad |
| `/reserveringen` | `ReserveringenPage` | Gereserveerde zaagplannen |
| `/zaagplanner` | `ZaagPlannerPage` | **Uitgezet in de nav** (`disabled: true`) — hiervoor komt een andere applicatie. De route bestaat nog |
| `/zaagflow` | `ZaagflowPage` | Reserveringen uitvoeren, per staaf met kwaliteitscontroles |
| `/relaties` | `RelatiesPage` | Klanten/leveranciers |
| `/relaties/:id` | `RelatieDetailPage` | Tabs Gegevens/Contacten/Artikelen |
| `/projecten` | `ProjectenPage` | Projectlijst |
| `/projecten/:id` | `ProjectDetailPage` | Projectdetail; de open tab staat in de URL (`?tab=factuur`) |
| `/documenten` | `DocumentenPage` | Alle documenten over projecten heen |
| `/planning-queue` | `PlanningQueuePage` | Wachtrij — het enige planbord (zie besluit 2026-07-21) |
| `/prognose` | `PrognosePage` | Werklastprognose |
| `/todos` | `TodosPage` | Openstaande todo's |
| `/tijdregistratie` | `TijdregistratiePage` | Uren per order/stap |
| `*` | — | Redirect naar `/voorraad` |

De nav is gegroepeerd in **Planning** / **Productie** / **Materiaalbeheer** /
**Stamgegevens** (`NAV` in `AppLayout.tsx`), wat ook de broodkruimel in de
topbar voedt (`ROUTE_LABELS`).

## `pageRegistry.tsx` is de bron

`components/layout/pageRegistry.tsx` bevat `PAGES`: per pagina het pad, label,
icoon, component en of hij los te maken is (`poppable`). Die lijst voedt zowel
de tabbalk als de popout-vensters. **Voeg een nieuwe pagina daar toe**, niet
alleen in de `<Routes>` van `AppLayout` — anders bestaat hij wel als URL maar
niet als tab of los venster.

## Losgemaakte vensters (`/pop/*`)

Een pagina met `poppable: true` kan in een eigen browservenster open
(`utils/popout.ts`). Dat venster draait dezelfde componenten via
`PopoutShell`, dat zijn routes uit `POPOUT_ENTRIES` haalt — inclusief
parameterroutes zoals `/projecten/:id`, zodat `useParams()` daar werkt.
`hideChrome` laat de paginakop weg in een popout.

## Mobiele routes (`MobileLayout`, `routes/mobile/index.tsx`)

**Status: stub, niet gebouwd.** Een Mantine `AppShell` met een
`SegmentedControl` onderin (Grondstof / Artikel / Mutaties) tussen drie
placeholderpagina's die "nog te bouwen" tonen.

| Pad | Pagina |
|---|---|
| `/` | Redirect naar `/raw` |
| `/raw` | placeholder |
| `/finished` | placeholder |
| `/movements` | placeholder |
| `*` | Redirect naar `/raw` |

Zie `frontend/14-mobile-view.md` voor het bedoelde ontwerp.

## Gebruikerskeuze

Vóór alle routes: staat er geen gebruiker in `useUserStore` (zustand `persist`,
localStorage-sleutel `stockmanager-user`), dan verschijnt `<UserSelectScreen />`.
Na de keuze rendert de app in de normale schil.

## Sloten op detailpagina's

**Gebouwd voor projecten.** `hooks/useProjectLock.ts` haalt de slotstand op,
stuurt heartbeats en toont wie het project open heeft; `ProjectDetailPage`
gebruikt hem. De querysleutel is `['lock', 'project', id]`.

Voor grondstoffen en artikelen bestaat de backend-lifecycle wél
(`backend/24-locking.md`) maar is er nog geen frontend die hem gebruikt — zie
`workflows/43-edit-locking-flow.md`.
