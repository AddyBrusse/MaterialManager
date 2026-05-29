# 10 — Frontend Overview

## App shape

Single Vite + React app. At runtime, the root component picks a layout based on viewport:

- **Width ≤ ~900px** → mobile layout, mobile-only routes
- **Width > ~900px** → desktop layout, full routes

The split is route-level, not just CSS. Mobile and desktop have different page components and navigation.

## Folder layout

```
apps/web/src/
├── main.tsx
├── App.tsx                  ← device detection, MantineProvider, router
├── routes/
│   ├── desktop/             ← desktop pages
│   └── mobile/              ← mobile pages
├── components/
│   ├── common/              ← shared between mobile and desktop
│   ├── desktop/             ← desktop-only UI
│   └── mobile/              ← mobile-only UI
├── hooks/                   ← useUser, useLock, useItem, etc.
├── api/                     ← typed fetch wrappers around REST endpoints
├── stores/                  ← Zustand or Mantine context (user, language)
├── lib/                     ← formatters, weight calc, helpers
├── theme/                   ← Mantine theme config
└── types/                   ← local types (server types come from @shared)
```

## Principles

- Keep files small. If a component grows past ~150 lines, split it.
- Co-locate component CSS in CSS modules next to the `.tsx` file
- All server interaction goes through TanStack Query + typed API wrappers in `/api`
- Forms use Mantine `useForm` + Zod resolver
- Dutch UI labels — centralize strings if useful, but inline is fine for v1
