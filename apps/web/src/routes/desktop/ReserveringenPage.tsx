import { useState, useMemo, useRef } from 'react'
import { IconTrash, IconCut, IconAlertTriangle, IconPrinter, IconX } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { reservationsStore, type ZaagReservation } from '../../api/reservations'

function fmm(mm: number) {
  return mm.toLocaleString('nl-NL') + ' mm'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ── Zaagbon rendered from stored reservation data ─────────────────────────────
function ZaagbonPreview({
  calcNr,
  items,
  onClose,
}: {
  calcNr: string
  items: ZaagReservation[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Derive shared job params from first item (all items in a group share these)
  const first      = items[0]
  const machine    = first.machine
  const materiaal  = first.materiaal
  const diameter   = first.diameter
  const werkstukL  = first.werkstukLengte
  const productLen = first.productLen
  const kerf       = first.steekbreedte ?? (productLen - werkstukL - (first.vlakToeslag ?? 0))
  const vlak       = first.vlakToeslag  ?? 0
  const grijp      = first.sawLength - first.pieces * productLen   // derive from first item
  const totalPcs   = items.reduce((s, r) => s + r.pieces, 0)
  const printDate  = formatDateShort(first.createdAt)

  function handlePrint() {
    // Temporarily add a body class so @media print can target it
    document.body.classList.add('printing-zaagbon')
    window.print()
    // Clean up after print dialog closes
    setTimeout(() => document.body.classList.remove('printing-zaagbon'), 500)
    onClose()
  }

  return (
    <div className="resv-zaagbon-wrap" ref={ref}>

      {/* screen toolbar — hidden on print */}
      <div className="resv-zaagbon-toolbar no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconPrinter size={14} style={{ color: 'var(--text-3)' }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            Zaagbon{calcNr ? ` — ${calcNr}` : ''}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{printDate}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="st-btn primary sm" onClick={handlePrint}>
            <IconPrinter size={13} />Afdrukken
          </button>
          <button className="st-btn sm" onClick={onClose}>
            <IconX size={13} />Sluiten
          </button>
        </div>
      </div>

      {/* print-only header */}
      <div className="zaag-print-hd">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>ZAAGBON</div>
            {calcNr && (
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                Calculatie: <span style={{ fontFamily: 'monospace' }}>{calcNr}</span>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div style={{ fontWeight: 600 }}>Datum: {printDate}</div>
            <div>Machine: {machine}</div>
            <div>Operator: ___________________</div>
          </div>
        </div>
        <div style={{ background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, padding: '8px 12px', fontSize: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span><strong>Materiaal:</strong> {materiaal}</span>
          <span><strong>Diameter:</strong> Ø{diameter} mm</span>
          <span><strong>Werkstuk:</strong> {werkstukL} mm</span>
          <span><strong>Product lengte:</strong> {productLen} mm</span>
          <span><strong>Kerf:</strong> {kerf} mm</span>
          <span><strong>Vlak toeslag:</strong> {vlak} mm</span>
          <span><strong>Grijplengte:</strong> {grijp} mm</span>
          <span><strong>Stuks:</strong> {totalPcs}</span>
        </div>
      </div>

      {/* shared table — screen + print */}
      <table className="st-tbl">
        <thead>
          <tr>
            <th>As nummer</th>
            <th>Materiaal</th>
            <th>Vorm</th>
            <th>Diameter</th>
            <th>Locatie</th>
            <th style={{ textAlign: 'right' }}>Stuks</th>
            <th>Zaagopdracht</th>
          </tr>
        </thead>
        <tbody>
          {items.map(r => (
            <tr key={r.id}>
              <td className="cell-mono cell-strong" style={{ fontSize: 12 }}>{r.barCode}</td>
              <td>{r.materiaal}</td>
              <td>{r.barVorm ?? 'Rond'}</td>
              <td className="cell-mono">Ø{r.diameter}</td>
              <td className="cell-muted" style={{ fontSize: 12 }}>{r.barLocation ?? '—'}</td>
              <td className="cell-num cell-strong">{r.pieces}</td>
              <td>
                <span className="cell-mono cell-strong" style={{ fontSize: 13 }}>
                  Zaag 1×{r.sawLength}mm
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* print-only footer */}
      <div className="zaag-print-footer">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 24, paddingTop: 12, borderTop: '1px solid #ddd', fontSize: 12 }}>
          <div>Gecontroleerd: ___________________</div>
          <div>Gezaagd door: ___________________</div>
          <div>Datum/tijd: ___________________</div>
        </div>
      </div>

    </div>
  )
}

// ── Group row ─────────────────────────────────────────────────────────────────
function ReservationGroup({
  calcNr,
  items,
  isActive,
  onDelete,
  onDeleteGroup,
  onPrint,
}: {
  calcNr: string
  items: ZaagReservation[]
  isActive: boolean
  onDelete: (id: string) => void
  onDeleteGroup: (calcNr: string) => void
  onPrint: (calcNr: string) => void
}) {
  const totalSaw = items.reduce((s, r) => s + r.sawLength, 0)
  const totalPcs = items.reduce((s, r) => s + r.pieces, 0)

  return (
    <div className={`resv-group${isActive ? ' resv-group-active' : ''}`}>
      {/* group header */}
      <div className="resv-group-hd no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconCut size={14} style={{ color: 'var(--text-3)' }} />
          {calcNr ? (
            <span className="resv-calcnr">{calcNr}</span>
          ) : (
            <span className="resv-calcnr resv-calcnr-empty">Zonder calculatienummer</span>
          )}
          <span className="resv-group-meta">
            {items.length} {items.length === 1 ? 'as' : 'assen'} · {totalPcs} stuks · {fmm(totalSaw)} totaal
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`st-btn sm${isActive ? ' primary' : ''}`}
            onClick={() => onPrint(calcNr)}
            title="Zaagbon bekijken en afdrukken"
          >
            <IconPrinter size={12} />
            Zaagbon
          </button>
          <button
            className="st-btn danger sm"
            onClick={() => onDeleteGroup(calcNr)}
            title="Verwijder alle reserveringen in deze groep"
          >
            <IconTrash size={12} />
            Verwijderen
          </button>
        </div>
      </div>

      {/* group table */}
      <table className="st-tbl no-print">
        <thead>
          <tr>
            <th>As nummer</th>
            <th>Materiaal</th>
            <th style={{ textAlign: 'right' }}>Diameter</th>
            <th style={{ textAlign: 'right' }}>Werkstuk</th>
            <th style={{ textAlign: 'right' }}>Stuks</th>
            <th style={{ textAlign: 'right' }}>Gereserveerde lengte</th>
            <th>Machine</th>
            <th>Aangemaakt</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {items.map(r => (
            <tr key={r.id}>
              <td>
                <span className="cell-mono cell-strong" style={{ fontSize: 12 }}>{r.barCode}</span>
              </td>
              <td>{r.materiaal}</td>
              <td className="cell-num cell-mono" style={{ fontSize: 12 }}>Ø{r.diameter} mm</td>
              <td className="cell-num cell-mono" style={{ fontSize: 12 }}>{fmm(r.werkstukLengte)}</td>
              <td className="cell-num cell-strong">{r.pieces}</td>
              <td className="cell-num cell-mono" style={{ fontSize: 12, color: 'var(--accent)' }}>
                {fmm(r.sawLength)}
              </td>
              <td className="cell-muted" style={{ fontSize: 12 }}>{r.machine}</td>
              <td className="cell-muted" style={{ fontSize: 12 }}>{formatDate(r.createdAt)}</td>
              <td>
                <button
                  className="st-icon-btn"
                  style={{ color: 'var(--danger)' }}
                  title="Reservering verwijderen"
                  onClick={() => onDelete(r.id)}
                >
                  <IconTrash size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────
export function ReserveringenPage() {
  const [reservations, setReservations] = useState<ZaagReservation[]>(() =>
    reservationsStore.list().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  )
  const [activeZaagbon, setActiveZaagbon] = useState<string | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, ZaagReservation[]>()
    for (const r of reservations) {
      const key = r.calculatieNr ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    const entries = [...map.entries()]
    entries.sort(([a], [b]) => {
      if (a === '' && b !== '') return 1
      if (a !== '' && b === '') return -1
      return a.localeCompare(b, 'nl-NL')
    })
    return entries
  }, [reservations])

  const activeItems = useMemo(
    () => groups.find(([k]) => k === activeZaagbon)?.[1] ?? [],
    [groups, activeZaagbon]
  )

  const totalBars = reservations.length
  const totalMm   = reservations.reduce((s, r) => s + r.sawLength, 0)

  function handleDelete(id: string) {
    reservationsStore.remove(id)
    setReservations(prev => prev.filter(r => r.id !== id))
    notifications.show({
      color: 'orange',
      title: 'Reservering verwijderd',
      message: 'De zaag-reservering is verwijderd. De beschikbare lengte is weer vrijgegeven.',
    })
  }

  function handleDeleteGroup(calcNr: string) {
    const toDelete = reservations.filter(r => r.calculatieNr === calcNr)
    toDelete.forEach(r => reservationsStore.remove(r.id))
    setReservations(prev => prev.filter(r => r.calculatieNr !== calcNr))
    if (activeZaagbon === calcNr) setActiveZaagbon(null)
    notifications.show({
      color: 'orange',
      title: 'Groep verwijderd',
      message: `${toDelete.length} reservering${toDelete.length !== 1 ? 'en' : ''} verwijderd${calcNr ? ` voor ${calcNr}` : ''}.`,
    })
  }

  function handleDeleteAll() {
    reservations.forEach(r => reservationsStore.remove(r.id))
    setReservations([])
    setActiveZaagbon(null)
    notifications.show({
      color: 'orange',
      title: 'Alle reserveringen verwijderd',
      message: 'Alle zaag-reserveringen zijn verwijderd.',
    })
  }

  function handlePrint(calcNr: string) {
    setActiveZaagbon(prev => prev === calcNr ? null : calcNr)
  }

  return (
    <>
      {/* page header */}
      <div className="st-page-hd no-print">
        <div>
          <div className="st-page-title">Reserveringen</div>
          <div className="st-page-sub">Overzicht van alle actieve zaag-reserveringen</div>
        </div>
        {reservations.length > 0 && (
          <div className="st-page-actions">
            <button className="st-btn danger sm" onClick={handleDeleteAll}>
              <IconTrash size={13} />
              Alles verwijderen
            </button>
          </div>
        )}
      </div>

      {/* summary stats */}
      {reservations.length > 0 && (
        <div className="resv-stats no-print">
          <div className="resv-stat">
            <div className="resv-stat-val">{totalBars}</div>
            <div className="resv-stat-lbl">Gereserveerde assen</div>
          </div>
          <div className="resv-stat">
            <div className="resv-stat-val">{groups.length}</div>
            <div className="resv-stat-lbl">Calculaties</div>
          </div>
          <div className="resv-stat">
            <div className="resv-stat-val">{fmm(totalMm)}</div>
            <div className="resv-stat-lbl">Totaal gereserveerd</div>
          </div>
        </div>
      )}

      {/* groups */}
      {reservations.length === 0 ? (
        <div className="st-empty no-print" style={{ marginTop: 48 }}>
          <IconAlertTriangle size={22} style={{ color: 'var(--text-4)', marginBottom: 8 }} />
          <div>Geen actieve reserveringen</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            Reserveringen worden aangemaakt vanuit de <strong>Zaag calculator</strong>.
          </div>
        </div>
      ) : (
        <div className="resv-list no-print">
          {groups.map(([calcNr, items]) => (
            <ReservationGroup
              key={calcNr}
              calcNr={calcNr}
              items={items}
              isActive={activeZaagbon === calcNr}
              onDelete={handleDelete}
              onDeleteGroup={handleDeleteGroup}
              onPrint={handlePrint}
            />
          ))}
        </div>
      )}

      {/* zaagbon preview + print target */}
      {activeZaagbon !== null && activeItems.length > 0 && (
        <div id="zaagbon" style={{ marginTop: 24 }}>
          <ZaagbonPreview
            calcNr={activeZaagbon}
            items={activeItems}
            onClose={() => setActiveZaagbon(null)}
          />
        </div>
      )}
    </>
  )
}
