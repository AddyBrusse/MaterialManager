import React, { type ReactNode } from 'react'
import { IconFolder } from '@tabler/icons-react'
import { formatBedrag, formatDate, getProjectSubtotaal } from '../../api/projects'
import { OFFERTE_STATUSES, OB_STATUSES, type Project } from '@stockmanager/shared'

// ── Status display ────────────────────────────────────────────────────────────

export const PROJECT_STATUS_CONFIG: Record<Project['status'], { label: string; cls: string }> = {
  concept:      { label: 'Concept',      cls: 'prj-neutral'     },
  offerte:      { label: 'Offerte',      cls: 'prj-offerte'     },
  bevestigd:    { label: 'Bevestigd',    cls: 'prj-bevestigd'   },
  productie:    { label: 'Productie',    cls: 'prj-productie'   },
  paklijst:     { label: 'Paklijst',     cls: 'prj-paklijst'    },
  verzonden:    { label: 'Verzonden',    cls: 'prj-verzonden'   },
  gefactureerd: { label: 'Gefactureerd', cls: 'prj-factureerd'  },
  on_hold:      { label: 'On Hold',      cls: 'prj-onhold'      },
  geannuleerd:  { label: 'Geannuleerd',  cls: 'prj-geannuleerd' },
}

// Stage index for the mini pipeline (0-based, matching the 7 main stages)
export const STATUS_STAGE: Record<Project['status'], number> = {
  concept: 0, offerte: 1, bevestigd: 2, productie: 3,
  paklijst: 4, verzonden: 5, gefactureerd: 6,
  on_hold: -1, geannuleerd: -1,
}

export function MiniPipeline({ status }: { status: Project['status'] }) {
  const activeIdx = STATUS_STAGE[status]
  return (
    <div className="prj-mp">
      {Array.from({ length: 7 }, (_, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className={`prj-mp-line ${i <= activeIdx ? 'done' : activeIdx === i - 1 ? 'active' : 'pend'}`} />
          )}
          <div className={`prj-mp-step ${i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pend'}`} />
        </React.Fragment>
      ))}
    </div>
  )
}

// ── Column model ──────────────────────────────────────────────────────────────

export interface ProjectColumnCtx {
  klantNaam: (p: Project) => string
  contactNaam: (p: Project) => string
}

export interface ProjectColumn {
  id: string
  /** Header text. */
  label: string
  /** Longer name for the column-settings list, when the header is abbreviated. */
  longLabel?: string
  align?: 'left' | 'right'
  width?: number
  defaultVisible: boolean
  /** Sort key — numbers sort numerically, strings with locale compare. null sorts last. */
  sortValue: (p: Project, ctx: ProjectColumnCtx) => string | number | null
  /** Plain text the global search matches against. */
  searchText: (p: Project, ctx: ProjectColumnCtx) => string
  render: (p: Project, ctx: ProjectColumnCtx) => ReactNode
}

const muted = <span className="cell-muted">—</span>
const txt = (v: string | null | undefined) => (v && v.trim() ? <span>{v}</span> : muted)
const dateCell = (v: string | null) => (v ? <span className="cell-muted">{formatDate(v)}</span> : muted)
/** Date sort key: ISO strings compare correctly as strings; null sorts last. */
const dateSort = (v: string | null) => v ?? null
/** Index both the raw ISO and the Dutch display form, so "2026-07-30" and "30 jul" both hit. */
const dateSearch = (v: string | null) => (v ? `${v} ${formatDate(v)}` : '')
/** Index the raw number too — otherwise only "17.100,00" matches and "17100" finds nothing. */
const moneySearch = (n: number) => (n > 0 ? `${n} ${formatBedrag(n)}` : '')
/** Counts sink like other empties when there's nothing to count (see the sort convention). */
const countSort = (n: number) => (n > 0 ? n : null)

/**
 * Status is a plain String column server-side (no DB enum) and the read path
 * casts it unchecked, so one drifted row must not take the whole list down.
 */
export function statusCfg(status: Project['status']) {
  return PROJECT_STATUS_CONFIG[status] ?? { label: String(status || '—'), cls: 'prj-neutral' }
}
/** Lifecycle position; on_hold/geannuleerd (-1) and unknown sink rather than lead. */
function stageSort(status: Project['status']): number | null {
  const idx = STATUS_STAGE[status]
  return idx === undefined || idx < 0 ? null : idx
}

// Projects are read from an unvalidated JSON.parse of localStorage, so a legacy
// or hand-edited row can be missing arrays entirely — guard rather than throw,
// because searchText runs for every column on every keystroke.
function offertesOf(p: Project) {
  return Array.isArray(p.offertes) ? p.offertes : []
}

/** Accepted offerte if there is one, else the most recent — what the row is "about". */
function currentOfferte(p: Project) {
  const list = offertesOf(p)
  return list.find(o => o.status === 'geaccepteerd') ?? list[list.length - 1] ?? null
}

/** Strictly the newest offerte, accepted or not — what "laatste offerte" means. */
function latestOfferte(p: Project) {
  const list = offertesOf(p)
  return list[list.length - 1] ?? null
}

function artikelCount(p: Project): number {
  return currentOfferte(p)?.regels.length ?? 0
}

function regelTotaal(off: { regels: { totaal: number }[] } | null): number {
  return off ? off.regels.reduce((s, r) => s + r.totaal, 0) : 0
}

const BTW_PCT = 0.21

/** Invoice total when the project has been invoiced (it carries its own btwPct), else derived. */
function bedragInclusief(p: Project): number {
  if (p.factuur) return p.factuur.totaalInclBtw
  const excl = getProjectSubtotaal(p)
  return excl > 0 ? Math.round(excl * (1 + BTW_PCT) * 100) / 100 : 0
}

// Document statuses render as labels and sort by lifecycle position, not
// alphabetically — otherwise "vervallen" outranks "verzonden", which reads
// backwards as a pipeline.
const OFFERTE_STATUS_LABEL: Record<string, string> = {
  concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd', vervallen: 'Vervallen',
}
const OB_STATUS_LABEL: Record<string, string> = { concept: 'Concept', verzonden: 'Verzonden' }
const lifecycleSort = (order: readonly string[], v: string | null | undefined) => {
  if (!v) return null
  const i = order.indexOf(v)
  return i === -1 ? null : i
}

// Every column the projecten table can show. Splitting what used to be one
// "Project" cell (naam + nummer + klantref) into separate columns is the whole
// point — combined cells can't be sorted or scanned independently.
export const PROJECT_COLUMNS: ProjectColumn[] = [
  {
    id: 'nummer', label: 'Projectnr.', width: 130, defaultVisible: true,
    sortValue: p => p.id,
    searchText: p => p.id,
    render: p => <span className="cell-mono cell-strong">{p.id}</span>,
  },
  {
    id: 'naam', label: 'Naam', width: 220, defaultVisible: true,
    sortValue: p => p.naam.toLowerCase(),
    searchText: p => p.naam,
    render: p => (
      <div className="st-art-cell">
        <div className="st-type-pic"><IconFolder size={15} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="st-art-name">{p.naam || <span className="cell-muted">Naamloos</span>}</div>
        </div>
      </div>
    ),
  },
  {
    id: 'klant', label: 'Klant', width: 180, defaultVisible: true,
    sortValue: (p, c) => c.klantNaam(p).toLowerCase(),
    searchText: (p, c) => c.klantNaam(p),
    render: (p, c) => txt(c.klantNaam(p)),
  },
  {
    id: 'contact', label: 'Contact', width: 150, defaultVisible: true,
    sortValue: (p, c) => c.contactNaam(p).toLowerCase(),
    searchText: (p, c) => c.contactNaam(p),
    render: (p, c) => txt(c.contactNaam(p)),
  },
  {
    id: 'klantRef', label: 'Ref. klant', longLabel: 'Referentie klant', width: 150, defaultVisible: true,
    sortValue: p => (p.klantRef ?? '').toLowerCase(),
    searchText: p => p.klantRef ?? '',
    render: p => txt(p.klantRef),
  },
  {
    id: 'status', label: 'Status', width: 130, defaultVisible: true,
    sortValue: p => stageSort(p.status),
    searchText: p => statusCfg(p.status).label,
    render: p => {
      const cfg = statusCfg(p.status)
      return <span className={`st-badge ${cfg.cls}`}><span className="dot" />{cfg.label}</span>
    },
  },
  {
    id: 'voortgang', label: 'Voortgang', width: 110, defaultVisible: true,
    sortValue: p => stageSort(p.status),
    searchText: () => '',
    render: p => <MiniPipeline status={p.status} />,
  },
  {
    id: 'artikelen', label: 'Art.', longLabel: 'Aantal artikelen', align: 'right', width: 60, defaultVisible: true,
    sortValue: p => countSort(artikelCount(p)),
    // A bare count is noise as a search token — "1" would match nearly every row.
    searchText: () => '',
    render: p => <span className="cell-muted">{artikelCount(p) || '—'}</span>,
  },
  {
    id: 'bedragExcl', label: 'Bedrag excl.', longLabel: 'Bedrag excl. btw (geaccepteerde offerte)', align: 'right', width: 120, defaultVisible: true,
    sortValue: p => getProjectSubtotaal(p),
    searchText: p => moneySearch(getProjectSubtotaal(p)),
    render: p => {
      const b = getProjectSubtotaal(p)
      return b > 0 ? <span className="cell-mono">{formatBedrag(b)}</span> : muted
    },
  },
  {
    id: 'bedragIncl', label: 'Bedrag incl.', longLabel: 'Bedrag incl. btw (factuur indien aanwezig)', align: 'right', width: 120, defaultVisible: false,
    sortValue: p => bedragInclusief(p),
    searchText: p => moneySearch(bedragInclusief(p)),
    render: p => {
      const b = bedragInclusief(p)
      return b > 0 ? <span className="cell-mono">{formatBedrag(b)}</span> : muted
    },
  },
  {
    id: 'offerteBedrag', label: 'Offertebedrag', longLabel: 'Offertebedrag (laatste offerte, ook niet-geaccepteerd)', align: 'right', width: 130, defaultVisible: false,
    // Strictly the newest offerte — otherwise this duplicates "Bedrag excl."
    // whenever an accepted offerte exists, under a label promising the latest.
    sortValue: p => regelTotaal(latestOfferte(p)),
    searchText: p => moneySearch(regelTotaal(latestOfferte(p))),
    render: p => {
      const b = regelTotaal(latestOfferte(p))
      return b > 0 ? <span className="cell-mono">{formatBedrag(b)}</span> : muted
    },
  },
  {
    id: 'levertijd', label: 'Levertijd', longLabel: 'Levertijd (afgesproken datum)', width: 120, defaultVisible: true,
    sortValue: p => dateSort(p.levertijdDatum),
    searchText: p => dateSearch(p.levertijdDatum),
    render: p => dateCell(p.levertijdDatum),
  },
  {
    id: 'offerteNr', label: 'Offertenr.', longLabel: 'Offertenummer (geaccepteerd, anders laatste)', width: 130, defaultVisible: true,
    sortValue: p => currentOfferte(p)?.id ?? null,
    searchText: p => currentOfferte(p)?.id ?? '',
    render: p => {
      const off = currentOfferte(p)
      return off ? <span className="cell-mono">{off.id}</span> : muted
    },
  },
  {
    id: 'offerteStatus', label: 'Offertestatus', longLabel: 'Offertestatus (geaccepteerd, anders laatste)', width: 130, defaultVisible: true,
    sortValue: p => lifecycleSort(OFFERTE_STATUSES, currentOfferte(p)?.status),
    searchText: p => {
      const s = currentOfferte(p)?.status
      return s ? OFFERTE_STATUS_LABEL[s] ?? s : ''
    },
    render: p => {
      const s = currentOfferte(p)?.status
      return txt(s ? OFFERTE_STATUS_LABEL[s] ?? s : null)
    },
  },
  {
    id: 'offerteVersie', label: 'Versie', longLabel: 'Offerteversie (geaccepteerd, anders laatste)', align: 'right', width: 70, defaultVisible: false,
    sortValue: p => currentOfferte(p)?.versie ?? null,
    searchText: p => {
      const off = currentOfferte(p)
      return off ? `v${off.versie}` : ''
    },
    render: p => {
      const off = currentOfferte(p)
      return off ? <span className="cell-mono">v{off.versie}</span> : muted
    },
  },
  {
    id: 'offertes', label: 'Offertes', longLabel: 'Aantal offertes', align: 'right', width: 80, defaultVisible: false,
    sortValue: p => countSort(p.offertes?.length ?? 0),
    searchText: () => '',
    render: p => <span className="cell-muted">{p.offertes?.length || '—'}</span>,
  },
  {
    id: 'obNr', label: 'Opdrachtbev.', longLabel: 'Opdrachtbevestiging nr.', width: 140, defaultVisible: false,
    sortValue: p => p.opdrachtbevestiging?.id ?? null,
    searchText: p => p.opdrachtbevestiging?.id ?? '',
    render: p => (p.opdrachtbevestiging ? <span className="cell-mono">{p.opdrachtbevestiging.id}</span> : muted),
  },
  {
    id: 'obStatus', label: 'OB-status', longLabel: 'Opdrachtbevestiging status', width: 110, defaultVisible: false,
    sortValue: p => lifecycleSort(OB_STATUSES, p.opdrachtbevestiging?.status),
    searchText: p => {
      const s = p.opdrachtbevestiging?.status
      return s ? OB_STATUS_LABEL[s] ?? s : ''
    },
    render: p => {
      const s = p.opdrachtbevestiging?.status
      return txt(s ? OB_STATUS_LABEL[s] ?? s : null)
    },
  },
  {
    id: 'productieOrders', label: 'Orders', longLabel: 'Aantal productieorders', align: 'right', width: 80, defaultVisible: false,
    sortValue: p => countSort(p.productieOrders?.length ?? 0),
    searchText: () => '',
    render: p => <span className="cell-muted">{p.productieOrders?.length || '—'}</span>,
  },
  {
    id: 'productieGereed', label: 'Gereed', longLabel: 'Productie gereed (x / y orders)', align: 'right', width: 90, defaultVisible: true,
    // Completion ratio first so "3/3" outranks "1/5", then the absolute count as
    // tiebreaker so "0 / 20" doesn't rank identically to "0 / 1".
    sortValue: p => {
      const total = p.productieOrders?.length ?? 0
      if (total === 0) return null
      const done = p.productieOrders.filter(o => o.status === 'gereed').length
      return (done / total) * 10_000 + Math.min(done, 9_999)
    },
    searchText: () => '',
    render: p => {
      const total = p.productieOrders?.length ?? 0
      if (total === 0) return muted
      const done = p.productieOrders.filter(o => o.status === 'gereed').length
      return (
        <span className={done === total ? 'cell-mono' : 'cell-mono cell-muted'}
              style={done === total ? { color: 'var(--success)' } : undefined}>
          {done} / {total}
        </span>
      )
    },
  },
  {
    id: 'paklijstNr', label: 'Paklijst', longLabel: 'Paklijstnummer', width: 130, defaultVisible: false,
    sortValue: p => p.paklijst?.id ?? null,
    searchText: p => p.paklijst?.id ?? '',
    render: p => (p.paklijst ? <span className="cell-mono">{p.paklijst.id}</span> : muted),
  },
  {
    id: 'paklijstVerzonden', label: 'Verzonden', longLabel: 'Paklijst verzonden op', width: 120, defaultVisible: false,
    sortValue: p => dateSort(p.paklijst?.verzondenOp ?? null),
    searchText: p => dateSearch(p.paklijst?.verzondenOp ?? null),
    render: p => dateCell(p.paklijst?.verzondenOp ?? null),
  },
  {
    id: 'factuurNr', label: 'Factuur', longLabel: 'Factuurnummer', width: 130, defaultVisible: false,
    sortValue: p => p.factuur?.id ?? null,
    searchText: p => p.factuur?.id ?? '',
    render: p => (p.factuur ? <span className="cell-mono">{p.factuur.id}</span> : muted),
  },
  {
    id: 'factuurVervaldatum', label: 'Vervaldatum', longLabel: 'Factuur vervaldatum', width: 120, defaultVisible: false,
    sortValue: p => dateSort(p.factuur?.vervaldatum ?? null),
    searchText: p => dateSearch(p.factuur?.vervaldatum ?? null),
    render: p => dateCell(p.factuur?.vervaldatum ?? null),
  },
  {
    id: 'notities', label: 'Notities', width: 200, defaultVisible: false,
    sortValue: p => (p.notities ?? '').toLowerCase(),
    searchText: p => p.notities ?? '',
    render: p => (p.notities?.trim()
      ? <span className="cell-muted" title={p.notities}>{p.notities}</span>
      : muted),
  },
  {
    id: 'aangemaakt', label: 'Aangemaakt', width: 120, defaultVisible: true,
    sortValue: p => dateSort(p.createdAt),
    searchText: p => dateSearch(p.createdAt),
    render: p => dateCell(p.createdAt),
  },
  {
    id: 'gewijzigd', label: 'Gewijzigd', width: 120, defaultVisible: false,
    sortValue: p => dateSort(p.updatedAt),
    searchText: p => dateSearch(p.updatedAt),
    render: p => dateCell(p.updatedAt),
  },
]

export const COLUMN_BY_ID: Record<string, ProjectColumn> =
  Object.fromEntries(PROJECT_COLUMNS.map(c => [c.id, c]))

// ── Column tints ──────────────────────────────────────────────────────────────
// Low-alpha so a tint reads the same over the light and dark table backgrounds.

export interface ColumnTint { key: string; label: string }

export const COLUMN_TINTS: ColumnTint[] = [
  { key: '',       label: 'Geen'   },
  { key: 'blue',   label: 'Blauw'  },
  { key: 'green',  label: 'Groen'  },
  { key: 'amber',  label: 'Amber'  },
  { key: 'red',    label: 'Rood'   },
  { key: 'purple', label: 'Paars'  },
  { key: 'teal',   label: 'Teal'   },
  { key: 'grey',   label: 'Grijs'  },
]

/**
 * Resolve the saved preference into the ordered list of visible columns.
 * Unknown ids in `order` are dropped and columns missing from it are appended,
 * so adding a column in code never invalidates someone's saved layout.
 */
export function resolveColumns(order: string[], hidden: string[]): ProjectColumn[] {
  const hiddenSet = new Set(hidden)
  const seen = new Set<string>()
  const ordered: ProjectColumn[] = []

  for (const id of order) {
    const col = COLUMN_BY_ID[id]
    if (col && !seen.has(id)) { ordered.push(col); seen.add(id) }
  }
  for (const col of PROJECT_COLUMNS) {
    if (!seen.has(col.id)) ordered.push(col)
  }
  return ordered.filter(c => !hiddenSet.has(c.id))
}

/** The full ordered column list (visible + hidden) — for the settings panel. */
export function resolveAllColumns(order: string[]): ProjectColumn[] {
  const seen = new Set<string>()
  const ordered: ProjectColumn[] = []
  for (const id of order) {
    const col = COLUMN_BY_ID[id]
    if (col && !seen.has(id)) { ordered.push(col); seen.add(id) }
  }
  for (const col of PROJECT_COLUMNS) {
    if (!seen.has(col.id)) ordered.push(col)
  }
  return ordered
}

export const DEFAULT_HIDDEN = PROJECT_COLUMNS.filter(c => !c.defaultVisible).map(c => c.id)
export const DEFAULT_ORDER = PROJECT_COLUMNS.map(c => c.id)
