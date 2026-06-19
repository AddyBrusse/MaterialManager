import { useState } from 'react'
import { IconCheck, IconClock, IconCircleCheck, IconAlertTriangle } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatDate } from '../../api/projects'
import { useUserStore } from '../../stores/user'
import {
  downloadProductieFormulier,
  downloadAlleProductieFormulieren,
  getOrdersWithMissingDrawing,
} from '../../services/productie-pdf'
import type { Project, ProductieOrder, ProductieStap } from '@stockmanager/shared'

// ── Step check-off ────────────────────────────────────────────────────────────

interface StapRowProps {
  stap: ProductieStap
  orderStatus: ProductieOrder['status']
  onCheck: () => void
}

function StapRow({ stap, orderStatus, onCheck }: StapRowProps) {
  const isDone = !!stap.gereedOp
  const isNext = !isDone && orderStatus !== 'gereed'

  return (
    <div className="prj-stap-row">
      <button
        className={`prj-stap-ck ${isDone ? 'done' : isNext ? 'next' : 'pend'}`}
        onClick={!isDone ? onCheck : undefined}
        disabled={isDone}
        title={isDone ? `Gereed: ${stap.gereedDoor}` : 'Markeer als gereed'}
      >
        {isDone ? '✓' : ''}
      </button>
      <div className="prj-stap-info">
        <span className={`prj-stap-naam ${isDone ? 'done' : ''}`}>{stap.naam}</span>
        {isDone && (
          <span className="prj-stap-meta">
            {stap.gereedDoor} · {stap.gereedOp ? new Date(stap.gereedOp).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Productie order card ───────────────────────────────────────────────────────

interface OrderCardProps {
  project: Project
  order: ProductieOrder
  onChanged: () => void
}

function OrderCard({ project, order, onChanged }: OrderCardProps) {
  const user = useUserStore(s => s.user)
  const [expanded, setExpanded] = useState(order.status !== 'gereed')
  const [pdfLoading, setPdfLoading] = useState(false)

  const doneCount  = order.stappen.filter(s => s.gereedOp).length
  const totalSteps = order.stappen.length
  const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0

  const statusCfg: Record<ProductieOrder['status'], { label: string; cls: string }> = {
    gepland:      { label: 'Gepland',      cls: 'st-badge' },
    in_productie: { label: 'In productie', cls: 'st-badge warn' },
    gereed:       { label: 'Gereed',       cls: 'st-badge ok' },
  }
  const { label: statusLabel, cls: statusCls } = statusCfg[order.status]

  function handleCheck(stapId: string) {
    const stap = order.stappen.find(s => s.id === stapId)
    if (!stap || stap.gereedOp) return
    projectsApi.checkOffStap(project.id, order.id, stapId, user?.name ?? 'Operator')
    notifications.show({ color: 'green', message: `Stap "${stap.naam}" gereed` })
    onChanged()
  }

  async function handleWerkopdracht(e: React.MouseEvent) {
    e.stopPropagation()
    setPdfLoading(true)
    try {
      await downloadProductieFormulier(order, project)
    } catch {
      notifications.show({ color: 'red', message: 'PDF generatie mislukt' })
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className={`prj-order-card ${order.status}`}>
      <div
        className="prj-order-hd"
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer' }}
      >
        {/* Status icon */}
        {order.status === 'gereed' ? (
          <IconCircleCheck size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
        ) : order.status === 'in_productie' ? (
          <IconClock size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '1.5px solid var(--border-strong)', flexShrink: 0,
          }} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5 }}>{order.id}</span>
            <span className={statusCls} style={{ fontSize: 10.5 }}>
              <span className="dot" style={{ width: 5, height: 5 }} />{statusLabel}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 1 }}>
            {order.artikelNaam}
            <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>· {order.qty} {order.eenheid}</span>
          </div>
        </div>

        {/* Progress bar */}
        {totalSteps > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 72, height: 4, background: 'var(--bg-chip)', borderRadius: 999, overflow: 'hidden',
            }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 'inherit',
                background: order.status === 'gereed' ? 'var(--success)' : 'var(--accent)',
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {doneCount}/{totalSteps}
            </span>
          </div>
        )}

        <button
          className="st-btn ghost xs"
          style={{ marginLeft: 4 }}
          onClick={handleWerkopdracht}
          disabled={pdfLoading}
          title="Download productieformulier + loopkaart"
        >
          {pdfLoading ? '…' : '↓ Werkopdracht'}
        </button>
      </div>

      {expanded && order.stappen.length > 0 && (
        <div className="prj-order-steps">
          {order.stappen
            .sort((a, b) => a.volgorde - b.volgorde)
            .map(stap => (
              <StapRow
                key={stap.id}
                stap={stap}
                orderStatus={order.status}
                onCheck={() => handleCheck(stap.id)}
              />
            ))}
        </div>
      )}

      {expanded && order.stappen.length === 0 && (
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic', flex: 1 }}>
            Geen bewerkingsstappen gedefinieerd voor dit artikel.
          </span>
          {order.status !== 'gereed' && (
            <button
              className="st-btn sm primary"
              onClick={() => {
                projectsApi.markOrderGereed(project.id, order.id)
                onChanged()
              }}
            >
              <IconCircleCheck size={13} />Markeer gereed
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Missing drawing warning ────────────────────────────────────────────────────

interface MissingDrawingWarningProps {
  namen: string[]
  onConfirm: () => void
  onCancel: () => void
}

function MissingDrawingWarning({ namen, onConfirm, onCancel }: MissingDrawingWarningProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <IconAlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Tekening ontbreekt</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
          De volgende artikelen hebben geen tekening (PDF) gekoppeld. Voeg de tekening toe in het artikeldossier voor een volledig printpakket.
        </p>
        <ul style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 16, paddingLeft: 18 }}>
          {namen.map(n => <li key={n}>{n}</li>)}
        </ul>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="st-btn ghost sm" onClick={onCancel}>Annuleren</button>
          <button className="st-btn sm primary" onClick={onConfirm}>Toch genereren</button>
        </div>
      </div>
    </div>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

interface Props {
  project: Project
  onChanged: () => void
}

export function ProductieTab({ project, onChanged }: Props) {
  const [pdfLoading, setPdfLoading] = useState(false)
  const [missingWarning, setMissingWarning] = useState<string[] | null>(null)

  async function generateAll() {
    const missing = getOrdersWithMissingDrawing(project.productieOrders)
    if (missing.length > 0) {
      setMissingWarning(missing)
      return
    }
    await doGenerateAll()
  }

  async function doGenerateAll() {
    setMissingWarning(null)
    setPdfLoading(true)
    try {
      await downloadAlleProductieFormulieren(project)
    } catch {
      notifications.show({ color: 'red', message: 'PDF generatie mislukt' })
    } finally {
      setPdfLoading(false)
    }
  }

  if (project.productieOrders.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 8,
        padding: 32, textAlign: 'center', color: 'var(--text-3)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
          Geen productie orders
        </div>
        <div style={{ fontSize: 12.5 }}>
          Productie orders worden aangemaakt wanneer een offerte geaccepteerd wordt.
        </div>
      </div>
    )
  }

  // Group by status: in_productie first, then gepland, then gereed
  const inProductie = project.productieOrders.filter(o => o.status === 'in_productie')
  const gepland     = project.productieOrders.filter(o => o.status === 'gepland')
  const gereed      = project.productieOrders.filter(o => o.status === 'gereed')

  const doneAll    = gereed.length === project.productieOrders.length
  const gereedCount = gereed.length
  const total      = project.productieOrders.length

  return (
    <>
      {missingWarning && (
        <MissingDrawingWarning
          namen={missingWarning}
          onConfirm={doGenerateAll}
          onCancel={() => setMissingWarning(null)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Progress summary + generate button */}
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
              Productie voortgang — {gereedCount} van {total} orders gereed
            </div>
            <div style={{ height: 6, background: 'var(--bg-chip)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                width: `${total > 0 ? (gereedCount / total) * 100 : 0}%`,
                height: '100%', background: doneAll ? 'var(--success)' : 'var(--accent)',
                transition: 'width .4s',
              }} />
            </div>
          </div>
          {doneAll && !project.paklijst && (
            <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
              <IconCheck size={14} style={{ marginRight: 4 }} />
              Alle orders klaar — paklijst kan aangemaakt worden
            </span>
          )}
          <button
            className="st-btn sm primary"
            onClick={generateAll}
            disabled={pdfLoading}
            title="Genereer productieformulieren + loopkaarten als PDF"
          >
            {pdfLoading ? '…' : '↓ Genereer formulieren'}
          </button>
        </div>

        {/* In productie */}
        {inProductie.map(o => (
          <OrderCard key={o.id} project={project} order={o} onChanged={onChanged} />
        ))}

        {/* Gepland */}
        {gepland.map(o => (
          <OrderCard key={o.id} project={project} order={o} onChanged={onChanged} />
        ))}

        {/* Gereed */}
        {gereed.length > 0 && (
          <>
            {(inProductie.length > 0 || gepland.length > 0) && (
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', padding: '4px 0 2px' }}>
                Gereed
              </div>
            )}
            {gereed.map(o => (
              <OrderCard key={o.id} project={project} order={o} onChanged={onChanged} />
            ))}
          </>
        )}
      </div>
    </>
  )
}
