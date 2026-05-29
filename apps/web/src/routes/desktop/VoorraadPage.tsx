import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { Drawer, Modal, SegmentedControl, NumberInput, Textarea, Stack, Group, Button, Text, Select as MantineSelect } from '@mantine/core'
import {
  IconDownload, IconScan, IconPlus, IconAlertTriangle,
  IconPackage, IconLayersLinked, IconArrowUp, IconArrowDown,
  IconCircle, IconSquare, IconMinus, IconTestPipe, IconX,
  IconChevronRight, IconFilter, IconLayoutGrid, IconList,
  IconEdit, IconTrash, IconArrowsExchange, IconFlame,
} from '@tabler/icons-react'
import { rawMaterialsApi, formatDimensions, formatLocation, MOCK_MATERIALS } from '../../api/raw-materials'
import { RawMaterialForm } from '../../components/raw-materials/RawMaterialForm'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import type { RawMaterialRow } from '../../api/raw-materials'


const MOCK_HISTORY = [
  { d: '26 mei', who: 'ONT-2026-0418', delta: +6000, k: 'Binnen geboekt', nr: 'Tata Steel NL' },
  { d: '24 mei', who: 'WO-2026-0331',  delta:  -300, k: 'Uitgegeven',     nr: 'Order #12044'  },
  { d: '22 mei', who: 'WO-2026-0327',  delta:  -200, k: 'Uitgegeven',     nr: 'Order #12031'  },
  { d: '18 mei', who: '—',             delta:  +150, k: 'Correctie',      nr: 'Voorraadcorrectie' },
  { d: '14 mei', who: 'WO-2026-0312',  delta:  -500, k: 'Uitgegeven',     nr: 'Order #12005'  },
]

// ── helpers ───────────────────────────────────────────────────────────────────
// v = remaining mm, min = threshold mm, orig = original length mm
function statusFor(v: number, min: number, orig: number) {
  if (v === 0)              return { tag: 'uit',  label: 'Verbruikt',   cls: 'danger' }
  if (v < min)              return { tag: 'laag', label: 'Kort',        cls: 'warn'   }
  if (v >= orig * 0.85)     return { tag: 'vol',  label: 'Volledig',    cls: 'info'   }
  return                           { tag: 'ok',   label: 'In gebruik',  cls: 'ok'     }
}

/** Format mm as "x,xxx m" (3 decimal places, Dutch locale) */
function fmm(mm: number) {
  return (mm / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 3 }) + ' m'
}

function formatRelative(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'vandaag'
  if (d === 1) return 'gisteren'
  if (d < 7)  return `${d}d geleden`
  if (d < 30) return `${Math.floor(d / 7)}w geleden`
  return `${Math.floor(d / 30)}m geleden`
}

function exportToCSV(rows: RawMaterialRow[]) {
  const headers = ['Code', 'Profiel', 'Kwaliteit', 'Afmeting', 'Lengte orig (mm)', 'Resterend (mm)', 'Min drempel (mm)', 'Gewicht (kg)', 'Locatie']
  const lines = rows.map(r => [
    r.code, r.profile.name, r.grade.name,
    formatDimensions(r.profile, r.dimensions),
    r.lengthMm, r.currentStock, r.minStock ?? '',
    r.weightKg.toFixed(3), formatLocation(r.locationSlot),
  ].map(v => `"${v}"`).join(';'))
  const csv = '﻿' + [headers.join(';'), ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `voorraad-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── profile glyph ─────────────────────────────────────────────────────────────
function TypeGlyph({ volumeFormula, size = 16 }: { volumeFormula: string; size?: number }) {
  switch (volumeFormula) {
    case 'round':  return <IconCircle   size={size} />
    case 'square': return <IconSquare   size={size} />
    case 'tube':   return <IconTestPipe size={size} />
    default:       return <IconMinus    size={size} />
  }
}

// ── sort helpers ──────────────────────────────────────────────────────────────
type SortKey = 'code' | 'grade' | 'profile' | 'afmeting' | 'lengthMm' | 'currentStock' | 'locatie' | 'updatedAt'

function sortVal(row: RawMaterialRow, key: SortKey): string | number {
  switch (key) {
    case 'code':         return row.code
    case 'grade':        return row.grade.name
    case 'profile':      return row.profile.name
    case 'afmeting':     return formatDimensions(row.profile, row.dimensions)
    case 'lengthMm':     return Number(row.lengthMm)
    case 'currentStock': return Number(row.currentStock)
    case 'locatie':      return formatLocation(row.locationSlot)
    case 'updatedAt':    return row.updatedAt
  }
}

function applySort(data: RawMaterialRow[], key: SortKey | null, dir: 'asc' | 'desc') {
  if (!key) return data
  return [...data].sort((a, b) => {
    const va = sortVal(a, key), vb = sortVal(b, key)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb : String(va).localeCompare(String(vb), 'nl')
    return dir === 'asc' ? cmp : -cmp
  })
}

function SortTh({ k, sort, onSort, align, style, children }: {
  k: SortKey; sort: { key: SortKey | null; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void; align?: string; style?: React.CSSProperties; children: React.ReactNode
}) {
  const active = sort.key === k
  return (
    <th style={{ textAlign: (align as any) || 'left', ...style }} onClick={() => onSort(k)}>
      <span className="sort">
        {children}
        {active && (sort.dir === 'asc' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />)}
      </span>
    </th>
  )
}

function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  const active = value !== ''
  const opt = options.find(([v]) => v === value)
  return (
    <label className={`st-chip${active ? ' active' : ''}`}>
      {!active && <IconPlus size={11} />}
      <span>{label}</span>
      {active && <span className="chip-val">: {opt?.[1]}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {active && <span className="chip-x" onClick={(e) => { e.preventDefault(); onChange('') }}>×</span>}
    </label>
  )
}

// ── top-verbruik drawer ───────────────────────────────────────────────────────
// Mock mutation counts per material (until real history is available)
const MOCK_MUTATION_COUNTS: Record<string, number> = {
  m1: 14, m2: 9, m3: 3, m4: 11, m5: 6, m6: 2, m7: 7,
}

function TopVerbruikDrawer({ rows, onClose }: { rows: RawMaterialRow[]; onClose: () => void }) {
  const [tab, setTab] = useState<'lengte' | 'mutaties'>('lengte')

  const byLength = [...rows]
    .map(r => ({ r, consumed: Number(r.lengthMm) - Number(r.currentStock) }))
    .sort((a, b) => b.consumed - a.consumed)
    .slice(0, 10)

  const byMutations = [...rows]
    .map(r => ({ r, count: MOCK_MUTATION_COUNTS[r.id] ?? Math.floor((Number(r.lengthMm) - Number(r.currentStock)) / 500 + 1) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const items = tab === 'lengte' ? byLength : byMutations

  return (
    <>
      <div className="st-drawer-scrim" onClick={onClose} />
      <aside className="st-drawer" style={{ width: 460 }}>
        <div className="st-drawer-hd">
          <div style={{ flex: 1 }}>
            <div className="ttl">Meest verbruikt</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              Top 10 materialen op verbruik
            </div>
          </div>
          <button className="st-icon-btn" onClick={onClose}><IconX size={16} /></button>
        </div>

        <div className="st-drawer-bd">
          {/* tab toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-sidebar)', borderRadius: 6, padding: 4 }}>
            {(['lengte', 'mutaties'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '5px 0', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: tab === t ? 'var(--bg-2)' : 'transparent',
                  color: tab === t ? 'var(--text)' : 'var(--text-3)',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                  transition: 'all .15s',
                }}
              >
                {t === 'lengte' ? 'Op lengte (mm)' : 'Op mutaties'}
              </button>
            ))}
          </div>

          {/* list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map(({ r, ...vals }, i) => {
              const consumed = tab === 'lengte' ? (vals as { consumed: number }).consumed : undefined
              const count    = tab === 'mutaties' ? (vals as { count: number }).count : undefined
              const orig     = Number(r.lengthMm)
              const pct      = orig > 0 && consumed != null ? Math.min(100, (consumed / orig) * 100) : 0

              return (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr auto',
                  gap: 10, alignItems: 'center',
                  padding: '10px 12px',
                  background: i % 2 === 0 ? 'var(--bg-sidebar)' : 'transparent',
                  borderRadius: 6,
                }}>
                  {/* rank */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: i < 3 ? 'var(--accent)' : 'var(--text-4)',
                    textAlign: 'center',
                  }}>#{i + 1}</span>

                  {/* info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                        {r.profile.name} {formatDimensions(r.profile, r.dimensions)}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-4)' }}>{r.code}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{r.grade.name}</div>
                    {tab === 'lengte' && (
                      <div style={{ marginTop: 5, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                    )}
                  </div>

                  {/* metric */}
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {tab === 'lengte' ? (
                      <>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                          {fmm(consumed!)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{Math.round(pct)}% van orig.</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                          {count} ×
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>mutaties</div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}

            {items.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
                Geen verbruiksdata beschikbaar
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}

// ── mutatie modal ─────────────────────────────────────────────────────────────
function MutatieModal({ row, opened, onClose }: {
  row: RawMaterialRow | null; opened: boolean; onClose: () => void
}) {
  const qc = useQueryClient()
  const [type, setType]    = useState<string>('toevoegen')
  const [lengte, setLengte] = useState<number | string>('')
  const [reden, setReden]  = useState('')

  const adjustMut = useMutation({
    mutationFn: ({ id, newStock }: { id: string; newStock: number }) =>
      rawMaterialsApi.adjustStock(id, newStock),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      const mm = Number(lengte)
      const mStr = (mm / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 3 })
      const label2 = type === 'toevoegen' ? 'Toevoegen' : type === 'afboeken' ? 'Afboeken' : 'Correctie'
      notifications.show({
        color: 'green',
        title: 'Mutatie verwerkt',
        message: `${label2}: nieuw resterend ${fmm(vars.newStock)}`,
      })
      setLengte('')
      setReden('')
      onClose()
    },
    onError: () => notifications.show({ color: 'red', message: 'Mutatie mislukt' }),
  })

  if (!row) return null

  const safeRow     = row
  const label       = type === 'toevoegen' ? 'Toevoegen' : type === 'afboeken' ? 'Afboeken' : 'Corrigeren'
  const remainingMm = Number(safeRow.currentStock)   // remaining length of this piece
  const originalMm  = Number(safeRow.lengthMm)       // original full length

  function handleSubmit() {
    const mm = Number(lengte)
    if (mm <= 0 || isNaN(mm)) {
      notifications.show({ color: 'red', message: 'Voer een geldige lengte in' })
      return
    }

    let newStock: number
    if (type === 'toevoegen') {
      // Add: no upper cap — receiving more material is valid
      newStock = remainingMm + mm
    } else if (type === 'afboeken') {
      // Deduct: floor at 0
      newStock = Math.max(remainingMm - mm, 0)
    } else {
      // Correctie: direct new total, only floor at 0
      newStock = Math.max(mm, 0)
    }

    adjustMut.mutate({ id: safeRow.id, newStock })
  }

  return (
    <>
      <div className="st-drawer-scrim" onClick={onClose} />
      <aside className="st-drawer" style={{ width: 420 }}>
        {/* header */}
        <div className="st-drawer-hd">
          <div style={{ flex: 1 }}>
            <div className="ttl">Voorraadmutatie</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {safeRow.code} · {safeRow.profile.name} {formatDimensions(safeRow.profile, safeRow.dimensions)}
            </div>
          </div>
          <button className="st-icon-btn" onClick={onClose}><IconX size={16} /></button>
        </div>

        {/* body */}
        <div className="st-drawer-bd">
          <Stack gap="md">
            <div className="st-field">
              <label style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)' }}>
                Type mutatie
              </label>
              <SegmentedControl
                value={type}
                onChange={setType}
                data={[
                  { label: 'Toevoegen', value: 'toevoegen' },
                  { label: 'Afboeken',  value: 'afboeken'  },
                  { label: 'Correctie', value: 'correctie' },
                ]}
                fullWidth
                mt={6}
              />
            </div>

            {/* current length stat */}
            <div style={{ background: 'var(--bg-sidebar)', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', marginBottom: 4 }}>
                Resterend
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--text)' }}>
                {fmm(remainingMm)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                van {fmm(originalMm)} origineel · {Math.round(remainingMm / originalMm * 100)}% over
              </div>
            </div>

            <NumberInput
              label={type === 'correctie' ? 'Nieuwe totaallengte (mm)' : 'Lengte (mm)'}
              description={type !== 'correctie' ? `Voer de lengte in meters: 1 m = 1000 mm` : undefined}
              placeholder="bijv. 6000"
              value={lengte}
              onChange={setLengte}
              min={0}
              allowDecimal
              decimalScale={1}
              size="sm"
              suffix=" mm"
            />

            <MantineSelect
              label="Locatie"
              defaultValue={formatLocation(safeRow.locationSlot)}
              data={[
                'Hal A · Stelling 01', 'Hal A · Stelling 02', 'Hal A · Stelling 03',
                'Hal B · Vak 12', 'Hal B · Vak 14', 'Hal C · Buitenopslag',
              ]}
              size="sm"
            />

            <Textarea
              label="Reden / opmerking"
              placeholder="Bijv. ontvangst van leverancier, correctie na telling…"
              value={reden}
              onChange={(e) => setReden(e.currentTarget.value)}
              autosize
              minRows={2}
              size="sm"
            />
          </Stack>
        </div>

        {/* footer */}
        <div className="st-drawer-ft">
          <Button variant="default" size="xs" onClick={onClose}>Annuleren</Button>
          <Button size="xs" loading={adjustMut.isPending} onClick={handleSubmit}>{label}</Button>
        </div>
      </aside>
    </>
  )
}

// ── item detail drawer ────────────────────────────────────────────────────────
function ItemDrawer({ row, onClose, onEdit, onMutatie }: {
  row: RawMaterialRow; onClose: () => void; onEdit: () => void; onMutatie: () => void
}) {
  const remaining = Number(row.currentStock)          // mm remaining
  const min       = Number(row.minStock) || 0         // threshold mm
  const original  = Number(row.lengthMm)              // original mm
  const cut       = original - remaining              // mm already cut
  const st        = statusFor(remaining, min, original)
  const pct       = original > 0 ? Math.min(100, Math.max(0, (remaining / original) * 100)) : 0
  const lvlCls    = st.cls === 'ok' || st.cls === 'info' ? '' : st.cls

  return (
    <>
      <div className="st-drawer-scrim" onClick={onClose} />
      <aside className="st-drawer">

        {/* ── header ── */}
        <div className="st-drawer-hd">
          <div className="st-type-pic" style={{ width: 40, height: 40, borderRadius: 8 }}>
            <TypeGlyph volumeFormula={row.profile.volumeFormula} size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ttl" style={{ fontSize: 16 }}>
              {row.profile.name} · {formatDimensions(row.profile, row.dimensions)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span className="cell-mono" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{row.code}</span>
              <span style={{ color: 'var(--text-4)' }}>·</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{row.grade.name}</span>
              <span className={`st-badge ${st.cls}`} style={{ marginLeft: 2 }}>
                <span className="dot" />{st.label}
              </span>
            </div>
          </div>
          <button className="st-icon-btn" onClick={onClose}><IconX size={16} /></button>
        </div>

        <div className="st-drawer-bd">

          {/* ── stat tiles ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { lbl: 'Resterend',  val: fmm(remaining), foot: `${Math.round(pct)}% van origineel` },
              { lbl: 'Gesneden',   val: fmm(cut),        foot: 'al verwerkt'                       },
              { lbl: 'Origineel',  val: fmm(original),   foot: 'beginlengte staf'                  },
            ].map(t => (
              <div key={t.lbl} className="st-stat">
                <div className="st-stat-lbl">{t.lbl}</div>
                <div className="st-stat-val" style={{ fontSize: 15 }}>{t.val}</div>
                <div className="st-stat-foot"><span>{t.foot}</span></div>
              </div>
            ))}
          </div>

          {/* ── level bar ── */}
          <div style={{ marginBottom: 20, padding: '12px 14px', background: 'var(--bg-sidebar)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: 'var(--text-3)' }}>
              <span>Resterend</span>
              <span className="cell-mono">{fmm(remaining)} <span style={{ color: 'var(--text-4)' }}>/ {fmm(original)} (min {fmm(min)})</span></span>
            </div>
            <div className={`st-lvl${lvlCls ? ` ${lvlCls}` : ''}`} style={{ minWidth: 'unset' }}>
              <div className="st-lvl-bar" style={{ height: 6 }}><i style={{ width: `${pct}%` }} /></div>
            </div>
          </div>

          {/* ── details ── */}
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 10 }}>Details</div>
          <dl className="st-kv" style={{ marginBottom: 20 }}>
            <dt>Code</dt>       <dd className="cell-mono">{row.code}</dd>
            <dt>Kwaliteit</dt>  <dd>{row.grade.name}</dd>
            <dt>Profiel</dt>    <dd>{row.profile.name}</dd>
            <dt>Afmeting</dt>   <dd className="cell-mono">{formatDimensions(row.profile, row.dimensions)}</dd>
            <dt>Orig. lengte</dt><dd className="cell-mono">{Number(row.lengthMm).toLocaleString('nl-NL')} mm</dd>
            <dt>Resterend</dt>  <dd className="cell-mono">{remaining.toLocaleString('nl-NL')} mm</dd>
            <dt>Gewicht</dt>    <dd className="cell-mono">{(row.weightKg * remaining / original).toFixed(2)} kg</dd>
            <dt>Min drempel</dt><dd className="cell-mono">{min} mm</dd>
            <dt>Locatie</dt>    <dd>{formatLocation(row.locationSlot)}</dd>
            <dt>Laatste mutatie</dt><dd>{formatRelative(row.updatedAt)}</dd>
          </dl>

          {/* ── history ── */}
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 2 }}>Historie</div>
          <div>
            {MOCK_HISTORY.map((r, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '48px 1fr auto',
                gap: 12, alignItems: 'center',
                padding: '10px 0', borderTop: '1px solid var(--border)',
              }}>
                <span className="cell-muted cell-mono" style={{ fontSize: 12 }}>{r.d}</span>
                <div>
                  <div className="cell-strong" style={{ fontSize: 13 }}>{r.k}</div>
                  <div className="cell-muted cell-mono" style={{ fontSize: 11.5, marginTop: 1 }}>{r.who} · {r.nr}</div>
                </div>
                <span className="cell-mono" style={{ fontWeight: 600, fontSize: 13, color: r.delta > 0 ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                  {r.delta > 0 ? '+' : ''}{r.delta.toLocaleString('nl-NL')} mm
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── footer ── */}
        <div className="st-drawer-ft">
          <button
            className="st-btn ghost"
            style={{ marginRight: 'auto' }}
            onClick={() => notifications.show({ message: 'Volledige geschiedenis — binnenkort beschikbaar' })}
          >
            Geschiedenis
          </button>
          <button className="st-btn" onClick={onEdit}>
            <IconEdit size={14} />Bewerken
          </button>
          <button className="st-btn primary" onClick={onMutatie}>
            <IconArrowsExchange size={14} />Mutatie
          </button>
        </div>
      </aside>
    </>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export function VoorraadPage() {
  const qc = useQueryClient()
  const [q, setQ]           = useState('')
  const [grade, setGrade]   = useState('')
  const [type, setType]     = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort]     = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: 'code', dir: 'asc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerRow, setDrawerRow]   = useState<RawMaterialRow | null>(null)
  const [addOpen, setAddOpen]       = useState(false)
  const [editItem, setEditItem]     = useState<RawMaterialRow | null>(null)
  const [mutatieRow, setMutatieRow] = useState<RawMaterialRow | null>(null)
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<RawMaterialRow | null>(null)
  const [topOpen, setTopOpen]       = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })
  const { data: gradesData }   = useQuery({ queryKey: ['grades'],   queryFn: gradesApi.list   })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })

  const deleteMutation = useMutation({
    mutationFn: rawMaterialsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      notifications.show({ color: 'green', message: 'Materiaal verwijderd' })
    },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
  })

  const source = data?.data?.length ? data.data : MOCK_MATERIALS

  const filtered = useMemo(() => {
    let f = source
    if (q.trim()) {
      const Q = q.toLowerCase()
      f = f.filter(r =>
        r.code.toLowerCase().includes(Q) ||
        r.grade.name.toLowerCase().includes(Q) ||
        r.profile.name.toLowerCase().includes(Q) ||
        formatLocation(r.locationSlot).toLowerCase().includes(Q)
      )
    }
    if (grade)  f = f.filter(r => r.grade.name === grade)
    if (type)   f = f.filter(r => r.profile.name === type)
    if (status) f = f.filter(r => {
      const v = Number(r.currentStock), m = Number(r.minStock) || 0, orig = Number(r.lengthMm)
      return statusFor(v, m, orig).tag === status
    })
    return applySort(f, sort.key, sort.dir)
  }, [source, q, grade, type, status, sort])

  const stats = useMemo(() => {
    // totalKg: weight proportional to remaining length
    const totalKg = source.reduce((s, r) => {
      const orig = Number(r.lengthMm), rem = Number(r.currentStock)
      return s + (orig > 0 ? r.weightKg * rem / orig : 0)
    }, 0)
    const low = source.filter(r => {
      const v = Number(r.currentStock), m = Number(r.minStock) || 0
      return v > 0 && v < m
    }).length
    const out = source.filter(r => Number(r.currentStock) === 0).length
    // top consumed row by length
    const topRow = [...source]
      .map(r => ({ r, consumed: Number(r.lengthMm) - Number(r.currentStock) }))
      .sort((a, b) => b.consumed - a.consumed)[0] ?? null
    return { totalKg, skus: source.length, low, out, topRow }
  }, [source])

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))
  const toggleAll = () => {
    const next = new Set(selected)
    allSelected ? filtered.forEach(r => next.delete(r.id)) : filtered.forEach(r => next.add(r.id))
    setSelected(next)
  }
  const toggleOne = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  function handleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  function handleDelete(row: RawMaterialRow, e: React.MouseEvent) {
    e.stopPropagation()
    setDeleteConfirmRow(row)
  }

  function confirmDelete() {
    if (!deleteConfirmRow) return
    const row = deleteConfirmRow
    setDeleteConfirmRow(null)
    deleteMutation.mutate(row.id)
  }

  function openMutatie(row: RawMaterialRow) {
    setDrawerRow(null)
    setMutatieRow(row)
  }

  const uniqueGrades   = [...new Set([...(gradesData?.data ?? []).map(g => g.name),   ...source.map(r => r.grade.name)])]
  const uniqueProfiles = [...new Set([...(profilesData?.data ?? []).map(p => p.name), ...source.map(r => r.profile.name)])]

  return (
    <>
      {/* page header */}
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Voorraad</div>
          <div className="st-page-sub">Actuele stand van alle materialen op locatie</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn" onClick={() => exportToCSV(filtered)}>
            <IconDownload size={14} />Exporteer
          </button>
          <button className="st-btn" onClick={() => notifications.show({ message: 'Scan-modus — binnenkort beschikbaar' })}>
            <IconScan size={14} />Scan
          </button>
          <button className="st-btn primary" onClick={() => setAddOpen(true)}>
            <IconPlus size={14} />Toevoegen
          </button>
        </div>
      </div>

      {/* stats */}
      <div className="st-stats">
        <div className="st-stat">
          <div className="st-stat-lbl"><IconPackage size={13} />Totaal gewicht</div>
          <div className="st-stat-val">
            {(stats.totalKg / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}
            <span className="unit"> ton</span>
          </div>
          <div className="st-stat-foot"><span className="delta-up">↗ 3,2%</span> <span>t.o.v. vorige week</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl"><IconLayersLinked size={13} />Artikelen</div>
          <div className="st-stat-val">{stats.skus}</div>
          <div className="st-stat-foot"><span>{stats.skus - stats.out} met restlengte</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl" style={{ color: 'var(--warning)' }}><IconAlertTriangle size={13} />Te kort</div>
          <div className="st-stat-val">{stats.low}</div>
          <div className="st-stat-foot"><span className="delta-down">↗ 2</span> <span>sinds gisteren</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl" style={{ color: 'var(--danger)' }}><IconAlertTriangle size={13} />Niet op voorraad</div>
          <div className="st-stat-val">{stats.out}</div>
          <div className="st-stat-foot"><span>bestellingen lopend</span></div>
        </div>
        <div
          className="st-stat"
          onClick={() => setTopOpen(true)}
          style={{ cursor: 'pointer' }}
          title="Bekijk top verbruikers"
        >
          <div className="st-stat-lbl" style={{ color: 'var(--accent)' }}><IconFlame size={13} />Meest verbruikt</div>
          <div className="st-stat-val" style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stats.topRow
              ? `${stats.topRow.r.profile.name} ${formatDimensions(stats.topRow.r.profile, stats.topRow.r.dimensions)}`
              : '—'}
          </div>
          <div className="st-stat-foot">
            <span>{stats.topRow ? fmm(stats.topRow.consumed) + ' verbruikt' : 'geen data'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--accent)' }}>Bekijk top →</span>
          </div>
        </div>
      </div>

      {/* toolbar */}
      <div className="st-toolbar">
        <div className="st-search">
          <IconPackage size={14} />
          <input
            placeholder="Zoek code, kwaliteit of locatie…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="kbd">⌘K</span>
        </div>
        <FilterChip label="Type"     value={type}   options={[['', 'Alle types'], ...uniqueProfiles.map(p => [p, p] as [string, string])]} onChange={setType} />
        <FilterChip label="Kwaliteit" value={grade}  options={[['', 'Alle'],       ...uniqueGrades.map(g => [g, g]   as [string, string])]} onChange={setGrade} />
        <FilterChip label="Status"   value={status} options={[['', 'Alle'], ['ok', 'Op voorraad'], ['laag', 'Laag'], ['uit', 'Uit'], ['vol', 'Vol']]} onChange={setStatus} />
        <div style={{ flex: 1 }} />
        <button className="st-btn ghost sm" onClick={() => notifications.show({ message: 'Extra filters — binnenkort beschikbaar' })}>
          <IconFilter size={13} />Meer filters
        </button>
        <span className="st-sep-v" />
        <button className="st-icon-btn" title="Tegels" onClick={() => notifications.show({ message: 'Tegelweergave — binnenkort beschikbaar' })}>
          <IconLayoutGrid size={14} />
        </button>
        <button className="st-btn sm"><IconList size={13} /></button>
      </div>

      {/* table */}
      <div className="st-table-wrap">
        <div className="st-tbl-scroll">
          {isLoading ? (
            <div className="st-empty">Laden…</div>
          ) : (
            <table className="st-tbl">
              <thead>
                <tr>
                  <th className="col-checkbox">
                    <span className="st-ck" data-on={allSelected} onClick={toggleAll} />
                  </th>
                  <SortTh k="code"         sort={sort} onSort={handleSort} style={{ width: 90 }}>Code</SortTh>
                  <SortTh k="profile"      sort={sort} onSort={handleSort}>Artikel</SortTh>
                  <SortTh k="grade"        sort={sort} onSort={handleSort}>Kwaliteit</SortTh>
                  <SortTh k="afmeting"     sort={sort} onSort={handleSort}>Afmeting</SortTh>
                  <th>Afwerking</th>
                  <SortTh k="currentStock" sort={sort} onSort={handleSort} align="right">Resterend</SortTh>
                  <th style={{ minWidth: 160 }}>Niveau</th>
                  <SortTh k="locatie"      sort={sort} onSort={handleSort}>Locatie</SortTh>
                  <SortTh k="updatedAt"    sort={sort} onSort={handleSort}>Laatste mutatie</SortTh>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const remaining = Number(row.currentStock)
                  const original  = Number(row.lengthMm)
                  const min       = Number(row.minStock) || 0
                  const st        = statusFor(remaining, min, original)
                  const pct       = original > 0 ? Math.min(100, (remaining / original) * 100) : 0
                  const lvlCls    = st.cls === 'ok' || st.cls === 'info' ? '' : st.cls

                  return (
                    <tr key={row.id} data-selected={selected.has(row.id)} onClick={() => setDrawerRow(row)}>
                      <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
                        <span className="st-ck" data-on={selected.has(row.id)} onClick={() => toggleOne(row.id)} />
                      </td>
                      <td>
                        <span className="cell-mono cell-strong" style={{ fontSize: 12 }}>{row.code}</span>
                      </td>
                      <td>
                        <div className="st-art-cell">
                          <div className="st-type-pic">
                            <TypeGlyph volumeFormula={row.profile.volumeFormula} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="st-art-name">{row.profile.name}</div>
                            <div className="st-art-desc">L{Number(row.lengthMm).toLocaleString('nl-NL')} mm</div>
                          </div>
                        </div>
                      </td>
                      <td className="cell-mono">{row.grade.name}</td>
                      <td className="cell-mono cell-muted">{formatDimensions(row.profile, row.dimensions)}</td>
                      <td><span className="cell-muted" style={{ fontSize: 12 }}>Blank</span></td>
                      <td className="cell-num cell-strong cell-mono" style={{ fontSize: 12 }}>{fmm(remaining)}</td>
                      <td>
                        <div className={`st-lvl${lvlCls ? ` ${lvlCls}` : ''}`}>
                          <div className="st-lvl-bar"><i style={{ width: `${pct}%` }} /></div>
                          <span className="st-lvl-num">{Math.round(pct)}%</span>
                        </div>
                      </td>
                      <td><span className="cell-muted">{formatLocation(row.locationSlot)}</span></td>
                      <td>
                        <span className={`st-badge ${st.cls}`} style={{ marginRight: 8 }}><span className="dot" />{st.label}</span>
                        <span className="cell-muted" style={{ fontSize: 11.5 }}>{formatRelative(row.updatedAt)}</span>
                      </td>
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <button
                            className="st-icon-btn"
                            title="Mutatie boeken"
                            onClick={() => openMutatie(row)}
                          >
                            <IconArrowsExchange size={14} />
                          </button>
                          <button
                            className="st-icon-btn"
                            title="Bewerken"
                            onClick={() => setEditItem(row)}
                          >
                            <IconEdit size={14} />
                          </button>
                          <button
                            className="st-icon-btn danger"
                            title="Verwijderen"
                            onClick={(e) => handleDelete(row, e)}
                            disabled={deleteMutation.isPending}
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={11} className="st-empty">Geen artikelen gevonden voor deze filters.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="st-tbl-foot">
          <span>{filtered.length} van {source.length} artikelen</span>
          {selected.size > 0 && (
            <>
              <span style={{ color: 'var(--text)' }}>· {selected.size} geselecteerd</span>
              <button className="st-btn ghost sm" onClick={() => notifications.show({ message: `${selected.size} artikelen gereserveerd` })}>Reserveren</button>
              <button className="st-btn ghost sm" onClick={() => notifications.show({ message: 'Verplaatsen — binnenkort beschikbaar' })}>Verplaatsen</button>
              <button className="st-btn ghost sm" onClick={() => notifications.show({ message: `${selected.size} etiketten aangemaakt` })}>Etiketten</button>
            </>
          )}
          <div className="pager">
            <button className="st-btn ghost sm"><IconChevronRight size={12} style={{ transform: 'rotate(180deg)' }} /></button>
            <span style={{ padding: '0 8px' }}>1 / 1</span>
            <button className="st-btn ghost sm"><IconChevronRight size={12} /></button>
          </div>
        </div>
      </div>

      {/* top verbruik drawer */}
      {topOpen && (
        <TopVerbruikDrawer rows={source} onClose={() => setTopOpen(false)} />
      )}

      {/* detail drawer */}
      {drawerRow && (
        <ItemDrawer
          row={drawerRow}
          onClose={() => setDrawerRow(null)}
          onEdit={() => { setEditItem(drawerRow); setDrawerRow(null) }}
          onMutatie={() => openMutatie(drawerRow)}
        />
      )}

      {/* mutatie modal */}
      <MutatieModal
        row={mutatieRow}
        opened={!!mutatieRow}
        onClose={() => setMutatieRow(null)}
      />

      {/* delete confirm */}
      <Modal
        opened={!!deleteConfirmRow}
        onClose={() => setDeleteConfirmRow(null)}
        title="Materiaal verwijderen"
        size="sm"
        centered
      >
        {deleteConfirmRow && (
          <Stack gap="md">
            <Text size="sm">
              Weet je zeker dat je{' '}
              <strong>{deleteConfirmRow.code} — {deleteConfirmRow.profile.name} {formatDimensions(deleteConfirmRow.profile, deleteConfirmRow.dimensions)}</strong>{' '}
              wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleteConfirmRow(null)}>Annuleren</Button>
              <Button color="red" onClick={confirmDelete}>Verwijderen</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* add / edit forms */}
      <RawMaterialForm mode="add"  opened={addOpen}    onClose={() => setAddOpen(false)} allRows={source} />
      <RawMaterialForm mode="edit" item={editItem ?? undefined} opened={!!editItem} onClose={() => setEditItem(null)} allRows={source} />
    </>
  )
}
