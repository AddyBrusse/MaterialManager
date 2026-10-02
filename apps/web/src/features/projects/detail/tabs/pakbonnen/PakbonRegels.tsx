import { IconTrash } from '@tabler/icons-react'
import { leverVoortgang, type Paklijst, type PakbonRegelKeuze, type Project } from '@stockmanager/shared'
import { getal } from '../../lib/format'
import { CelGetal } from '../OfferteRegels'

interface Props {
  project: Project
  pakbon: Paklijst
  bewerkbaar: boolean
  /** De hele nieuwe lijst; de aanroeper controleert en slaat op. `false` = geweigerd. */
  onWijzig: (regels: PakbonRegelKeuze[]) => boolean | void
}

/**
 * De regels van één pakbon, als kinderen van die pakbon — zoals de regels
 * onder een offerteversie. Bij een concept is het aantal in de tabel zelf aan
 * te passen, en kan er een regel bij of af. "Klaar" telt de stuks van deze
 * pakbon zelf weer mee: die zijn immers nog niet weg.
 */
export function PakbonRegels({ project, pakbon, bewerkbaar, onWijzig }: Props) {
  const v = leverVoortgang(project, pakbon.id)
  const huidig: PakbonRegelKeuze[] = pakbon.regels.map((r) => ({ offerteRegelId: r.offerteRegelId ?? '', qty: r.qty }))
  const erbij = v.regels.filter((r) => r.klaar > 0 && !huidig.some((h) => h.offerteRegelId === r.offerteRegelId))

  const zetAantal = (regelId: string, qty: number) =>
    onWijzig(huidig.map((h) => (h.offerteRegelId === regelId ? { ...h, qty } : h)))
  // Een verstuurde pakbon is een document: alleen wat erop stond. "Klaar" zou
  // daar rekenen alsof hij er niet was, en dat leest als een fout.
  const vol = bewerkbaar
  const weg = (regelId: string) => onWijzig(huidig.filter((h) => h.offerteRegelId !== regelId))
  const voegToe = (regelId: string) => {
    const r = v.regels.find((x) => x.offerteRegelId === regelId)
    if (r) onWijzig([...huidig, { offerteRegelId: regelId, qty: r.klaar }])
  }

  return (
    <div className="pdv2-kind">
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th>Regel</th>
            <th className="num" style={{ width: 80 }}>Besteld</th>
            {vol && <th className="num" style={{ width: 80 }}>Gemaakt</th>}
            {vol && <th className="num" style={{ width: 130 }}>Op andere pakbonnen</th>}
            {vol && <th className="num" style={{ width: 80 }}>Klaar</th>}
            <th className="num" style={{ width: 140 }}>Op deze pakbon</th>
            {bewerkbaar && <th style={{ width: 44 }} />}
          </tr>
        </thead>
        <tbody>
          {pakbon.regels.length === 0 && (
            <tr>
              <td colSpan={99} className="pdv2-empty">
                Nog geen regels. Voeg hieronder toe wat er mee moet.
              </td>
            </tr>
          )}
          {pakbon.regels.map((r) => {
            const rv = v.regels.find((x) => x.offerteRegelId === r.offerteRegelId)
            const teVeel = rv ? r.qty > rv.klaar : false
            return (
              <tr key={r.offerteRegelId ?? r.productieOrderId}>
                <td>
                  {r.artikelNaam}
                  {bewerkbaar && teVeel && rv && (
                    <span className="sub pdv2-let">Er liggen er maar {getal(rv.klaar)} klaar</span>
                  )}
                </td>
                <td className="num">{rv ? getal(rv.besteld) : '—'}</td>
                {vol && <td className="num">{rv ? getal(rv.gemaakt) : '—'}</td>}
                {vol && <td className="num">{rv ? getal(rv.geleverd) : '—'}</td>}
                {vol && <td className="num">{rv ? getal(rv.klaar) : '—'}</td>}
                <td className="num" style={{ paddingRight: 14 }}>
                  {bewerkbaar && r.offerteRegelId ? (
                    <CelGetal waarde={r.qty} onKlaar={(n) => zetAantal(r.offerteRegelId!, n)} />
                  ) : (
                    getal(r.qty)
                  )}{' '}
                  {r.eenheid}
                </td>
                {bewerkbaar && (
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="pdv2-btn s stil"
                      title="Van deze pakbon halen"
                      aria-label={`${r.artikelNaam} van de pakbon halen`}
                      onClick={() => r.offerteRegelId && weg(r.offerteRegelId)}
                    >
                      <IconTrash size={12} />
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {bewerkbaar && erbij.length > 0 && (
        <div className="pdv2-kind-acties pdv2-pakbon-erbij">
          <span>Regel toevoegen:</span>
          {erbij.map((r) => (
            <button key={r.offerteRegelId} type="button" className="pdv2-btn s" onClick={() => voegToe(r.offerteRegelId)}>
              + {r.naam} ({getal(r.klaar)} klaar{r.teMaken > 0 ? ', deels' : ''})
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
