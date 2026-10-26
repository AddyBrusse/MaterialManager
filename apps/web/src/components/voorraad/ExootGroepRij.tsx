import { IconChevronRight } from '@tabler/icons-react'
import { formatDimensions, formatLocation, type RawMaterialRow } from '../../api/raw-materials'
import { ExootLabel } from '../inkoop/ExootLabel'
import { groepStand, telTekst, type ExootGroep } from './exoot-groepen'
import { fmm, formatRelative, TypeGlyph } from './weergave'

interface Props {
  groep: ExootGroep<RawMaterialRow>
  open: boolean
  gereserveerdPerStaaf: Record<string, number>
  geselecteerd: Set<string>
  onKlap: () => void
  onSelecteer: (ids: string[], aan: boolean) => void
}

const STAND = {
  binnen:      { cls: 'ok',     label: 'In het rek' },
  niet_binnen: { cls: 'exoot',  label: 'Nog niet binnen' },
  verbruikt:   { cls: 'danger', label: 'Verbruikt' },
} as const

/**
 * Eén regel voor alle stukken van een exoot (2026-10-16), met de telling erbij.
 * Klikken klapt de stukken uit; muteren, bewerken en verwijderen gaat per stuk.
 */
export function ExootGroepRij({ groep, open, gereserveerdPerStaaf, geselecteerd, onKlap, onSelecteer }: Props) {
  const r = groep.stukken[0]
  const ids = groep.stukken.map((s) => s.id)
  const alles = ids.every((id) => geselecteerd.has(id))
  const fysiek = groep.stukken.reduce((s, x) => s + Number(x.currentStock), 0)
  const vast = groep.stukken.reduce((s, x) => s + (gereserveerdPerStaaf[x.id] ?? 0), 0)
  const pct = (groep.binnen / groep.stukken.length) * 100
  const plekken = [...new Set(groep.stukken.filter((s) => s.exootStand === 'binnen').map((s) => formatLocation(s.locationSlot)))]
  const laatst = groep.stukken.reduce((m, x) => (x.updatedAt > m ? x.updatedAt : m), r.updatedAt)
  const stand = STAND[groepStand(groep)]

  return (
    <tr className={`st-groep${open ? ' open' : ''}`} data-selected={alles} onClick={onKlap} title={open ? 'Stukken inklappen' : 'Stukken tonen'}>
      <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
        <span className="st-ck" data-on={alles} onClick={() => onSelecteer(ids, !alles)} />
      </td>
      <td>
        <span className="st-groep-code">
          <IconChevronRight size={12} className="st-chev" />
          <span className="cell-mono cell-strong" style={{ fontSize: 12 }}>{groep.stukken.length} st</span>
        </span>
      </td>
      <td>
        <div className="st-art-cell">
          <div className="st-type-pic"><TypeGlyph volumeFormula={r.profile.volumeFormula} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="st-art-name">{r.profile.name} <ExootLabel klant={r.klant} />{r.artikel ? ` ${r.artikel.naam}` : ''}</div>
            <div className="st-art-desc">L{Number(r.lengthMm).toLocaleString('nl-NL')} mm · {telTekst(groep)}</div>
          </div>
        </div>
      </td>
      <td className="cell-mono">{r.grade.name}</td>
      <td className="cell-mono cell-muted">{formatDimensions(r.profile, r.dimensions)}</td>
      <td><span className="cell-muted" style={{ fontSize: 12 }}>{r.surfaceFinish?.name ?? '—'}</span></td>
      <td className="cell-num cell-strong cell-mono" style={{ fontSize: 12 }}>{fmm(fysiek)}</td>
      <td className="cell-num cell-mono" style={{ fontSize: 12 }}>
        {vast > 0 ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{fmm(vast)}</span> : <span className="cell-muted">—</span>}
      </td>
      <td>
        <div className="st-lvl">
          <div className="st-lvl-bar"><i style={{ width: `${pct}%` }} /></div>
          <span className="st-lvl-num">{groep.binnen}/{groep.stukken.length}</span>
        </div>
      </td>
      <td><span className="cell-muted">{plekken.length === 0 ? '—' : plekken.length === 1 ? plekken[0] : `${plekken.length} locaties`}</span></td>
      <td><span className={`st-badge ${stand.cls}`}><span className="dot" />{stand.label}</span></td>
      <td><span className="cell-muted" style={{ fontSize: 11.5 }}>{formatRelative(laatst)}</span></td>
      <td className="col-actions" />
    </tr>
  )
}
