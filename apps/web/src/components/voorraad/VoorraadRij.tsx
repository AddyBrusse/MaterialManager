import { IconArrowsExchange, IconEdit, IconTrash } from '@tabler/icons-react'
import { formatDimensions, formatLocation, type RawMaterialRow } from '../../api/raw-materials'
import { ExootLabel } from '../inkoop/ExootLabel'
import { statusFor, fmm, formatRelative, TypeGlyph } from './weergave'

interface Props {
  row: RawMaterialRow
  gereserveerdMm: number
  geselecteerd: boolean
  /** Een stuk onder een uitgeklapte exoot: ingesprongen. */
  onderGroep?: boolean
  verwijderenBezig: boolean
  onSelecteer: () => void
  onOpen: () => void
  onMutatie: () => void
  onBewerk: () => void
  onVerwijder: (e: React.MouseEvent) => void
}

/** Eén stuk in de voorraadtabel. */
export function VoorraadRij({ row, gereserveerdMm, geselecteerd, onderGroep, verwijderenBezig, ...on }: Props) {
  const remaining = Number(row.currentStock)
  const original  = Number(row.lengthMm)
  const min       = Number(row.minStock) || 0
  const st        = statusFor(remaining, min, original)
  const pct       = original > 0 ? Math.min(100, (remaining / original) * 100) : 0
  const lvlCls    = st.cls === 'ok' || st.cls === 'info' ? '' : st.cls

  return (
    <tr data-selected={geselecteerd} className={onderGroep ? 'st-sub' : undefined} onClick={on.onOpen}>
      <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
        <span className="st-ck" data-on={geselecteerd} onClick={on.onSelecteer} />
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
            <div className="st-art-name">{row.profile.name}{row.exoot && <> <ExootLabel klant={row.klant} compact /></>}</div>
            <div className="st-art-desc">L{Number(row.lengthMm).toLocaleString('nl-NL')} mm{row.exoot && row.klant ? ` · ${row.klant.naam}` : ''}</div>
          </div>
        </div>
      </td>
      <td className="cell-mono">{row.grade.name}</td>
      <td className="cell-mono cell-muted">{formatDimensions(row.profile, row.dimensions)}</td>
      <td><span className="cell-muted" style={{ fontSize: 12 }}>{row.surfaceFinish?.name ?? '—'}</span></td>
      <td className="cell-num cell-strong cell-mono" style={{ fontSize: 12 }}>{fmm(remaining)}</td>
      <td className="cell-num cell-mono" style={{ fontSize: 12 }}>
        {gereserveerdMm > 0
          ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{fmm(gereserveerdMm)}</span>
          : <span className="cell-muted">—</span>}
      </td>
      <td>
        <div className={`st-lvl${lvlCls ? ` ${lvlCls}` : ''}`}>
          <div className="st-lvl-bar"><i style={{ width: `${pct}%` }} /></div>
          <span className="st-lvl-num">{Math.round(pct)}%</span>
        </div>
      </td>
      <td><span className="cell-muted">{formatLocation(row.locationSlot)}</span></td>
      <td>
        {/* Een exoot op 0 die nooit binnen was, is niet verbruikt (2026-10-16). */}
        {row.exoot && row.exootStand === 'niet_binnen'
          ? <span className="st-badge exoot"><span className="dot" />Nog niet binnen</span>
          : <span className={`st-badge ${st.cls}`}><span className="dot" />{st.label}</span>}
      </td>
      <td>
        <span className="cell-muted" style={{ fontSize: 11.5 }}>{formatRelative(row.updatedAt)}</span>
      </td>
      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
        <div className="row-actions">
          <button className="st-icon-btn" title="Mutatie boeken" onClick={on.onMutatie}>
            <IconArrowsExchange size={14} />
          </button>
          <button className="st-icon-btn" title="Bewerken" onClick={on.onBewerk}>
            <IconEdit size={14} />
          </button>
          <button className="st-icon-btn danger" title="Verwijderen" onClick={on.onVerwijder} disabled={verwijderenBezig}>
            <IconTrash size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}
