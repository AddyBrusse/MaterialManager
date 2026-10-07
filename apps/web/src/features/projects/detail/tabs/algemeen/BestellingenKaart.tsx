import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { inkoopApi } from '../../../../../api/inkoop'
import { Card } from '../../components/Card'
import { ExootLabel } from '../../../../../components/inkoop/ExootLabel'
import { aantalTekst, bronTekst, eur } from '../../../../../components/inkoop/bestellingen/bestel-tekst'
import { StandChip, ddmm, ddmmjjjj, lokaleDag } from '../../../../../components/inkoop/overzicht/tekst'
import type { BestelBron } from '@stockmanager/shared'
import '../../../../../components/inkoop/overzicht/overzicht.css'

/**
 * Materiaal bestellen voor dit project (2026-10-07): per regel de stand — wacht,
 * onderweg, komt te laat, binnen — met wanneer hij nodig is voor de productie.
 * Bestellen zelf gebeurt op Bestellingen; hier zie je of het op schema ligt.
 */
export function BestellingenKaart({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['inkoop', 'overzicht', projectId],
    queryFn: () => inkoopApi.overzicht(projectId),
    refetchInterval: 20000,
  })
  const regels = data?.regels ?? []
  const binnen = regels.filter((r) => r.plan.stand === 'binnen').length
  const laat = regels.filter((r) => r.plan.stand === 'komt_te_laat' || r.plan.stand === 'te_laat_besteld').length

  return (
    <Card
      titel="Materiaal bestellen"
      teller={regels.length ? `${regels.length} regel${regels.length === 1 ? '' : 's'} · ${binnen} binnen${laat ? ` · ${laat} te laat voor de productie` : ''}` : undefined}
      acties={<button type="button" className="pdv2-btn s stil" onClick={() => navigate('/bestellingen')}>Naar Bestellingen</button>}
      plat={regels.length > 0}
    >
      {isLoading ? <div className="pdv2-note" style={{ marginTop: 0 }}>Laden…</div>
        : error ? <div className="pdv2-note" style={{ marginTop: 0 }}>De bestellingen konden niet geladen worden: {(error as Error).message}</div>
        : regels.length === 0 ? (
          <div className="pdv2-note" style={{ marginTop: 0 }}>
            Niets te bestellen voor dit project. Een exoot uit de opdracht of een tekort uit de materiaalselectie komt hier vanzelf.
          </div>
        ) : (
          <table className="st-tbl bs-tbl pdv2-bestel">
            <thead>
              <tr><th>Materiaal</th><th>Aantal</th><th>Stand</th><th>Leverancier · order</th><th>Verwacht / binnen</th><th>Nodig voor productie</th></tr>
            </thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.id} style={r.plan.stand === 'komt_te_laat' || r.plan.stand === 'te_laat_besteld' ? { background: 'var(--danger-soft)' } : undefined}>
                  <td>
                    <div className="cell-strong">{r.materiaal} {r.exoot && <ExootLabel compact />}</div>
                    <div className="bs-sub">{r.artikelNaam ? `${r.artikelNaam} · ` : ''}{bronTekst(r.bron as BestelBron)}</div>
                  </td>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>{aantalTekst(r)}</td>
                  <td><StandChip r={r} /></td>
                  <td>
                    {r.leverancier ? <div>{r.leverancier.naam}{!r.order && !r.leverancier.gekozen && <span className="bs-sub"> (goedkoopst)</span>}</div> : <span className="cell-muted">nog geen prijs</span>}
                    <div className="bs-sub cell-mono">
                      {r.order ? `${r.order.id}${r.order.status === 'concept' ? ' (klaargezet)' : ''}` : r.leverancier?.totaal != null ? eur(r.leverancier.totaal) : ''}
                    </div>
                  </td>
                  <td className="cell-mono">
                    {r.plan.stand === 'binnen' ? `${r.stuks} / ${r.stuks}${r.binnenOp ? ` · ${ddmm(lokaleDag(r.binnenOp))}` : ''}`
                      : r.order?.status === 'verzonden' ? <>{r.plan.verwacht ? ddmm(r.plan.verwacht) : '—'}{r.order.ontvangenStuks > 0 && <div className="bs-sub">{r.order.ontvangenStuks} / {r.stuks} binnen</div>}</>
                      : <span className="cell-muted">—</span>}
                  </td>
                  <td>
                    <span className="cell-mono">{r.nodig.datum ? ddmmjjjj(r.nodig.datum) : '—'}</span>
                    {r.nodig.datum && <span className="bs-sub"> · {r.nodig.bron === 'productie' ? (r.nodig.machine ?? 'productie') : 'levering'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Card>
  )
}
