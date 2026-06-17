# 31 — Finished Goods (Articles)

Articles are **make-to-stock manufactured products**, not a passive catalog
entry (decided 2026-06-04, see `decisions/90-decisions-log.md`). The data
model (`Article` in `apps/web/src/api/articles.ts`) carries identity/stock
fields, a structured **recipe**, an **operations/routing** list, a **setup
sheet**, a link to a **Relatie** (customer), and a cost **estimate**.

> **Backend note:** `apps/api/prisma/schema.prisma`'s `FinishedGood` model
> still reflects the old simple-catalog shape (no recipe/operations/estimate).
> The frontend `Article` type is ahead of the backend — see the 2026-06-15
> "mock phase" decision log entry. Reconcile the Prisma model with `Article`
> when building the real articles backend.

## Identity

- Article number: `ART-NNNN`, unique, auto-generated (`nextArtNo`)
- Created/edited by admin (role-gated via `useUserStore(s => s.user?.role === 'admin')`)

## Record fields

| Field | Notes |
|---|---|
| `id` | `ART-NNNN` |
| `naam` | required |
| `relatieId` / `contactId` | link to a Relatie (customer) and one of its contacts — see `apps/web/src/api/relaties.ts` and `apps/web/src/components/relaties/` (no dedicated feature doc yet) |
| `klant` | free-text fallback customer name |
| `tekening`, `rev` | drawing number + revision |
| `drawingPath`, `photoPath` | optional PDF / photo |
| `recipe` | see below, `null` if not yet defined |
| `operations` | ordered routing steps |
| `notes`, `attachments` | setup sheet, see below |
| `estimate` | cost calculator state, see `features/38-article-calculator.md` |
| `locatie` | free-text location |
| `currentStock`, `minStock`, `maxStock` | stock levels |

## Recipe

The raw blank one finished piece is made from: `profileId` + `gradeId` +
`dimensions` (matching the profile's dimension schema) + `lengthPerPieceMm`.
References the real grades/profiles (`features/34-grades-profiles.md`) so it
can feed the saw pipeline (calculator → reserveringen → zaagflow).

## Operations

Ordered routing steps — tags for now: `zagen`/`draaien`/`frezen`/`boren`/`extern`
(`KNOWN_OPERATIONS` in `articles.ts`). Machine assignment + setup/cycle times
live in the per-article **estimate** (`features/38-article-calculator.md`), not
on the operation tag itself.

## Setup sheet

`notes.workholding` (opspanning) + `notes.general`, plus `attachments[]`
(`kind`: nc | image | drawing | document | other; NC files tagged by machine).
Mock phase stores attachment **metadata only** (name/size/machine) — see
`backend/25-file-storage.md` for the planned real-upload path.

## Detail page

`/artikelen/:id` (`ArtikelDetailPage`), full page (not a drawer) — an editable
info strip (naam, relatie/contact, tekening/rev, recept, locatie, voorraad)
plus three tabs:

| Tab | Content |
|---|---|
| Calculatie | `ArticleCalculator` — see `features/38-article-calculator.md` |
| Bestanden | `ArticleFilesTab` — setup sheet attachments |
| Historie | `ArticleHistoryTab` — derived from stock movements |

Add/edit of the core record fields uses `ArticleForm` in a Modal (`size={720}`),
per `frontend/18-design-patterns.md`.

## Lookup

Users find articles via the search/filter bar on `/artikelen`
(`ArtikelenPage`) by art_no, name, customer, or location — client-side
filtering over the full list (see `features/36-search.md` for the shared
`/api/search` design and its current scope).

## Drawing viewer

PDFs viewed inline via PDF.js or browser-native `<iframe src=".pdf">`. Mantine
doesn't ship a PDF viewer — pick library at build time (pdfjs-dist or
react-pdf). Not yet built.

## Lifecycle

- Created/deleted only by admin
- Edited under lock (any user holding the lock) — once locking is wired into
  the frontend, see `workflows/43-edit-locking-flow.md`
- Stock changed via movements
