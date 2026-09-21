# 13 — Components

## Mantine

Mantine v7 overal, `size="xs"`/`"sm"` voor desktopdichtheid (zie
`frontend/18-design-patterns.md` voor modal-/drawermaten). Geen eigen
maaksels waar Mantine het al heeft.

## Mappen in `apps/web/src/components/`

| Map | Waarvoor |
|---|---|
| `layout/` | `AppLayout` (zijbalk + topbar + inhoud), `GlobalTabs`, `PopoutShell`, `pageRegistry` |
| `common/` | `UserSelectScreen` — de gebruikerskiezer vóór de router |
| `raw-materials/` | `RawMaterialForm` — toevoegen/bewerken van een grondstof |
| `articles/` | Artikeldetail: `ArticleForm`, `ArticleCalculator`, `ArticleInfoStrip`, `ArticleFilesTab`, `ArticleHistoryTab`, `ArticleFinancialCard`, `ArticlePrijshistorieTab`, `ArticleSankey`, `PrijshistorieGrafiek`, pickers voor materiaal en locatie, `calc-icons` |
| `relaties/` | Tabs Gegevens / Contacten / Artikelen |
| `projecten/` | Het grootste blok: de tabs van de projectdetailpagina (`OfferteTab`, `OpdrachtbevestigingTab`, `ProductieTab`, `PaklijstTab`, `FactuurTab`), `ArtikelPickerModal`, `RegelsTable`, `projectColumns`, plus de mail-import (`MailDropzone`, `MailImportReview`, `MailRegelsTable`, `MailDebugPaneel`) |
| `materiaal/` | `MateriaalSelectieModal` en `MateriaalSelectieVanTodo` — materiaal kiezen bij het aanmaken van de opdracht |
| `planning-queue/` | Wachtrij: `QueuePanel`, `QueueTimeline`, `QueueBacklog`, `QueueDetails`, `QueueKpiStrip`, `QueueToolbar`, `QueueJobCard`, `SuggestScheduleModal`, `CascadeConfirmModal`, de STEP-viewer |
| `prognose/` | `PrognoseBars`, `PrognoseHeatmap` |
| `todos/` | `TodoRow`, `TodoAddRow`, `TodoAlerts` |
| `tijd/` | `KlokBlok`, `ActieveRegistratie`, `CorrectieModal` |
| `nacalculatie/` | `NacalculatiePaneel` plus een tab per invalshoek (project/artikel) |
| `documenten/` | `documentStatus.ts` — statusafleiding voor de documentenpagina |
| `settings/` | `MateriaalbeheerPage` (Locaties/Kwaliteiten/Profielen/Nabewerkingen) en `OverheadPage` (Bedrijfskosten/Machines) |

## Styling

Paginalayout en tabellen gebruiken de globale `st-*`-klassen uit
`apps/web/src/styles/tokens.css` (zie `frontend/19-visual-design.md`).

Grotere schermen met veel eigen opmaak hebben een eigen stylesheet naast de
tokens: `styles/planning-queue.css`, `styles/prognose.css`,
`styles/tijdregistratie.css`, en in `components/articles/` een paar
feature-stylesheets. Er is precies één CSS-module in de hele app
(`routes/desktop/TableSort.module.css`); nieuwe stylesheets volgen liever het
patroon hierboven dan dat er modules bijkomen.

## Mobiel

Niet gebouwd — `routes/mobile/index.tsx` toont placeholders. Zie
`frontend/14-mobile-view.md`.

## Regels

- Bestanden klein. Nadert een component de 150 regels, splitsen.
- Props expliciet getypeerd, geen `any`.
