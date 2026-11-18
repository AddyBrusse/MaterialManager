import { IconArrowBackUp, IconExternalLink, IconFileTypePdf, IconPackage, IconPencil, IconTrash } from '@tabler/icons-react'
import { factuurNummerTekst, heeftFactuurnummer, type VerkoopFactuur } from '@stockmanager/shared'
import { datum, eur } from '../../features/projects/detail/lib/format'
import { statusBadge } from './facturen-lijst'

interface RijActies {
  onOpen: (f: VerkoopFactuur) => void
  onPdf: (f: VerkoopFactuur) => void
  onPakbon: (f: VerkoopFactuur) => void
  onVerstuur: (f: VerkoopFactuur) => void
  onVerwijder: (f: VerkoopFactuur) => void
  onTrekIn: (f: VerkoopFactuur) => void
  onBetaald: (f: VerkoopFactuur, betaald: boolean) => void
  onCrediteer: (f: VerkoopFactuur) => void
}

interface Props extends RijActies {
  facturen: VerkoopFactuur[]
  leeg: string
  bezig: boolean
}

/** Alle facturen en credits. Een losse opent in het venster; een projectfactuur op zijn project. */
export function FacturenTabel({ facturen, leeg, bezig, ...a }: Props) {
  return (
    <table className="st-tbl fact-lijst">
      <thead>
        <tr>
          <th style={{ minWidth: 130 }}>Nummer</th>
          <th style={{ minWidth: 170 }}>Klant</th>
          <th style={{ minWidth: 170 }}>Project</th>
          <th style={{ minWidth: 120 }}>Ref. klant</th>
          <th style={{ minWidth: 90 }}>Datum</th>
          <th style={{ minWidth: 200 }}>Status</th>
          <th style={{ minWidth: 110, textAlign: 'right' }}>Incl. btw</th>
          <th style={{ minWidth: 260 }} />
        </tr>
      </thead>
      <tbody>
        {facturen.map((f) => {
          const s = statusBadge(f)
          const los = !f.projectId
          const concept = !f.verzondenOp
          return (
            <tr key={f.id} onClick={() => a.onOpen(f)} className={f.soort === 'credit' ? 'fact-credit' : undefined}>
              <td className="cell-mono">
                {factuurNummerTekst(f.id)}
                <div className="fact-sub">{f.soort === 'credit' ? (f.crediteertFactuurId ? `credit op ${f.crediteertFactuurId}` : 'losse credit') : 'factuur'}</div>
              </td>
              <td>{f.klantNaam ?? <span className="cell-muted">—</span>}</td>
              <td>{los ? <span className="cell-muted">Los, zonder project</span> : <>{f.projectNaam || f.projectId} <IconExternalLink size={11} /></>}</td>
              <td>{f.klantRef || <span className="cell-muted">—</span>}</td>
              <td className="cell-muted">{datum(f.verzondenOp ?? f.createdAt)}</td>
              <td>
                <span className={`badge ${s.cls}`}><span className="dot" />{s.label}</span>
                <div className="fact-sub">{s.uitleg}</div>
              </td>
              <td className="cell-mono" style={{ textAlign: 'right' }}>{eur((f.soort === 'credit' ? -1 : 1) * f.totaalInclBtw)}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {los && (
                  <div className="fact-acties">
                    <button type="button" className="st-icon-btn" title="Pdf bekijken" aria-label={`Pdf van ${f.id}`} onClick={() => a.onPdf(f)}><IconFileTypePdf size={14} /></button>
                    {f.soort === 'factuur' && (
                      <button type="button" className="st-icon-btn" title="Pakbon voor in de doos" aria-label={`Pakbon van ${f.id}`} onClick={() => a.onPakbon(f)}><IconPackage size={14} /></button>
                    )}
                    {concept && (
                      <>
                        <button type="button" className="st-icon-btn" title="Bewerken" aria-label={`${f.id} bewerken`} onClick={() => a.onOpen(f)}><IconPencil size={14} /></button>
                        <button type="button" className="st-btn xs primary" disabled={bezig} onClick={() => a.onVerstuur(f)}>Versturen</button>
                        {heeftFactuurnummer(f.id) ? (
                          <button type="button" className="st-btn xs" title="Terug naar concept; kan alleen bij het laatst uitgegeven nummer" onClick={() => a.onTrekIn(f)}>
                            <IconArrowBackUp size={12} /> Nummer intrekken
                          </button>
                        ) : (
                          <button type="button" className="st-icon-btn fact-weg" title="Concept verwijderen" aria-label={`${f.id} verwijderen`} onClick={() => a.onVerwijder(f)}><IconTrash size={14} /></button>
                        )}
                      </>
                    )}
                    {!concept && f.soort === 'factuur' && (
                      <>
                        <button type="button" className="st-btn xs" onClick={() => a.onCrediteer(f)}>Crediteren</button>
                        <button type="button" className="st-btn xs" onClick={() => a.onBetaald(f, !f.betaaldOp)}>{f.betaaldOp ? 'Niet betaald' : 'Betaald'}</button>
                      </>
                    )}
                  </div>
                )}
                {!los && <span className="cell-muted fact-sub">Op de Facturen-tab van het project</span>}
              </td>
            </tr>
          )
        })}
        {facturen.length === 0 && (
          <tr><td colSpan={8} className="cell-muted" style={{ textAlign: 'center', padding: 28 }}>{leeg}</td></tr>
        )}
      </tbody>
    </table>
  )
}
