import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { bestelRegelsApi } from '../../../../../api/bestellingen'
import { Card } from '../../components/Card'
import { ExootLabel } from '../../../../../components/inkoop/ExootLabel'
import { BestelStatusBadge, aantalTekst, bronTekst, datum, eur } from '../../../../../components/inkoop/bestellingen/bestel-tekst'

/**
 * Alles wat voor dit project besteld moet worden of besteld is (2026-10-06):
 * per regel de maat, de status, de gekozen leverancier en prijs, de aanvraag,
 * de inkooporder en wat er al binnen is. Bestellen zelf gebeurt op Bestellingen.
 */
export function BestellingenKaart({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['bestel-regels', 'project', projectId],
    queryFn: () => bestelRegelsApi.voorProject(projectId),
    refetchInterval: 20000,
  })
  const regels = data ?? []
  const binnen = regels.filter((r) => r.status === 'ontvangen').length

  return (
    <Card
      titel="Bestellingen"
      teller={regels.length ? `${regels.length} regel${regels.length === 1 ? '' : 's'} · ${binnen} binnen` : undefined}
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
              <tr><th>Materiaal</th><th>Aantal</th><th>Status</th><th>Leverancier · prijs</th><th>Aanvraag · order</th><th>Binnen</th></tr>
            </thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-strong">{r.materiaal} {r.exoot && <ExootLabel compact />}</div>
                    <div className="bs-sub">{r.artikelNaam ? `${r.artikelNaam} · ` : ''}{bronTekst(r.bron)}</div>
                  </td>
                  <td className="cell-mono">{aantalTekst(r)}</td>
                  <td>
                    <BestelStatusBadge status={r.status} />
                    {r.nodigVoor && <div className="bs-sub">nodig vóór {datum(r.nodigVoor)}</div>}
                  </td>
                  <td>
                    {r.keuze
                      ? <><div>{r.keuze.leverancierNaam}</div><div className="bs-sub cell-mono">{eur(r.keuze.totaal)}{r.keuze.levertijdDagen != null ? ` · ${r.keuze.levertijdDagen} werkdagen` : ''}</div></>
                      : <span className="cell-muted">nog niet gekozen</span>}
                  </td>
                  <td>
                    {r.aanvragen[0] ? <div className="bs-sub cell-mono">{r.aanvragen[0].id} · {r.aanvragen[0].verzondenOp ? datum(r.aanvragen[0].verzondenOp) : 'nog niet verstuurd'}</div> : null}
                    {r.inkooporder ? <div className="cell-mono">{r.inkooporder.id}{r.inkooporder.status === 'concept' ? ' (concept)' : ''}</div> : null}
                    {!r.aanvragen[0] && !r.inkooporder && <span className="cell-muted">—</span>}
                  </td>
                  <td className="cell-mono">{r.ontvangenStuks} / {r.stuks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Card>
  )
}
