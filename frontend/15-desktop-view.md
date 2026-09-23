# 15 — Desktop View

## Wanneer

Vensterbreedte > 900 px → `AppLayout`
(`apps/web/src/components/layout/AppLayout.tsx`).

Voor opmaak tot op de pixel (kleuren, spacing, tabel- en kaartanatomie per
scherm) zie `frontend/19-visual-design.md` — dit document gaat alleen over
structuur en navigatie.

## Layout

Eigen layout (geen Mantine `AppShell`) met `st-*`-klassen uit
`apps/web/src/styles/tokens.css`:

- **Zijbalk** (`st-sidebar`) — merkteken, gegroepeerde nav, gebruikerspil
  onderin
- **Topbar** (`st-topbar`) — broodkruimel uit de route (`ROUTE_LABELS`)
- **Tabbalk** (`GlobalTabs`) — open pagina's, gevoed uit `pageRegistry.tsx`;
  een tab is los te maken tot een eigen venster (`/pop/*`)
- **Inhoud** (`st-content`) — de gerouteerde pagina

## Navigatiegroepen

| Groep | Items |
|---|---|
| Planning | Wachtrij, Prognose, ToDo, Tijdregistratie |
| Productie | Projecten, Documenten, Zaagcalculator, ~~Zaagplanner~~, ZaagFlow |
| Materiaalbeheer | Voorraad, Reserveringen, Binnen boeken |
| Stamgegevens | Artikelen, Relaties, Instellingen |

**Zaagplanner staat uitgeschakeld** in de nav (`disabled: true`, reden:
"Hiervoor gaan we een andere applicatie gebruiken"). De route en de pagina
bestaan nog.

Telbadges: **Voorraad** (aantal grondstofregels), **Reserveringen** (staven
die nog materiaal vasthouden), **ZaagFlow** en **Zaagplanner** (zaagbonnen met
werk erin), **ToDo** (open todo's). De eerste twee komen uit
`reservationCounts()` in `AppLayout.tsx`, niet uit localStorage.

## Pagina's

Zie `frontend/11-routing.md` voor de volledige routetabel. Korte notities:

- **Wachtrij** (`/planning-queue`) — het planbord: wachtrij per machine,
  cascadewaarschuwingen, de SPT/EDD/LPT-planhulp, `notBefore`-blokkades. Sinds
  2026-07-21 het enige planbord; Kanban en Gantt zijn verwijderd.
- **Projecten** (`/projecten`, `/projecten/:id`) — lijst + detailpagina met
  tabs Offertes / Opdrachtbevestiging / Productie / Nacalculatie / Paklijst /
  Factuur. De open tab staat in de URL, zodat een document deelbaar is.
- **Documenten** (`/documenten`) — alle offertes, OB's, paklijsten en facturen
  over projecten heen.
- **Tijdregistratie** (`/tijdregistratie`) — uren per order en stap, gespiegeld
  aan de calculatie (instellen per batch, draaien per stuk).
- **Voorraad** (`/voorraad`) — grondstoffentabel; rijklik opent een drawer.
- **Binnen boeken** (`/binnenboeken`) — zie `workflows/41-receive-material.md`.
- **Artikelen** (`/artikelen`, `/artikelen/:id`) — lijst + detailpagina met
  Calculatie/Bestanden/Historie/Prijshistorie.
- **Relaties** (`/relaties`, `/relaties/:id`) — Gegevens/Contacten/Artikelen.
- **Zaagcalculator / Reserveringen / ZaagFlow** — zaagpijplijn: snedes plannen,
  voorraad reserveren, uitvoeren met kwaliteitscontroles.
- **Instellingen** (`/instellingen`, alleen beheerder) — tabs **Bedrijf**,
  **Gebruikers**, **Materiaalbeheer** (Locaties / Kwaliteiten / Profielen /
  Nabewerkingen), **Bedrijfskosten** (Bedrijfskosten / Machines),
  **Nummering**, **Meldingen**.

Er is geen dashboard op `/`; die redirect naar `/voorraad`. Historie per
artikel staat op het artikeldetail.

## Dichtheid

- Tabellen gebruiken de globale `st-tbl`-klasse (eigen, dicht op elkaar)
- Formulieren in Mantine-modals/drawers gebruiken `size="sm"` (zie
  `frontend/18-design-patterns.md`)
