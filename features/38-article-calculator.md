# 38 — Article Calculator (kostencalculator)

Handoff doc for `apps/web/src/components/articles/ArticleCalculator.tsx`. Read this
before touching the calculator. It documents the data model, the component
structure, and the UI conventions established while building the
materials/machines/external sections — codified as **rules to code by** for any
future additions to this file (or similar tree-table-with-edit-modal UIs).

---

## Data model

`ArticleEstimate` (in `apps/web/src/api/articles.ts`) holds a flat list of
`EstimateNode[]`, grouped by `type` into three sections:

| Type | Section header | Represents |
|---|---|---|
| `material` | Materialen | raw stock consumed (grade + profile + dimensions + length + qty) |
| `machine` | Bewerkingen | a machine with setup time + ordered `steps[]` (cycle time per piece) |
| `external` | Uitbestedingen | outsourced work (qty + cost/piece + note) |

Each node has an `id`, `type`, `name`, plus type-specific fields (see the
`EstimateNode` interface for the full field list — `gradeId`/`profileId`/
`dimensions`/`lengthMm`/`qty`/`costOverride` for material, `machineId`/
`setupMin`/`rateOverride`/`steps` for machine, `externalCost`/`note` for external).

---

## Component structure

```
ArticleCalculator
├── MaterialConfig   — grade/profile/dimensions/length fields for a material node
├── MachineConfig    — machine select + active-machine preview for a machine node
├── MaterialModalFields  — full edit form for a material node (uses MaterialConfig)
├── MachineModalFields   — full edit form for a machine node (uses MachineConfig)
├── ExternalModalFields  — full edit form for an external node
├── NodeEditModal    — single shared Modal that renders one of the above based on `state.type`
└── (main component) — renders the three tree-table sections + wires up the modal
```

### The "embedded" dual-context pattern

`MaterialConfig` and `MachineConfig` are used in **two places**:

1. **Inline, in a `Popover`** (compact editing directly from the tree row) —
   default props: `embedded={false}`, `size="xs"`.
2. **Inside `NodeEditModal`** (full add/edit dialog) — passed
   `embedded size="sm"`.

Rules for this pattern:

- Signature shape: `{ node, ...data, onChange, embedded?: boolean, size?: 'xs' | 'sm' }`,
  defaulting to `embedded = false, size = 'xs'`.
- All `Select`/`NumberInput`/`TextInput` inside the shared component use
  `size={size}` — never hardcode a size.
- The component's own header (icon + title row with a border-bottom) is wrapped
  in `{!embedded && (...)}` — the modal supplies its own title and section
  Dividers, so the embedded header would be redundant.
- Muted/info text (e.g. "Geen materialen beschikbaar", the grade/profile preview
  box) uses a conditional size: `embedded ? 12.5 : 11` (or `11.5` for the preview
  box), and `padding: embedded ? '10px 12px' : '8px 10px'` for the preview box.
  Embedded (modal) context gets the larger, more breathing-room values.
- **Do not duplicate** `MaterialConfig`/`MachineConfig` for the modal — extend
  the existing component with `embedded`/`size` props, as done here.

---

## The add/edit modal pattern (`NodeEditModal`)

All three sections (material/machine/external) share **one** modal component and
**one** state shape:

```ts
type ModalState = { type: EstimateNodeType; mode: 'add' | 'edit'; draft: EstimateNode }

const [modal, setModal] = useState<ModalState | null>(null)
```

Flow:

- **Add**: `openAddMaterial()` / `openAddMachine()` / `openAddExternal()` build a
  default draft node (from recipe defaults / `machines[0]` / a blank external
  node) and call `setModal({ type, mode: 'add', draft })`. The node is **not**
  inserted into `nodes` yet.
- **Edit**: `openEditNode(node)` calls `setModal({ type: node.type, mode: 'edit', draft: { ...node } })`.
  Triggered by **double-clicking the row** (`onDoubleClick={() => openEditNode(node)}`)
  or by the edit icon button.
- **Field changes**: all modal field components call `onChange(partial)`, which
  is `updateDraft(p) => setModal(m => m ? { ...m, draft: { ...m.draft, ...p } } : m)`.
- **Confirm**: `confirmModal()` — if `mode === 'add'`, append `modal.draft` to
  `nodes`; if `'edit'`, `updateNode(modal.draft.id, modal.draft)`. Then `setModal(null)`.
- **Cancel**: `setModal(null)` directly — draft is discarded, `nodes` untouched.

### Modal rules (non-negotiable for this feature)

- `<Modal opened title={title} onClose={onCancel} closeOnClickOutside={false} closeOnEscape={false} size={520} centered radius="md">`
  — **must not** close on outside-click or Escape. Only `Annuleren` and `OK`
  (or the X button, which maps to `onCancel` and is treated as equivalent to Cancel)
  close it.
- `size={520}` for these compact "edit one line item" dialogs. Use `720` (as in
  `ArticleForm.tsx`) only for full-record forms with many sections.
- Title comes from a lookup table keyed by `[type][mode]`
  (`MODAL_TITLES.material.add`, `.edit`, etc.) — add new entries there, don't
  inline title strings.
- Footer is always:
  ```tsx
  <Group justify="flex-end" mt="lg">
    <Button variant="default" size="sm" onClick={onCancel}>Annuleren</Button>
    <Button size="sm" onClick={onConfirm}>OK</Button>
  </Group>
  ```
  (Use `Aanmaken`/`Opslaan` instead of `OK` only for forms that map to
  add vs. edit *create/update* semantics, per `ArticleForm.tsx` — for these
  lightweight node dialogs, `OK` covers both add and edit.)

### Modal field structure

Every `*ModalFields` component follows this shape:

```tsx
<Stack gap="sm">
  <TextInput label="Naam" size="sm" value={draft.name} onChange={...} />
  <Divider label="<Type-specific section>" labelPosition="left" />
  <TypeConfig node={draft} ... onChange={onChange} embedded size="sm" />
  <Divider label="Aantal & prijs" labelPosition="left" />
  <Group grow>
    <NumberInput label="Aantal" size="sm" ... />
    <NumberInput label="<Prijs/Tarief> override" size="sm" placeholder="automatisch" ... />
  </Group>
</Stack>
```

i.e. **Naam → Divider → embedded type-config → Divider → `Group grow` numeric
inputs**. Reuse this skeleton for any new node type.

---

## Sizing convention: `xs` vs `sm`

The global theme default for `TextInput`/`NumberInput`/`Select` is `size="xs"`
(see `apps/web/src/theme/index.ts`) — correct for dense tables and inline
popovers.

**Inside any `Modal`** (this calculator's `NodeEditModal`, and `ArticleForm.tsx`),
**every input must explicitly set `size="sm"`** — modals have more breathing
room and `xs` reads as too small next to modal titles/buttons. This means:

- Inline/popover editing → `xs` (the default, don't override)
- Modal dialogs (add/edit) → `sm` (override explicitly on every input)

This is why `MaterialConfig`/`MachineConfig` take a `size` prop instead of
hardcoding — the same component serves both contexts.

---

## Row layout rules (tree-table)

- Each row is `<div className="calc-row" key={node.id}>`. Group header rows add
  `is-group`; the machine row adds `is-machine` (slightly different background).
- **Double-click anywhere on the row** opens the edit modal:
  `onDoubleClick={() => openEditNode(node)}`.
- Row actions live in a `.row-actions` wrapper (CSS: `opacity: 0`, revealed via
  `.calc-row:hover .row-actions { opacity: 1 }`, icons sized 14px in 24px buttons).
- **Icon order is always edit-then-delete**: the pencil (`Icon.edit`,
  `title="<Type> bewerken"`, `onClick={() => openEditNode(node)}`) goes **before**
  the trash (`Icon.trash`, `title="<Type> verwijderen"`, `onClick={() => removeNode(node.id)}`).
  Apply this order to any new row type.
- "Add new" rows: `<div className="calc-row"><div className="calc-addrow"><button type="button" className="calc-add" onClick={openAdd...}><Ic d={Icon.plus} /><Label> toevoegen</button></div></div>`.
  Nested add rows (e.g. "Bewerking toevoegen" under a machine) use
  `className="calc-addrow indent"`.
- `TreeName` handles the indentation rail (`depth={0|1|2}`) and icon — depth 0
  is the section group, depth 1 is a node, depth 2 is a machine's step/setup row.

---

## Cross-reference

- General modal/drawer/form conventions for the rest of the app:
  `frontend/18-design-patterns.md`
- Color tokens, spacing, typography: `frontend/19-visual-design.md`
- `ArticleForm.tsx` is the reference for full-record (`size={720}`) modals;
  this calculator's `NodeEditModal` is the reference for compact
  per-line-item (`size={520}`) modals.
