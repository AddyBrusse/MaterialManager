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

**Lengte is netto (2026-10-06).** `lengthMm` on a material node is the bare
workpiece length. Cost is computed over the *bruto* length from
`brutoLengte` in `packages/shared/calc/bruto-lengte.ts` (saw kerf + facing, plus
parting-off and a share of the bar-loader stub when a machine node points at a
machine with `heeftStangenlader`). Never store bruto. The material row is its
own component, `MateriaalRegel.tsx` (netto input, bruto + breakdown, free stock
in mm, price with "VASTE PRIJS" + reset when `costOverride` is set).

**Exoot (2026-10-06).** A material node with `exoot: true` points at a raw
material made to measure for one customer (`rawMaterialId`). It costs weight of
the delivered piece × grade €/kg ÷ `stuksUitEen` — no kerf, facing or loader.
Rendered by `ExootRegel.tsx` ("stuks uit 1 exoot", "½ exoot", "bestellen bij
opdracht"); created with `ExootVenster.tsx` ("+ Exoot aanmaken" next to
"Materiaal kiezen"), which adds the raw material with stock 0 and the node.
Picking an existing exoot in the picker gives the same node. An exoot never
becomes the article recipe.

---

## Component structure (2026-10-23)

The calculator was one file of 730 lines; it is now a shell plus one file per
section. What the sections share is passed as a `CalcKit` (`calc-kit.tsx`):
the estimate context, `readOnly`, open/closed state, `updateNode`, `verwijder`
(delete with "Ongedaan maken"), drag props and the fixed bits of a row.

```
ArtikelDetailPage                 routes/desktop — title, cards, tabs, read-only fieldsets
├── useEditLock('article', id)    hooks — who may edit (same lock as projects)
├── useArtikelBewerken(id, slot)  hooks — read from the server, auto-save, status
├── ArtikelStand                  status next to the title (opgeslagen / niet opgeslagen / je kijkt mee)
├── ArtikelTabs                   folder tabs like the project page (.ad-tab)
└── ArticleCalculator             shell: data, ctx, modals, CalcKit
    ├── CalcMaterialen            MateriaalRegel / ExootRegel per node
    ├── CalcBewerkingen           machine head + setup row + step rows
    ├── CalcUitbestedingen        external rows
    ├── CalcNodeModal             add/edit modal for machine and external only
    └── MaterialPickerModal       the one material picker: add ("Materiaal kiezen")
                                  and change (double-click a row, `huidig`)
```

Helpers without JSX live in `calc-helpers.ts` (tested): `leesGetal`/`toonGetal`
(comma decimals), `duurTekst`, `materialName`, `hoofdmateriaal`,
`receptUitCalculatie`, `staffelPrijzen`.

### Saving, lock and read-only (2026-10-23)

- **Read** from the server (`articlesApi.haal`), not from the browser copy in
  `sm_articles`. If the server can't be reached the copy is shown, marked, and
  read-only.
- **Save** 0.4 s after the last change (`articlesApi.opslaan`), one request at a
  time. The status says "Bezig met opslaan…" from the first keystroke and turns
  green only after the server answered. On failure the input stays on screen,
  the status turns red with "Opnieuw opslaan", and one `meldFout` per series
  (removed again once a retry succeeds). Leaving the page within the 0.4 s
  saves immediately; closing the tab with unsaved work asks first.
- **Recipe** follows the calculation (`receptUitCalculatie`): the first
  non-exoot material row is the recipe; removing the last one clears it.
- **Lock**: the first to open the article edits; later visitors see
  "<naam> heeft dit artikel open: je kijkt mee", everything sits in a disabled
  `fieldset.ad-slot`, and clicking a locked control explains why
  (`zegWaaromDicht`, on `pointerdown` because disabled controls get no click).
  When the holder leaves, the viewer gets the lock within ~5 s.
- **Numbers** in the calculator are `AcalcNum`: a text input with comma
  decimals and arrow up/down, never `type="number"` (that follows the browser
  locale and showed "3.71").
- **Delete** always offers "Ongedaan maken" (8 s), back at the same position.

---

## The add/edit modal pattern (`NodeEditModal`)

Machine and external rows share **one** modal component (`CalcNodeModal`) and
**one** state shape. A material row never uses it: adding and changing a
material both go through `MaterialPickerModal` (2026-10-23; there was a second,
older material dialog without the bar loader).

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
  Triggered by **double-clicking the row**, also on the name. The pencil only
  unlocks the name field for typing.
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
  `title="Naam bewerken"`, unlocks the name) goes **before** the trash
  (`Prullenbak`, `title="<Type> verwijderen"`, `kit.verwijder(node, '<Type>')`,
  which offers "Ongedaan maken"). Apply this order to any new row type.
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
