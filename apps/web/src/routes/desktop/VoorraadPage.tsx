import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { Modal, Stack, Group, Button, Text } from '@mantine/core'
import {
  IconDownload, IconScan, IconPlus, IconAlertTriangle,
  IconPackage, IconLayersLinked, IconArrowUp, IconArrowDown, IconX,
  IconChevronRight, IconFilter, IconLayoutGrid, IconList,
  IconEdit, IconArrowsExchange, IconFlame,
} from '@tabler/icons-react'
import { rawMaterialsApi, formatDimensions, formatLocation } from '../../api/raw-materials'
import { RawMaterialForm } from '../../components/raw-materials/RawMaterialForm'
import { LeverancierPrijzen } from '../../components/inkoop/LeverancierPrijzen'
import { ExootLabel } from '../../components/inkoop/ExootLabel'
import { BestelRegelVenster } from '../../components/inkoop/bestellingen/BestelRegelVenster'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { surfaceFinishesApi } from '../../api/surface-finishes'
import { houdtVast, type ZaagReservation } from '../../api/reservations'
import { movementsApi, MOVEMENT_REASON_LABELS, type StockMovementRow } from '../../api/movements'
import { useReserveringen } from '../../hooks/useReserveringen'
import { useUserPreference } from '../../hooks/useUserPreference'
import { FilterChip, BereikChip } from '../../components/voorraad/FilterChips'
import { aantalInVoorraad, filterVoorraad, filtersActief, leesFilters, LEGE_FILTERS, type VoorraadFilters, type ExootFilter } from '../../components/voorraad/voorraad-filters'
import { groepeerExoten } from '../../components/voorraad/exoot-groepen'
import { ExootGroepRij } from '../../components/voorraad/ExootGroepRij'
import { VoorraadRij } from '../../components/voorraad/VoorraadRij'
import { MutatieModal } from '../../components/voorraad/MutatieModal'
import { statusFor, statusTag, fmm, formatRelative, TypeGlyph } from '../../components/voorraad/weergave'
import type { RawMaterialRow } from '../../api/raw-materials'


// ── helpers ───────────────────────────────────────────────────────────────────
// statusFor, fmm, formatRelative en TypeGlyph staan in components/voorraad/weergave.tsx.

function exportToCSV(rows: RawMaterialRow[]) {
  const headers = ['Code', 'Profiel', 'Kwaliteit', 'Afmeting', 'Afwerking', 'Lengte orig (mm)', 'Resterend (mm)', 'Min drempel (mm)', 'Gewicht (kg)', 'Locatie']
  const lines = rows.map(r => [
    r.code, r.profile.name, r.grade.name,
    formatDimensions(r.profile, r.dimensions), r.surfaceFinish?.name ?? '',
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

// ── sort helpers ──────────────────────────────────────────────────────────────
type SortKey = 'code' | 'grade' | 'profile' | 'afmeting' | 'surfaceFinish' | 'lengthMm' | 'currentStock' | 'reserved' | 'locatie' | 'updatedAt'

function sortVal(row: RawMaterialRow, key: SortKey, reservedByBar: Record<string, number>): string | number {
  switch (key) {
    case 'code':          return row.code
    case 'grade':         return row.grade.name
    case 'profile':       return row.profile.name
    case 'afmeting':      return formatDimensions(row.profile, row.dimensions)
    case 'surfaceFinish': return row.surfaceFinish?.name ?? ''
    case 'lengthMm':      return Number(row.lengthMm)
    case 'currentStock':  return Number(row.currentStock)
    case 'reserved':      return reservedByBar[row.id] ?? 0
    case 'locatie':       return formatLocation(row.locationSlot)
    case 'updatedAt':     return row.updatedAt
  }
}

function applySort(data: RawMaterialRow[], key: SortKey | null, dir: 'asc' | 'desc', reservedByBar: Record<string, number>) {
  if (!key) return data
  return [...data].sort((a, b) => {
    const va = sortVal(a, key, reservedByBar), vb = sortVal(b, key, reservedByBar)
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

// ── top-verbruik drawer ───────────────────────────────────────────────────────
// Alleen op verbruikte lengte. Het tabblad "Op mutaties" toonde verzonnen
// aantallen (een vaste tabel plus een formule uit de lengte) en is op
// 2026-10-23 weggehaald; echte aantallen vragen de mutatiehistorie per staaf.
function TopVerbruikDrawer({ rows, onClose }: { rows: RawMaterialRow[]; onClose: () => void }) {
  const items = [...rows]
    .map(r => ({ r, consumed: Number(r.lengthMm) - Number(r.currentStock) }))
    .sort((a, b) => b.consumed - a.consumed)
    .slice(0, 10)

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
          {/* list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map(({ r, consumed }, i) => {
              const orig = Number(r.lengthMm)
              const pct  = orig > 0 ? Math.min(100, (consumed / orig) * 100) : 0

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
                    <div style={{ marginTop: 5, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                  </div>

                  {/* metric */}
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                      {fmm(consumed)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{Math.round(pct)}% van orig.</div>
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

// ── item detail drawer ────────────────────────────────────────────────────────
/**
 * De voorraadmutaties van één staaf, nieuwste eerst.
 *
 * Toont het verschil, niet alleen de nieuwe stand: een zager wil zien hoeveel
 * eraf ging. Bij een `overwrite` (zoals het afboeken na het zagen) is dat het
 * verschil tussen de vorige en de nieuwe stand.
 */
function MutatieLijst({ itemId }: { itemId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['movements', itemId],
    queryFn: () => movementsApi.listVoorItem(itemId),
  })

  if (isLoading) return <div className="cell-muted" style={{ fontSize: 12, padding: '10px 0' }}>Laden…</div>
  if (!data || data.length === 0) {
    return <div className="cell-muted" style={{ fontSize: 12, padding: '10px 0' }}>Nog geen mutaties</div>
  }

  return (
    <div>
      {data.map((m: StockMovementRow) => {
        const verschil = Number(m.newStock) - Number(m.previousStock)
        return (
          <div key={m.id} style={{
            display: 'grid', gridTemplateColumns: '48px 1fr auto',
            gap: 12, alignItems: 'center',
            padding: '10px 0', borderTop: '1px solid var(--border)',
          }}>
            <span className="cell-muted cell-mono" style={{ fontSize: 12 }}>
              {new Date(m.createdAt).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
            </span>
            <div>
              <div className="cell-strong" style={{ fontSize: 13 }}>{MOVEMENT_REASON_LABELS[m.reason]}</div>
              <div className="cell-muted cell-mono" style={{ fontSize: 11.5, marginTop: 1 }}>
                {m.user?.name ?? '—'}{m.note ? ` · ${m.note}` : ''}
              </div>
            </div>
            <span className="cell-mono" style={{
              fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
              color: verschil > 0 ? 'var(--success)' : verschil < 0 ? 'var(--danger)' : 'var(--text-3)',
            }}>
              {verschil > 0 ? '+' : ''}{verschil.toLocaleString('nl-NL')} mm
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ItemDrawer({ row, barReservations, onClose, onEdit, onMutatie }: {
  row: RawMaterialRow
  barReservations: ZaagReservation[]
  onClose: () => void; onEdit: () => void; onMutatie: () => void
}) {
  const remaining  = Number(row.currentStock)
  const min        = Number(row.minStock) || 0
  const original   = Number(row.lengthMm)
  // Van de server, niet zelf opgeteld: één definitie voor het hele programma.
  const gereserveerd = row.gereserveerdMm
  const vrij         = row.vrijMm
  const st         = statusFor(remaining, min, original)
  const pct        = original > 0 ? Math.min(100, Math.max(0, (remaining / original) * 100)) : 0
  const lvlCls     = st.cls === 'ok' || st.cls === 'info' ? '' : st.cls
  const [bestellen, setBestellen] = useState(false)

  return (
    <>
      {bestellen && (
        <BestelRegelVenster
          onSluit={() => setBestellen(false)}
          vooraf={{
            gradeId: row.gradeId, profileId: row.profileId, dimensions: row.dimensions, lengteMm: original, stuks: 1,
            bron: min > 0 && vrij < min ? 'lage_voorraad' : 'handmatig', rawMaterialId: row.exoot ? row.id : null,
          }}
        />
      )}
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
              {row.exoot
                ? <ExootLabel klant={row.klant} />
                : (
                  <span className={`st-badge ${st.cls}`} style={{ marginLeft: 2 }}>
                    <span className="dot" />{st.label}
                  </span>
                )}
            </div>
          </div>
          <button className="st-icon-btn" onClick={onClose}><IconX size={16} /></button>
        </div>

        <div className="st-drawer-bd">

          {/* ── stat tiles ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              // Drie getallen, zoals elk voorraadsysteem: wat ligt er, wat
              // ligt vast, wat kun je nog vergeven. Vrij is het getal waar een
              // zager op af gaat, dus dat staat naast het fysieke.
              { lbl: 'Fysieke lengte', val: fmm(remaining), foot: `${Math.round(pct)}% van origineel` },
              { lbl: 'Vrij',           val: fmm(vrij), foot: vrij <= 0 ? 'volledig vastgelegd' : 'nog te vergeven', warn: vrij <= 0 },
              { lbl: 'Gereserveerd',   val: gereserveerd > 0 ? fmm(gereserveerd) : '—', foot: gereserveerd > 0 ? `${barReservations.length} reservering(en)` : 'niets ingepland', warn: gereserveerd > 0 },
              { lbl: 'Origineel',      val: fmm(original),   foot: 'beginlengte staf' },
            ].map(t => (
              <div key={t.lbl} className="st-stat">
                <div className="st-stat-lbl" style={t.warn ? { color: 'var(--warning)' } : undefined}>{t.lbl}</div>
                <div className="st-stat-val" style={{ fontSize: 15, color: t.warn ? 'var(--warning)' : undefined }}>{t.val}</div>
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
            <dt>Afwerking</dt>  <dd>{row.surfaceFinish?.name ?? '—'}</dd>
            {row.exoot && <><dt>Exoot voor</dt><dd>{row.klant?.naam ?? '—'}</dd></>}
            {row.exoot && <><dt>Artikel</dt><dd>{row.artikel?.naam ?? '—'}</dd></>}
            <dt>Orig. lengte</dt><dd className="cell-mono">{Number(row.lengthMm).toLocaleString('nl-NL')} mm</dd>
            <dt>Resterend</dt>  <dd className="cell-mono">{remaining.toLocaleString('nl-NL')} mm</dd>
            <dt>Gewicht</dt>    <dd className="cell-mono">{(row.weightKg * remaining / original).toFixed(2)} kg</dd>
            <dt>Min drempel</dt><dd className="cell-mono">{min} mm</dd>
            <dt>Locatie</dt>    <dd>{formatLocation(row.locationSlot)}</dd>
            <dt>Laatste mutatie</dt><dd>{formatRelative(row.updatedAt)}</dd>
          </dl>

          {/* ── reservations ── */}
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 6 }}>
            Reserveringen
            {barReservations.length > 0 && (
              <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, color: 'var(--warning)', background: '#fff7ed', padding: '1px 6px', borderRadius: 10 }}>
                {barReservations.length}
              </span>
            )}
          </div>
          {barReservations.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              Geen openstaande reserveringen
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {barReservations.map(r => (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto',
                  gap: 8, alignItems: 'center',
                  padding: '9px 0', borderTop: '1px solid var(--border)',
                }}>
                  <div>
                    <div className="cell-strong" style={{ fontSize: 12.5 }}>
                      {r.calculatieNr || <span className="cell-muted">Zonder nr.</span>}
                      <span className="cell-muted" style={{ fontWeight: 400 }}> · {r.machine}</span>
                    </div>
                    <div className="cell-muted cell-mono" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {r.pieces} st × {r.werkstukLengte} mm · kerf {r.steekbreedte} mm
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-4)' }}>
                      {new Date(r.createdAt).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 10, fontSize: 10.5, fontWeight: 600, background: r.status === 'in_progress' ? '#fff7ed' : 'var(--bg-chip)', color: r.status === 'in_progress' ? '#c2410c' : 'var(--text-3)' }}>
                        {r.status === 'in_progress' ? 'Bezig' : 'Open'}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="cell-mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--warning)' }}>
                      -{r.sawLength.toLocaleString('nl-NL')} mm
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── leveranciers & prijzen ── */}
          {/* Voor vergelijken en bestellen; de calculatie rekent met de €/kg
              van de kwaliteit (afgesproken 2026-10-06). */}
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 6 }}>Leveranciers &amp; prijzen</div>
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <LeverancierPrijzen
              filter={{ rawMaterialId: row.id, gradeId: row.gradeId }}
              keuze={{ materiaal: { id: row.id, gradeId: row.gradeId, naam: `${row.profile.name} ${formatDimensions(row.profile, row.dimensions)}`, gradeNaam: row.grade.name } }}
              kolom="leverancier"
              leeg="Nog geen leverancier gekoppeld aan dit materiaal of zijn kwaliteit."
            />
          </div>

          {/* ── historie ── */}
          {/* Echte voorraadmutaties. Hier stond een vaste lijst verzonnen
              regels; die verborg juist de mutatie die het afboeken zojuist
              geschreven had, en toonde een ontvangst die nooit bestaan heeft. */}
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 2 }}>Historie</div>
          <MutatieLijst itemId={row.id} />
        </div>

        {/* ── footer ── */}
        <div className="st-drawer-ft">
          {/* De knop "Geschiedenis — binnenkort beschikbaar" stond hier naast
              een lijst die nu de echte mutaties toont; die belofte was al
              ingelost. */}
          <button className="st-btn" onClick={() => setBestellen(true)} title="Deze maat op de bestellijst zetten">
            Op bestellijst
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
  // Vanaf een project (kaart Materiaal, 2026-10-07): alleen de staven die voor
  // dat project vastliggen. Staat in het adres, niet in de bewaarde filters.
  const [zoekParams, setZoekParams] = useSearchParams()
  const voorProject = zoekParams.get('project')
  const wisProject = () => setZoekParams((p) => { const n = new URLSearchParams(p); n.delete('project'); return n }, { replace: true })
  const filterPref = useUserPreference<Partial<VoorraadFilters> | null>('voorraad.filters', null)
  const filters = leesFilters(filterPref.value)
  const zetFilter = <K extends keyof VoorraadFilters>(k: K, v: VoorraadFilters[K]) =>
    filterPref.setValue((p) => ({ ...leesFilters(p), [k]: v }))
  const [sort, setSort]     = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: 'code', dir: 'asc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerRow, setDrawerRow]   = useState<RawMaterialRow | null>(null)
  const [addOpen, setAddOpen]       = useState(false)
  const [editItem, setEditItem]     = useState<RawMaterialRow | null>(null)
  const [mutatieRow, setMutatieRow] = useState<RawMaterialRow | null>(null)
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<RawMaterialRow | null>(null)
  const [topOpen, setTopOpen]       = useState(false)
  // Uitgeklapte exoten (sleutel uit exoot-groepen.ts). Niet bewaard.
  const [uitgeklapt, setUitgeklapt] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })
  const { data: gradesData }   = useQuery({ queryKey: ['grades'],   queryFn: gradesApi.list   })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: surfaceFinishesData } = useQuery({ queryKey: ['surface-finishes'], queryFn: surfaceFinishesApi.list })

  // Wat er per staaf vastligt komt van de server mee in `gereserveerdMm` — één
  // definitie voor het hele programma. De reserveringen zelf zijn hier alleen
  // nodig om in de lade te laten zien wélke dat zijn.
  const { data: allReservations = [] } = useReserveringen()
  const reservedByBar = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of data?.data ?? []) map[row.id] = row.gereserveerdMm
    return map
  }, [data])

  const deleteMutation = useMutation({
    mutationFn: rawMaterialsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      notifications.show({ color: 'green', message: 'Materiaal verwijderd' })
    },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
  })

  const source = data?.data ?? []

  // Wat er bekeken wordt: alles, of vanaf een project alleen wat daarvoor
  // vastligt. Een uitgeklapte exoot haalt zijn stukken hieruit.
  const scope = useMemo(() => {
    if (!voorProject) return source
    const vast = new Set(allReservations.filter((r) => r.projectId === voorProject && houdtVast(r)).map((r) => r.barId))
    return source.filter((r) => vast.has(r.id))
  }, [source, voorProject, allReservations])

  const filtered = useMemo(() => {
    let f = scope
    if (q.trim()) {
      const Q = q.toLowerCase()
      f = f.filter(r =>
        r.code.toLowerCase().includes(Q) ||
        r.grade.name.toLowerCase().includes(Q) ||
        r.profile.name.toLowerCase().includes(Q) ||
        (r.surfaceFinish?.name.toLowerCase().includes(Q) ?? false) ||
        formatLocation(r.locationSlot).toLowerCase().includes(Q)
      )
    }
    f = filterVoorraad(f, filters, statusTag)
    return applySort(f, sort.key, sort.dir, reservedByBar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q, JSON.stringify(filters), sort, reservedByBar])

  // Eén regel per exoot (2026-10-16); gewone staven blijven een regel per stuk.
  const regels = useMemo(() => groepeerExoten(filtered, scope), [filtered, scope])
  const klap = (sleutel: string) => setUitgeklapt((s) => {
    const n = new Set(s)
    if (n.has(sleutel)) n.delete(sleutel)
    else n.add(sleutel)
    return n
  })

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
    // Een exoot op 0 is nog niet besteld of binnen, niet op: die telt hier niet.
    const out = source.filter(r => !r.exoot && Number(r.currentStock) === 0).length
    // Wat er ligt. Was "artikelen − niet op voorraad", en dan telde een exoot
    // die nog moest komen of al verbruikt was mee als stuk met restlengte.
    const metRest = aantalInVoorraad(source)
    // top consumed row by length
    const topRow = [...source]
      .map(r => ({ r, consumed: Number(r.lengthMm) - Number(r.currentStock) }))
      .sort((a, b) => b.consumed - a.consumed)[0] ?? null
    return { totalKg, skus: source.length, low, out, metRest, topRow }
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
  const zetSelectie = (ids: string[], aan: boolean) => {
    const next = new Set(selected)
    for (const id of ids) aan ? next.add(id) : next.delete(id)
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

  const uniqueGrades     = [...new Set([...(gradesData?.data ?? []).map(g => g.name),   ...source.map(r => r.grade.name)])]
  const uniqueProfiles   = [...new Set([...(profilesData?.data ?? []).map(p => p.name), ...source.map(r => r.profile.name)])]
  const uniqueAfwerkingen = [...new Set([...(surfaceFinishesData?.data ?? []).map(s => s.name), ...source.map(r => r.surfaceFinish?.name).filter((n): n is string => !!n)])]

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
          <div className="st-stat-foot"><span>{stats.metRest} met restlengte</span></div>
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
        {voorProject && (
          <span className="st-chip active" title="Alleen wat voor dit project vastligt">
            <span>Project</span><span className="chip-val">: {voorProject}</span>
            <span className="chip-x" role="button" aria-label="Project: filter wissen" onClick={wisProject}>×</span>
          </span>
        )}
        <FilterChip label="Kwaliteit" value={filters.kwaliteit} options={[['', 'Alle'], ...uniqueGrades.map(g => [g, g] as [string, string])]} onChange={(v) => zetFilter('kwaliteit', v)} />
        <FilterChip label="Afwerking" value={filters.afwerking} options={[['', 'Alle'], ...uniqueAfwerkingen.map(a => [a, a] as [string, string])]} onChange={(v) => zetFilter('afwerking', v)} />
        <FilterChip label="Vorm"      value={filters.vorm}      options={[['', 'Alle vormen'], ...uniqueProfiles.map(p => [p, p] as [string, string])]} onChange={(v) => zetFilter('vorm', v)} />
        <BereikChip label="Maat"   value={filters.maat}   onChange={(b) => zetFilter('maat', b)} />
        <BereikChip label="Lengte" value={filters.lengte} eenheid="mm" onChange={(b) => zetFilter('lengte', b)} />
        <FilterChip label="Exoot"     value={filters.exoot}     options={[['', 'Alle'], ['alleen', 'Alleen exoten'], ['zonder', 'Zonder exoten']]} onChange={(v) => zetFilter('exoot', v as ExootFilter)} />
        {/* Wat er niet ligt staat standaard niet in de lijst; "Verbruikt" en "Nog niet binnen" tonen juist dat. */}
        <FilterChip label="Status"    value={filters.status}    options={[['', 'Alle'], ['ok', 'In gebruik'], ['vol', 'Volledig'], ['laag', 'Kort'], ['uit', 'Verbruikt'], ['nietbinnen', 'Nog niet binnen']]} onChange={(v) => zetFilter('status', v)} />
        <div style={{ flex: 1 }} />
        {filtersActief(filters) && (
          <button className="st-btn ghost sm" onClick={() => filterPref.setValue(LEGE_FILTERS)}>
            <IconFilter size={13} />Wis filters
          </button>
        )}
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
                  <SortTh k="surfaceFinish" sort={sort} onSort={handleSort}>Afwerking</SortTh>
                  <SortTh k="currentStock" sort={sort} onSort={handleSort} align="right">Fysieke lengte</SortTh>
                  <SortTh k="reserved"     sort={sort} onSort={handleSort} align="right">Gereserveerd</SortTh>
                  <th style={{ minWidth: 160 }}>Niveau</th>
                  <SortTh k="locatie"      sort={sort} onSort={handleSort}>Locatie</SortTh>
                  <th>Status</th>
                  <SortTh k="updatedAt"    sort={sort} onSort={handleSort}>Laatste mutatie</SortTh>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {regels.flatMap((regel) => {
                  const stuk = (row: RawMaterialRow, onderGroep = false) => (
                    <VoorraadRij
                      key={row.id}
                      row={row}
                      gereserveerdMm={reservedByBar[row.id] ?? 0}
                      geselecteerd={selected.has(row.id)}
                      onderGroep={onderGroep}
                      verwijderenBezig={deleteMutation.isPending}
                      onSelecteer={() => toggleOne(row.id)}
                      onOpen={() => setDrawerRow(row)}
                      onMutatie={() => openMutatie(row)}
                      onBewerk={() => setEditItem(row)}
                      onVerwijder={(e) => handleDelete(row, e)}
                    />
                  )
                  if (regel.soort === 'stuk') return [stuk(regel.rij)]
                  const g = regel.groep
                  const open = uitgeklapt.has(g.sleutel)
                  return [
                    <ExootGroepRij
                      key={g.sleutel}
                      groep={g}
                      open={open}
                      gereserveerdPerStaaf={reservedByBar}
                      geselecteerd={selected}
                      onKlap={() => klap(g.sleutel)}
                      onSelecteer={zetSelectie}
                    />,
                    ...(open ? g.stukken.map((r) => stuk(r, true)) : []),
                  ]
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={13} className="st-empty">Geen artikelen gevonden voor deze filters.</td></tr>
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
          barReservations={allReservations.filter(r => r.barId === drawerRow.id && houdtVast(r))}
          onClose={() => setDrawerRow(null)}
          onEdit={() => { setEditItem(drawerRow); setDrawerRow(null) }}
          onMutatie={() => openMutatie(drawerRow)}
        />
      )}

      {/* mutatie modal */}
      <MutatieModal
        row={mutatieRow}
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
