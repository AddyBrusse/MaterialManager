# 16 — Forms & Validation

## Library

- **Mantine `useForm`** (`@mantine/form`) for form state
- **Zod** schemas live in `@stockmanager/shared` and are the source of truth
  for shapes shared with the backend

## Current pattern

Built forms (`RawMaterialForm`, `ArticleForm`, …) use `useForm` with Mantine's
own `validate` map — per-field functions returning a Dutch error string or
`null` — rather than a Zod resolver:

```ts
const form = useForm<FormValues>({
  initialValues: { ... },
  validate: {
    naam: (v) => (!v.trim() ? 'Naam is verplicht' : null),
    gradeId: (v) => (!v ? 'Grade is verplicht' : null),
  },
})
```

A `zodResolver(schema)` wiring (as `mantine-form-zod-resolver` would provide)
is not currently used — if a form's shape maps directly onto a shared schema,
prefer that over hand-written rules, but don't introduce the dependency just
for this doc's sake.

## Shared schemas (in `@stockmanager/shared`)

- `userSchema`
- `rawMaterialSchema`
- `finishedGoodSchema` (legacy catalog shape — see `features/31-items-finished.md` for the drift vs. the frontend `Article` type)
- `locationSchema`
- `gradeSchema` (incl. optional `pricePerKg`)
- `profileSchema`
- `movementSchema`
- `labelSchema`
- `lockSchema`
- `RelatieSchema` / `CreateRelatieSchema` / `UpdateRelatieSchema` / `RelatieContactSchema`

Each exports both the Zod schema and the inferred TS type:

```ts
export const rawMaterialSchema = z.object({ ... });
export type RawMaterial = z.infer<typeof rawMaterialSchema>;
```

## Validation messages

- Dutch language
- Examples:
  - `'Verplicht veld'`
  - `'Moet groter zijn dan 0'`

## Server-side

Where a backend route exists (raw materials, grades, profiles, locations), it
imports the same `@stockmanager/shared` schemas and validates request bodies,
returning `400` with the Zod issue list on failure. Resources still in the
mock phase (articles, relaties, machines, overhead, estimate) validate
client-side only — see `decisions/90-decisions-log.md`.
