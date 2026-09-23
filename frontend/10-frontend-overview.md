# 10 — Frontend Overview

## Vorm van de app

Eén Vite + React-app. `App.tsx` kiest de schil: gebruikerskiezer,
terminal-kioskscherm, losgemaakt venster, of mobiel/desktop op basis van de
vensterbreedte (grens 900 px). Zie `frontend/11-routing.md`.

De splitsing mobiel/desktop is op routeniveau, niet alleen CSS: beide hebben
eigen paginacomponenten en navigatie. Mobiel is nog een stub.

## Mappen

```
apps/web/src/
├── main.tsx
├── App.tsx                  ← schilkeuze, MantineProvider, router
├── routes/
│   ├── desktop/             ← desktoppagina's
│   ├── mobile/              ← mobiele stub
│   └── TerminalPage.tsx     ← kioskscherm voor de rol `terminal`
├── components/
│   ├── layout/              ← AppLayout, GlobalTabs, PopoutShell, pageRegistry
│   ├── common/              ← gedeeld
│   └── <feature>/           ← per gebied: articles, projecten, planning-queue,
│                              relaties, settings, todos, tijd, nacalculatie,
│                              materiaal, prognose, raw-materials, documenten
├── hooks/                   ← useProjectLock, useTijdregistratie, usePopout, …
├── api/                     ← getypeerde fetch-wrappers per resource
├── services/                ← PDF-opmaak en Graph (mail/agenda)
├── stores/                  ← Zustand: alleen user.ts
├── utils/                   ← formatters, planninghulp, popout, voortgang
├── styles/                  ← tokens.css + een stylesheet per zwaar scherm
├── theme/                   ← Mantine-themaconfig
└── types/
```

Er is geen `components/desktop/` of `components/mobile/`; componenten staan
per functiegebied gegroepeerd.

## Uitgangspunten

- Bestanden klein houden. Groeit een component voorbij ~150 regels, splitsen.
- Alle serverinteractie via TanStack Query + de wrappers in `/api`
- Formulieren met Mantine `useForm` + een `validate`-map met Nederlandse
  meldingen (zie `frontend/16-forms-validation.md`)
- Nederlandse UI-teksten
