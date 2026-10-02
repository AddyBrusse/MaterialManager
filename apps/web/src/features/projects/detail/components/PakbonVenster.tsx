import { useMemo, useState } from 'react'
import { berekenVoortgang, type PakbonRegelKeuze, type Project } from '@stockmanager/shared'
import { getal } from '../lib/format'

interface Props {
  project: Project
  /** Maakt de pakbon; gooit een `Weigering` als het niet kan (de aanroeper meldt). */
  onMaak: (regels: PakbonRegelKeuze[]) => boolean
  onSluit: () => void
}

/**
 * "Pakbon maken": welke regels en hoeveel er nu meegaan (besloten 2026-10-02).
 *
 * Standaard alles wat klaarligt — meestal klopt dat, en dan is het één klik.
 * Wie een deel wil leveren, vinkt regels uit of zet een lager aantal. Meer dan
 * klaarligt kan niet: dan zegt de knop wat er eerst moet (`waaromNietPakbon`).
 */
export function PakbonVenster({ project, onMaak, onSluit }: Props) {
  const v = useMemo(() => berekenVoortgang(project), [project])
  const [keuze, setKeuze] = useState<Record<string, { aan: boolean; qty: string }>>(() =>
    Object.fromEntries(v.regels.map((r) => [r.offerteRegelId, { aan: r.klaar > 0, qty: String(r.klaar) }])),
  )

  const gekozen: PakbonRegelKeuze[] = v.regels
    .filter((r) => keuze[r.offerteRegelId]?.aan)
    .map((r) => ({ offerteRegelId: r.offerteRegelId, qty: Number(keuze[r.offerteRegelId].qty.replace(',', '.')) }))
  const stuks = gekozen.reduce((s, g) => s + (Number.isFinite(g.qty) ? g.qty : 0), 0)
  const zet = (id: string, deel: Partial<{ aan: boolean; qty: string }>) =>
    setKeuze((oud) => ({ ...oud, [id]: { ...oud[id], ...deel } }))

  // Wat er na deze pakbon nog openstaat, in een zin: is het een deellevering?
  const naKlaar = v.klaar - stuks
  const gevolg =
    v.teMaken > 0
      ? `Deellevering: daarna nog ${getal(v.teMaken)} te maken${naKlaar > 0 ? ` en ${getal(naKlaar)} klaar in de hal` : ''}. Het project blijft in productie.`
      : naKlaar > 0
        ? `Deellevering: daarna liggen er nog ${getal(naKlaar)} klaar. Het project blijft "Gereed voor levering".`
        : 'Hiermee gaat alles mee. Na versturen staat het project op "Geleverd".'

  return (
    <div role="dialog" aria-modal="true" aria-label="Pakbon maken" className="pdv2-modal-achter" onClick={onSluit}
      onKeyDown={(e) => e.key === 'Escape' && onSluit()}>
      <div className="pdv2-card pdv2-modal pdv2-pakbon" onClick={(e) => e.stopPropagation()}>
        <div className="pdv2-card-head">
          <h2>Pakbon maken</h2>
          <span className="pdv2-count">
            {v.aantalPakbonnen > 0 ? `${v.aantalPakbonnen + 1}e pakbon van dit project` : 'eerste pakbon van dit project'}
          </span>
        </div>
        <div className="pdv2-pakbon-lijst">
          <table className="pdv2-tbl">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Regel</th>
                <th className="num" style={{ width: 70 }}>Besteld</th>
                <th className="num" style={{ width: 70 }}>Gemaakt</th>
                <th className="num" style={{ width: 90 }}>Al geleverd</th>
                <th className="num" style={{ width: 70 }}>Klaar</th>
                <th className="num" style={{ width: 120 }}>Nu leveren</th>
              </tr>
            </thead>
            <tbody>
              {v.regels.map((r) => {
                const k = keuze[r.offerteRegelId]
                const qty = Number(k.qty.replace(',', '.'))
                const teVeel = k.aan && qty > r.klaar
                const leeg = r.klaar === 0
                return (
                  <tr key={r.offerteRegelId} className={leeg ? 'vervallen' : undefined}>
                    <td>
                      <input type="checkbox" checked={k.aan} disabled={leeg}
                        aria-label={`${r.naam} op de pakbon`}
                        onChange={(e) => zet(r.offerteRegelId, { aan: e.currentTarget.checked })} />
                    </td>
                    <td>
                      {r.naam}
                      {leeg && (
                        <span className="sub">
                          {r.geleverd >= r.besteld ? 'Alles al geleverd' : 'Nog niets klaar — eerst gereedmelden op de Productie-tab'}
                        </span>
                      )}
                      {teVeel && <span className="sub pdv2-let">Er liggen er maar {getal(r.klaar)} klaar</span>}
                    </td>
                    <td className="num">{getal(r.besteld)}</td>
                    <td className="num">{getal(r.gemaakt)}</td>
                    <td className="num">{getal(r.geleverd)}</td>
                    <td className="num"><strong>{getal(r.klaar)}</strong></td>
                    <td className="num">
                      {!leeg && (
                        <span className="pdv2-pakbon-aantal">
                          <input inputMode="decimal" value={k.qty} disabled={!k.aan}
                            aria-label={`Aantal ${r.naam}`}
                            onChange={(e) => zet(r.offerteRegelId, { qty: e.currentTarget.value })} />
                          <span>{r.eenheid}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pdv2-pakbon-voet">
          <span className="pdv2-pakbon-gevolg">{gekozen.length > 0 ? gevolg : 'Vink aan wat er mee moet.'}</span>
          <button type="button" className="pdv2-btn" onClick={onSluit}>Annuleren</button>
          <button type="button" className="pdv2-btn primair" onClick={() => onMaak(gekozen) && onSluit()}>
            Pakbon maken — {gekozen.length} {gekozen.length === 1 ? 'regel' : 'regels'}, {getal(stuks)} stuks
          </button>
        </div>
      </div>
    </div>
  )
}
