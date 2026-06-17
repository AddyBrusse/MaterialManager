# 18 — UI Design Patterns

Reference for building new pages. Follow these patterns exactly — do not invent new ones.

---

## Theme

Defined in `apps/web/src/theme/index.ts`. Full visual spec (colors, spacing,
typography) is `frontend/19-visual-design.md` — only the Mantine-relevant bits
are summarized here.

- **Font**: IBM Plex Sans / IBM Plex Mono, **primary colour**: `blue` tuple
  matching `--accent` `#2d6df6`, **default radius**: `sm`
- **Global component defaults**:

```ts
TextInput:   size="xs"
NumberInput: size="xs"
Select:      size="xs"
Textarea:    size="xs"
Drawer:      size="md"
Badge:       size="xs"
Loader:      size="sm"
```

Mantine is only used for complex UI (forms, drawers, modals, notifications).
Page layout and tables use the `st-*` CSS classes in
`apps/web/src/styles/tokens.css` directly — see `frontend/15-desktop-view.md`
and `frontend/19-visual-design.md`.

All UI text is **Dutch**.

---

## Layout

`AppLayout` (`apps/web/src/components/layout/AppLayout.tsx`) is a custom
`st-sidebar` / `st-topbar` / `st-content` layout, **not** Mantine `AppShell` —
see `frontend/15-desktop-view.md` for the structure and nav groups.

Add a new route:
1. Create `apps/web/src/routes/desktop/YourPage.tsx`
2. Import and add `<Route path="/your-path" element={<YourPage />} />` in `AppLayout.tsx`
3. Add an entry to the relevant `NAV` group and `ROUTE_LABELS` in `AppLayout.tsx`

---

## Sortable Table — legacy pattern (do not start new pages this way)

`apps/web/src/routes/desktop/RawMaterialsPage.tsx` +
`TableSort.module.css` are an earlier, unrouted prototype using Mantine
`Table` with CSS-module sort-header styling. They are **dead code** — the
real `/voorraad` route is `VoorraadPage.tsx`, which (like all current list
pages) renders a plain `<table class="st-tbl">` styled from
`apps/web/src/styles/tokens.css` (anatomy documented in
`frontend/19-visual-design.md` under "Table").

For **new list pages**: use `st-tbl` markup, not Mantine `Table` +
`TableSort.module.css`. The sort-state/sort-function helpers below are still
useful — only the markup/CSS-module part is legacy.

| File | Purpose |
|---|---|
| `YourPage.tsx` | Page with `st-tbl` table, filters, CRUD wiring |

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

### Table markup (legacy Mantine version — see note above)

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

For the current `st-tbl` markup, see `VoorraadPage.tsx` / `ArtikelenPage.tsx` /
`RelatiesPage.tsx`: a plain `<table className="st-tbl">` inside
`<div className="st-table-wrap"><div className="st-tbl-scroll">…</div></div>`,
with the same `Th`/sort-state helpers above driving `<th>` click handlers.

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

## Tabbed detail page (alternative to the drawer)

For records with enough sub-content that a drawer is too cramped — articles,
relaties — use a dedicated full-page route instead:
`ArtikelDetailPage.tsx` (`/artikelen/:id`) and `RelatieDetailPage.tsx`
(`/relaties/:id`) are the reference implementations.

Shape:
- `st-page-hd` header with an editable info strip (e.g. `ArticleInfoStrip`)
  for the core record fields — edits open an `ArticleForm`/equivalent Modal
- A row of tab buttons (`type Tab = '...' as const`), one panel rendered per
  active tab, each panel a separate component
  (e.g. `ArticleCalculator` / `ArticleFilesTab` / `ArticleHistoryTab`)
- Each tab component receives the record (and any shared lookups: grades,
  profiles, machines, relaties) as props, fetched once at the page level via
  `useQuery` and passed down — don't re-fetch per tab

Use this pattern when a record needs ≥3 distinct content areas; otherwise
prefer the read-only drawer below.

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

## Grouped line-item lists (calculator / zaagflow)

`ArticleCalculator.tsx` (Materialen/Bewerkingen/Uitbestedingen, see
`features/38-article-calculator.md`) and `ZaagflowPage.tsx` (per-bar cut
flow) both use the same shape for editable grouped lists:

- Each group is a section with a header (totals/summary) and a list of line
  items below it
- A line item is read-only in the list; an edit (✎) button next to the
  delete button, or a double-click on the row, opens a confirm-gated Modal
  (`size="sm"` inputs) to add/edit that item — the list itself never has
  inline editable cells
- New reference implementations for this kind of UI should follow these two
  files rather than inventing a new grouped-list pattern

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
