# 18 — UI Design Patterns

Reference for building new pages. Follow these patterns exactly — do not invent new ones.

---

## Theme

Defined in `apps/web/src/theme/index.ts`.

- **Primary colour**: custom blue (`#1a8aff`)
- **Font**: Inter / system-ui
- **Default radius**: `sm`
- **Global component defaults** (do not override per-instance unless there is a strong reason):

```ts
Button:      size="xs"
TextInput:   size="xs"
Select:      size="xs"
NumberInput: size="xs"
Table:       withTableBorder withColumnBorders striped
Badge:       size="xs"
```

All UI text is **Dutch**.

---

## Layout

`DesktopLayout` in `apps/web/src/routes/desktop/index.tsx` uses Mantine `AppShell`:

```
AppShell
  AppShell.Header   h=44, p="xs"  — app title
  AppShell.Navbar   w=200         — nav + user pill
  AppShell.Main     pt=44         — page content
```

Nav items use `NavLink` from react-router-dom wrapped in `MantineNavLink`. Admin-only items are gated on `user.role === 'admin'`.

Add a new route:
1. Create `apps/web/src/routes/desktop/YourPage.tsx`
2. Import and add `<Route path="/your-path" element={<YourPage />} />` in `index.tsx`
3. Add a `MantineNavLink` entry in `DesktopNav`

---

## Sortable Table — the standard pattern

Every list page uses this pattern. Required files:

| File | Purpose |
|---|---|
| `TableSort.module.css` | Column header hover styles — one per route folder |
| `YourPage.tsx` | Page with table, filters, CRUD wiring |

### CSS module (`TableSort.module.css`)

```css
.th      { padding: 0 !important; }
.control { width: 100%; padding: var(--mantine-spacing-xs); }
.control:hover { background-color: light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6)); }
.icon    { width: rem(16px); height: rem(16px); border-radius: rem(16px); }
```

### Sortable `Th` component

Define locally in the page file. Accepts `sortKey`, `sortBy`, `reversed`, `onSort`:

```tsx
function Th({ children, sortKey, sortBy, reversed, onSort }) {
  const active = sortBy === sortKey
  const Icon = active ? (reversed ? IconChevronUp : IconChevronDown) : IconSelector
  return (
    <Table.Th className={classes.th}>
      <UnstyledButton onClick={() => onSort(sortKey)} className={classes.control}>
        <Group justify="space-between" wrap="nowrap">
          <Text fw={500} fz="xs">{children}</Text>
          <Center className={classes.icon}><Icon size={14} stroke={1.5} /></Center>
        </Group>
      </UnstyledButton>
    </Table.Th>
  )
}
```

### Sort state

```ts
type SortKey = 'fieldA' | 'fieldB' | ...

const [sortBy, setSortBy]   = useState<SortKey | null>('fieldA')
const [reversed, setReversed] = useState(false)

function handleSort(key: SortKey) {
  setReversed(sortBy === key ? !reversed : false)
  setSortBy(key)
}
// pass as: thProps = { sortBy, reversed, onSort: handleSort }
```

### Sort function

```ts
function applySort(data: Row[], sortBy: SortKey | null, reversed: boolean) {
  if (!sortBy) return data
  return [...data].sort((a, b) => {
    const va = sortValue(a, sortBy)   // string | number
    const vb = sortValue(b, sortBy)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'nl')
    return reversed ? -cmp : cmp
  })
}
```

### Table markup

```tsx
<ScrollArea>
  <Table miw={860} verticalSpacing={3} fz="xs" layout="fixed">
    <Table.Thead>
      <Table.Tr>
        <Th sortKey="fieldA" {...thProps}>Label</Th>
        ...
        <Table.Th style={{ width: 64 }} />  {/* actions column */}
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {rows.map(row => (
        <Table.Tr key={row.id} onClick={() => setSelected(row)} style={{ cursor: 'pointer' }}>
          ...
          <Table.Td>
            <Group gap={4} justify="center" onClick={e => e.stopPropagation()}>
              <Tooltip label="Bewerken">
                <ActionIcon size="xs" variant="subtle" onClick={() => setEditItem(row)}>
                  <IconEdit size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Verwijderen">
                <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleDelete(row)}>
                  <IconTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
</ScrollArea>
```

Key details:
- `miw={860}` on Table + wrapping `ScrollArea` for horizontal scroll
- `verticalSpacing={3}` and `fz="xs"` for density
- Action column is `width: 64`, stopPropagation so click doesn't open detail drawer
- Empty state: single `<Table.Td colSpan={N}>` with centred Dutch text

---

## Filter toolbar

Above every table. Pattern:

```tsx
<Group justify="space-between">
  <Group gap="xs">
    <TextInput placeholder="Zoek…"  leftSection={<IconSearch size={13} />} value={search}   onChange={…} w={130} />
    <Select    placeholder="Grade"  data={gradeOptions}  value={gradeFilter}  onChange={…} w={110} clearable />
    <Select    placeholder="Profiel" data={profileOptions} value={profileFilter} onChange={…} w={110} clearable />
    <Text size="xs" c="dimmed">{rows.length} stuks</Text>
  </Group>
  <Button leftSection={<IconPlus size={14} />} onClick={() => setAddOpen(true)}>
    Toevoegen
  </Button>
</Group>
```

All filter inputs are `size="xs"` (inherited from theme). Client-side filtering is fine for this dataset size.

---

## Mock data fallback

Use when the DB is likely empty during development. Show mock data when the API returns 0 items, real data otherwise:

```ts
const source = data?.data?.length ? data.data : MOCK
```

Define `MOCK` as a typed constant at the top of the page file. Remove it once the feature is production-ready.

---

## Detail drawer

Read-only slide-in from the right. Opens on table row click.

```tsx
// in the page
const [selected, setSelected] = useState<YourRow | null>(null)

// in JSX
<YourDrawer item={selected} onClose={() => setSelected(null)} />
```

Drawer component: `position="right"`, `size="md"`. Use `SimpleGrid cols={2}` for metadata fields. Pattern for a field:

```tsx
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm">{value}</Text>
    </Stack>
  )
}
```

---

## Add / edit form drawer

Separate from the detail drawer. Uses Mantine `useForm`.

```tsx
// Two instances in the page — one for add, one for edit:
<YourForm mode="add"  opened={addOpen}    onClose={() => setAddOpen(false)} />
<YourForm mode="edit" item={editItem ?? undefined} opened={!!editItem} onClose={() => setEditItem(null)} />
```

### Form component conventions

```tsx
type FormValues = { field: string | number | '' ... }
const EMPTY: FormValues = { ... }

export function YourForm({ mode, item, opened, onClose }: Props) {
  const form = useForm<FormValues>({ initialValues: EMPTY, validate: { ... } })

  // populate/reset on open — deps: [opened, item?.id, mode]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!opened) return
    mode === 'edit' && item ? form.setValues({ ... }) : form.setValues(EMPTY)
  }, [opened, item?.id, mode])

  const mutation = useMutation({
    mutationFn: ...,
    onSuccess: () => { qc.invalidateQueries(...); notifications.show({ color: 'green', message: '...' }); onClose() },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message }),
  })

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title="..." padding="md">
      <form onSubmit={form.onSubmit(v => mutation.mutate(v))}>
        <Stack gap="sm">
          {/* fields */}
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" onClick={onClose}>Annuleren</Button>
            <Button type="submit" loading={mutation.isPending}>
              {mode === 'add' ? 'Aanmaken' : 'Opslaan'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Drawer>
  )
}
```

Key details:
- `useEffect` for populate has `// eslint-disable-next-line react-hooks/exhaustive-deps` above it — `form` is intentionally excluded from deps to avoid infinite loops
- `NumberInput` values type as `number | ''` (Mantine controlled pattern)
- Dynamic fields (e.g. dimension inputs that depend on a selected profile) reset when the parent select changes

---

## Delete pattern

```ts
const deleteMutation = useMutation({
  mutationFn: yourApi.remove,
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['your-resource'] })
    notifications.show({ color: 'green', message: 'Item verwijderd' })
  },
  onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
})

function handleDelete(row: YourRow) {
  if (!window.confirm(`${row.code} verwijderen?`)) return
  deleteMutation.mutate(row.id)
}
```

---

## API layer conventions

File: `apps/web/src/api/your-resource.ts`

```ts
import { apiFetch } from './client'

// Define the response shape separately from Zod schemas.
// Prisma Decimal fields arrive as strings over the wire — type them as string.
export type YourRow = {
  id: string
  decimalField: string   // Prisma Decimal → JSON string
  computedField: number  // server-computed, arrives as number
  nestedRelation: { ... } | null
}

export const yourApi = {
  list:   ()                      => apiFetch<YourRow[]>('/your-resource'),
  get:    (id: string)            => apiFetch<YourRow>(`/your-resource/${id}`),
  create: (body: CreateYour)      => apiFetch<YourRow>('/your-resource', { method: 'POST',   body: JSON.stringify(body) }),
  update: (id: string, body: ...) => apiFetch<YourRow>(`/your-resource/${id}`, { method: 'PATCH',  body: JSON.stringify(body) }),
  remove: (id: string)            => apiFetch<void>(`/your-resource/${id}`, { method: 'DELETE' }),
}
```

The `apiFetch` client in `apps/web/src/api/client.ts` automatically attaches `x-user-id` from Zustand store and throws on non-2xx responses.

---

## Notifications

`@mantine/notifications` is configured globally in `main.tsx`. Use directly:

```ts
import { notifications } from '@mantine/notifications'

notifications.show({ color: 'green', message: 'Opgeslagen' })
notifications.show({ color: 'red',   message: error.message })
```

---

## Component file rules

- Files ≤ ~150 lines — split when larger
- Kebab-case filenames, PascalCase component names
- Page-level components live in `apps/web/src/routes/desktop/`
- Shared/reusable components in `apps/web/src/components/<feature>/`
- Local helpers (sort, format) defined at top of the file that uses them; only extract to a shared util if used in ≥ 2 places
- `vite-env.d.ts` must exist in `apps/web/src/` for CSS module type support
