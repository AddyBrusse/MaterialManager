import { Modal } from '@mantine/core'
import type { Voorstel } from './tabel-logica'
import { dagKort, isTeLaat, urenKort } from './tabel-logica'

interface Props {
  titel: string
  voorstellen: Voorstel[] | null
  onKiesMachine: (stapId: string, machine: string) => void
  onToepassen: () => void
  onSluit: () => void
}

/**
 * Het voorstel om een project in te plannen (2026-10-08). Eerste keuze is de
 * machine uit het recept; per stap zijn de andere machines van dezelfde soort
 * te kiezen, met hun start erbij. Er wordt pas iets opgeslagen bij "Inplannen".
 */
export function VoorstelVenster({ titel, voorstellen, onKiesMachine, onToepassen, onSluit }: Props) {
  const lijst = voorstellen ?? []
  const kan = lijst.filter((v) => v.machine).length
  return (
    <Modal opened={voorstellen != null} onClose={onSluit} title={titel} size="xl" centered>
      {lijst.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Alles van dit project is al ingepland.</div>
      ) : (
        <>
          <table className="st-tbl pt-voorstel">
            <thead><tr><th>Stap</th><th>Tijd</th><th>Machine</th><th>Start</th><th>Uiterlijk</th></tr></thead>
            <tbody>
              {lijst.map((v) => {
                const laat = isTeLaat(v.start, v.uiterlijk)
                return (
                  <tr key={v.job.id}>
                    <td><div className="cell-mono" style={{ fontSize: 12 }}>{v.job.orderId}</div><div>{v.job.volgorde} · {v.job.naam} <span style={{ color: 'var(--text-3)' }}>· {v.job.artikel}</span></div></td>
                    <td className="cell-mono">{urenKort(v.job.duurMin)}</td>
                    <td>
                      {v.machine ? (
                        <select aria-label={`Machine voor ${v.job.orderId} ${v.job.naam}`} value={v.machine} onChange={(e) => onKiesMachine(v.job.id, e.currentTarget.value)}
                          style={{ font: 'inherit', fontSize: 12.5, padding: '2px 4px', border: '1px solid var(--border-input)', borderRadius: 4, maxWidth: 240 }}>
                          <option value={v.machine}>{v.machine}</option>
                          {v.alternatieven.map((a) => <option key={a.machine} value={a.machine}>{a.machine} · start {dagKort(a.start)}</option>)}
                        </select>
                      ) : <span style={{ color: 'var(--warning)', fontSize: 12 }}>{v.reden}</span>}
                    </td>
                    <td className="cell-mono" style={laat ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{dagKort(v.start)}</td>
                    <td className="cell-mono" style={{ color: 'var(--text-3)' }}>{dagKort(v.uiterlijk)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
            Eerste keuze is de machine uit het recept. In de wachtrij komt een stap vóór werk dat later uiterlijk moet beginnen. Andere stappen schuiven niet op; sleep daarna gerust bij.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" className="st-btn sm" onClick={onSluit}>Annuleren</button>
            <button type="button" className="st-btn sm primary" disabled={kan === 0} onClick={onToepassen}>
              {kan === lijst.length ? `${kan} stap${kan === 1 ? '' : 'pen'} inplannen` : `${kan} van ${lijst.length} inplannen`}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
