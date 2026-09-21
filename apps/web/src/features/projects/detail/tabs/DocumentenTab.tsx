import type { Project } from '@stockmanager/shared'
import { Card } from '../components/Card'
import { datum, eur, getal, relatieveDagen, dagenTot } from '../lib/format'
import { geaccepteerdeOfferte, geldendeOfferte, stapTelling } from '../lib/status'
import { offerteTotaal } from '../lib/build-vm'

interface Rij {
  document: string
  nummer: string
  status: string
  statusKleur: string
  datumTekst: string
  bedrag: string
  herkomst: string
  bestaat: boolean
  kan: boolean
}

/**
 * §5.6 — de route van het project als één tabel. Dit is waar het principe
 * "status volgt uit een document" letterlijk op het scherm staat: vier vaste
 * rijen, ook als ze nog niet bestaan, elk met de voorwaarde waaronder ze
 * ontstaan.
 */
function bouwRijen(p: Project): Rij[] {
  const geldend = geldendeOfferte(p)
  const acc = geaccepteerdeOfferte(p)
  const { gereed, totaal } = stapTelling(p.productieOrders)
  const alleStappenGereed = totaal > 0 && gereed === totaal

  return [
    {
      document: 'Offerte geldend',
      nummer: geldend?.id ?? '—',
      status: geldend ? (acc ? 'Geaccepteerd' : geldend.status) : 'Nog niet',
      statusKleur: acc ? 'ok' : geldend ? 'accent' : '',
      datumTekst: datum(geldend?.verzondenOp),
      bedrag: eur(offerteTotaal(p)),
      herkomst: geldend
        ? `v${geldend.versie}${
            geldend.geldigTot
              ? ` · vervalt ${datum(geldend.geldigTot)} · ${relatieveDagen(geldend.geldigTot)}`
              : ''
          }`
        : 'ontstaat zodra je een offerte opstelt',
      bestaat: Boolean(geldend),
      kan: true,
    },
    {
      document: 'Opdrachtbevestiging',
      nummer: p.opdrachtbevestiging?.id ?? '—',
      status: p.opdrachtbevestiging
        ? p.opdrachtbevestiging.verzondenOp
          ? 'Verzonden'
          : 'Concept'
        : 'Nog niet',
      statusKleur: p.opdrachtbevestiging?.verzondenOp ? 'ok' : '',
      datumTekst: datum(p.opdrachtbevestiging?.verzondenOp),
      bedrag: '—',
      herkomst: p.opdrachtbevestiging
        ? `regels bevroren uit ${p.opdrachtbevestiging.offerteId}`
        : 'ontstaat zodra een offerte geaccepteerd is',
      bestaat: Boolean(p.opdrachtbevestiging),
      kan: Boolean(acc),
    },
    {
      document: 'Paklijst',
      nummer: p.paklijst?.id ?? '—',
      status: p.paklijst ? (p.paklijst.verzondenOp ? 'Verzonden' : 'Concept') : 'Nog niet',
      statusKleur: p.paklijst?.verzondenOp ? 'ok' : '',
      datumTekst: datum(p.paklijst?.verzondenOp),
      bedrag: '—',
      herkomst: p.paklijst
        ? `${p.paklijst.regels.length} regels uit de productieorders`
        : 'ontstaat als alle productiestappen gereed zijn',
      bestaat: Boolean(p.paklijst),
      kan: alleStappenGereed,
    },
    {
      document: 'Factuur',
      nummer: p.factuur?.id ?? '—',
      status: p.factuur ? (p.factuur.verzondenOp ? 'Verzonden' : 'Concept') : 'Nog niet',
      statusKleur: p.factuur?.verzondenOp ? 'ok' : '',
      datumTekst: datum(p.factuur?.verzondenOp),
      bedrag: eur(p.factuur?.totaalInclBtw ?? null),
      herkomst: p.factuur
        ? `uit ${p.factuur.offerteId}${
            p.factuur.vervaldatum
              ? ` · vervalt ${datum(p.factuur.vervaldatum)} · ${relatieveDagen(p.factuur.vervaldatum)}`
              : ''
          }`
        : 'ontstaat als de paklijst verzonden is',
      bestaat: Boolean(p.factuur),
      kan: Boolean(p.paklijst?.verzondenOp),
    },
  ]
}

export function DocumentenTab({
  project,
  geblokkeerd,
  onOpenen,
  onMaken,
}: {
  project: Project
  geblokkeerd: boolean
  onOpenen: (doc: string) => void
  onMaken: (doc: string) => void
}) {
  const rijen = bouwRijen(project)
  const f = project.factuur
  const vervalDagen = dagenTot(f?.vervaldatum)

  return (
    <>
      <Card titel="Documenten" plat>
        <table className="pdv2-tbl">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Document</th>
              <th style={{ width: 130 }}>Nummer</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 104 }}>Datum</th>
              <th className="num" style={{ width: 116 }}>
                Bedrag
              </th>
              <th>Ontstaat doordat</th>
              <th style={{ width: 92 }} />
            </tr>
          </thead>
          <tbody>
            {rijen.map((r) => (
              <tr key={r.document}>
                <td>{r.document}</td>
                <td className="mono">{r.nummer}</td>
                <td>
                  <span className={`pdv2-pill ${r.statusKleur}`}>{r.status}</span>
                </td>
                <td className="mono">{r.datumTekst}</td>
                <td className="num">{r.bedrag}</td>
                <td style={{ color: 'var(--text3)' }}>{r.herkomst}</td>
                <td>
                  {r.bestaat ? (
                    <button
                      type="button"
                      className="pdv2-btn s"
                      onClick={() => onOpenen(r.document)}
                    >
                      Openen
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`pdv2-btn s ${r.kan ? 'primair' : ''}`}
                      disabled={!r.kan || geblokkeerd}
                      onClick={() => onMaken(r.document)}
                    >
                      Maken
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {project.paklijst && (
        <Card titel="Paklijstregels" teller={project.paklijst.id} plat>
          <table className="pdv2-tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Productieorder</th>
                <th>Artikel</th>
                <th className="num" style={{ width: 90 }}>
                  Aantal
                </th>
              </tr>
            </thead>
            <tbody>
              {project.paklijst.regels.map((r, i) => (
                <tr key={`${r.productieOrderId}-${i}`}>
                  <td className="mono">{r.productieOrderId}</td>
                  <td>{r.artikelNaam}</td>
                  <td className="num">
                    {getal(r.qty)} {r.eenheid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {f && (
        <Card
          titel="Factuur"
          teller={f.id}
          acties={
            f.vervaldatum ? (
              <span
                className={`pdv2-pill ${
                  vervalDagen !== null && vervalDagen < 0
                    ? 'dgr'
                    : vervalDagen !== null && vervalDagen <= 14
                      ? 'warn'
                      : ''
                }`}
              >
                {vervalDagen !== null && vervalDagen < 0
                  ? 'Over vervaldatum'
                  : `Vervalt ${datum(f.vervaldatum)}`}
              </span>
            ) : null
          }
        >
          <div className="pdv2-kv">
            <span>Subtotaal</span>
            <span className="mono">{eur(f.subtotaal)}</span>
          </div>
          <div className="pdv2-kv">
            <span>Btw {f.btwPct} %</span>
            <span className="mono">{eur(f.btwBedrag)}</span>
          </div>
          <div className="pdv2-kv" style={{ fontWeight: 600 }}>
            <span>Totaal incl. btw</span>
            <span className="mono">{eur(f.totaalInclBtw)}</span>
          </div>
          <div className="pdv2-kv">
            <span>Verzonden</span>
            <span className="mono">{datum(f.verzondenOp)}</span>
          </div>
        </Card>
      )}
    </>
  )
}
