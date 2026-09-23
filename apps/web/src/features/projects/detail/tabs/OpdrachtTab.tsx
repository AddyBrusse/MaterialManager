import type { Project, ProjectVoortgang, Todo } from '@stockmanager/shared'
import type { ZaagReservation } from '../../../../api/reservations'
import { houdtVast } from '../../../../api/reservations'
import { Card } from '../components/Card'
import { VoortgangBalk, voortgangTekst } from '../components/VoortgangBalk'
import { datum, getal } from '../lib/format'
import { geaccepteerdeOfferte } from '../lib/status'

interface Props {
  project: Project
  voortgang: ProjectVoortgang
  todos: Todo[]
  reserveringen: ZaagReservation[]
  geblokkeerd: boolean
  onAanmaken: () => void
  onOpenen: () => void
  onOpnieuwVersturen: () => void
  onNaarOrder: (orderId: string) => void
}

const BRON_START =
  'Aantallen en prijzen zijn een bevroren kopie van '
const BRON_EIND =
  ' — een nieuwe offerteversie verandert deze opdracht niet meer. Per regel ontstond één ' +
  'productieorder; de bewerkingen uit de offerteregel werden de stappen.'

/**
 * §5.3 — de tab bestaat altijd, ook leeg.
 *
 * De tweede kaart is de belangrijkste tabel van dit scherm: hier wordt de
 * offerte werk. Per regel zie je welk materiaal eraan hangt, of een mens dat
 * bevestigd heeft, en welke productieorder eruit ontstond.
 */
export function OpdrachtTab(props: Props) {
  const { project: p, voortgang, todos, reserveringen, geblokkeerd } = props
  const ob = p.opdrachtbevestiging
  const acc = geaccepteerdeOfferte(p)

  if (!ob) {
    return (
      <Card
        titel="Opdrachtbevestiging"
        acties={
          <button
            type="button"
            className={`pdv2-btn s ${acc ? 'primair' : ''}`}
            onClick={props.onAanmaken}
            disabled={!acc || geblokkeerd}
          >
            Opdracht aanmaken
          </button>
        }
      >
        <div className="pdv2-empty">
          Ontstaat zodra de klant een offerte accepteert. Dan bevriezen de regels, kies je per
          regel het materiaal en worden de productieorders met hun stappen aangemaakt.
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card
        titel="Opdrachtbevestiging"
        teller={`${ob.id} · bevroren kopie van ${ob.offerteId}${
          ob.verzondenOp ? ` · verzonden ${datum(ob.verzondenOp)}` : ''
        }`}
        acties={
          <>
            <span className={`pdv2-pill ${ob.verzondenOp ? 'ok' : ''}`}>
              {ob.verzondenOp ? 'Verzonden' : 'Concept'}
            </span>
            <button type="button" className="pdv2-btn s" onClick={props.onOpenen}>
              Openen
            </button>
            <button
              type="button"
              className="pdv2-btn s"
              onClick={props.onOpnieuwVersturen}
              disabled={geblokkeerd}
            >
              Opnieuw versturen
            </button>
          </>
        }
      >
        <div className="pdv2-grid3">
          <Veld label="Nummer" waarde={ob.id} mono />
          <Veld label="Uit offerte" waarde={ob.offerteId} mono />
          <Veld label="Toegezegde levertijd" waarde={datum(ob.levertijdDatum)} mono />
          <Veld label="Ondertekend door klant" waarde={p.klantRef ?? '—'} />
        </div>
      </Card>

      <Card titel="Regels en wat eruit ontstaat" plat bron={BRON_START + ob.offerteId + BRON_EIND}>
        <table className="pdv2-tbl">
          <thead>
            <tr>
              <th>Artikel</th>
              <th className="num" style={{ width: 66 }}>
                Besteld
              </th>
              <th style={{ width: 168 }}>Voortgang</th>
              <th style={{ width: 200 }}>Materiaal</th>
              <th>Bewerkingen → stappen</th>
              <th style={{ width: 120 }}>Productieorder</th>
            </tr>
          </thead>
          <tbody>
            {ob.regels.map((r) => {
              const order = p.productieOrders.find((o) => o.offerteRegelId === r.id) ?? null
              const openTodo = todos.find(
                (t) => !t.done && t.soort === 'materiaal_selecteren' && t.offerteRegelId === r.id,
              )
              const res = reserveringen.filter(
                (x) => x.artikelId && x.artikelId === r.artikelId && houdtVast(x),
              )
              // Drie toestanden, geen twee: een regel zonder reservering én
              // zonder openstaande todo is niet "todo open" — er ligt gewoon
              // nog niets. Dat amber zetten maakt het signaal betekenisloos
              // zodra het overal staat.
              const materiaalStand: 'bevestigd' | 'todo' | 'leeg' = openTodo
                ? 'todo'
                : res.length > 0
                  ? 'bevestigd'
                  : 'leeg'
              // De voortgang komt uit de gedeelde rekenkern, niet uit een
              // eigen telling hier: web en API moeten hetzelfde zeggen over
              // wat "geleverd" betekent.
              const v = voortgang.regels.find((x) => x.offerteRegelId === r.id) ?? null

              return (
                <tr key={r.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{r.naam}</span>
                    {r.omschrijving && <span className="sub">{r.omschrijving}</span>}
                  </td>
                  <td className="num">
                    {getal(r.qty)} {r.eenheid}
                  </td>
                  <td>
                    {v ? (
                      <>
                        <VoortgangBalk regel={v} breedte={148} />
                        <span className="sub">{voortgangTekst(v)}</span>
                      </>
                    ) : (
                      <span className="sub">geen voortgang bekend</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`pdv2-pill ${
                        materiaalStand === 'bevestigd'
                          ? 'ok'
                          : materiaalStand === 'todo'
                            ? 'warn'
                            : ''
                      }`}
                    >
                      {materiaalStand === 'bevestigd'
                        ? 'Bevestigd'
                        : materiaalStand === 'todo'
                          ? 'Todo open'
                          : 'Nog niets'}
                    </span>
                    <div style={{ marginTop: 2 }}>{res[0]?.materiaal ?? '—'}</div>
                    <span className="sub">
                      {materiaalStand === 'bevestigd'
                        ? `${((res[0].sawLength * res[0].pieces) / 1000)
                            .toFixed(2)
                            .replace('.', ',')} m gereserveerd · staaf ${res[0].barCode}`
                        : materiaalStand === 'todo'
                          ? 'voorstel uit de calculatie — nog niet door een mens bevestigd'
                          : 'nog geen materiaal gekozen voor deze regel'}
                    </span>
                  </td>
                  <td>
                    {r.bewerkingen.map((b) => (
                      <span className="pdv2-chip" key={b}>
                        {b}
                      </span>
                    ))}
                    <span className="sub">
                      {order ? `${order.stappen.length} stappen aangemaakt` : 'geen order'}
                    </span>
                  </td>
                  <td>
                    {order ? (
                      <button
                        type="button"
                        className="pdv2-link"
                        onClick={() => props.onNaarOrder(order.id)}
                      >
                        {order.id}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Veld({ label, waarde, mono }: { label: string; waarde: string; mono?: boolean }) {
  return (
    <div className="pdv2-veld">
      <label>{label}</label>
      <input readOnly value={waarde} className={mono ? 'mono' : undefined} />
    </div>
  )
}
