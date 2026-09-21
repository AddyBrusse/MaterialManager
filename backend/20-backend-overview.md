# 20 — Backend Overview

## Stack

- Node 20+
- Express
- PostgreSQL via **Prisma** — schema in `apps/api/prisma/schema.prisma`
- Zod voor validatie (gedeelde schema's uit `@stockmanager/shared`)
- multer voor uploads

## Mappen

```
apps/api/src/
├── index.ts                 ← bootstrap, middleware + routes mounten
├── config.ts                ← env, paden, poort
├── db/
│   ├── client.ts            ← Prisma-client
│   └── seed.ts              ← beheerder, standaardprofielen
├── routes/                  ← één module per resource, dun
├── services/                ← business logic
├── middleware/
│   ├── error.ts
│   ├── user-context.ts      ← leest x-user-id, hangt de gebruiker aan req
│   ├── require-admin.ts
│   └── terminal-scope.ts    ← toelatenlijst voor de rol `terminal`
├── lib/                     ← async-handler, bestandsnamen, shared-check
└── scripts/
```

Prisma-migraties staan in `apps/api/prisma/migrations/`, niet onder `src/db/`.

## Waar de logica zit

Routes zijn dun; `services/` doet het werk. De zwaardere diensten:

| Service | Waarvoor |
|---|---|
| `voorraad.ts` | fysiek / gereserveerd / vrij — de enige plek die bepaalt wat "gereserveerd" is |
| `tijdregistratie.ts` | klok starten/stoppen, `effectieveSeconden`, correcties |
| `nacalculatie.ts` | nacalculatie afleiden uit uren, zaagbonnen en offerteregel |
| `materiaal-selectie.ts` | materiaalvoorstel per orderregel (zaagplan) |
| `prijs-snapshot.ts` | prijssnapshot bij het accepteren van een offerte |
| `project-store.ts` | project + offertes + orders als één geheel lezen/schrijven |
| `mail-import.ts` · `mail-lezen.ts` · `ai-extract.ts` · `msg-parse.ts` · `pdf-text.ts` | het mail-importpad, zie `features/60-mail-import.md` |
| `offerte-pdf.ts` · `label.ts` · `titelblok.ts` | documentopmaak |
| `weight.ts` | gewicht op leesmoment uit profiel + maten + dichtheid |

## Conventies

- Routes dun, services houden de logica
- Body valideren met Zod bij binnenkomst, 400 bij mislukking
- Async-handlers wikkelen in `lib/async-handler.ts` zodat fouten bij de
  errormiddleware landen
- Antwoordvorm: `{ data }` bij succes, `{ error: { code, message, details? } }`
  bij fout
- Statuscodes: 200 OK, 201 Created, 400 Validatie, 403 Verboden, 404 Niet
  gevonden, 409 Conflict (slot vast), 500 Serverfout
- Loopt de code voor op de database, dan noemt de errormiddleware de
  ontbrekende migratie bij naam plus het commando — zie CLAUDE.md

## Statische frontend

In productie serveert Express de Vite-build uit `apps/web/dist` op `/`, en de
API op `/api/*`. Eén proces, zoals op de NAS.
