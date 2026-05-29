# 16 — Forms & Validation

## Library

- **Mantine `useForm`** for form state
- **Zod** schemas imported from `@inventaris/shared`
- `@mantine/form` + `mantine-form-zod-resolver` to wire Zod into useForm

## Pattern

```ts
import { rawMaterialSchema } from '@inventaris/shared';
import { useForm, zodResolver } from '@mantine/form';

const form = useForm({
  initialValues: { ... },
  validate: zodResolver(rawMaterialSchema),
});
```

## Shared schemas (in `@inventaris/shared`)

- `userSchema`
- `rawMaterialSchema`
- `finishedGoodSchema`
- `locationSchema`
- `gradeSchema`
- `profileSchema`
- `stockMovementSchema`
- `labelBatchSchema`

Each exports both the Zod schema and the inferred TS type:

```ts
export const rawMaterialSchema = z.object({ ... });
export type RawMaterial = z.infer<typeof rawMaterialSchema>;
```

## Validation messages

- Dutch language
- Customize via Zod's `message` argument or a small map
- Examples:
  - `z.string().min(1, 'Verplicht veld')`
  - `z.number().positive('Moet groter zijn dan 0')`

## Server-side

Backend imports the same schemas and validates incoming request bodies. If validation fails, return `400` with the Zod issue list.
