import { stangenTekst, type PlanRegel } from '../../../api/materiaal-plan'
import { VoorstelKaart } from './VoorstelKaart'

const nl = (n: number, d = 0) => n.toLocaleString('nl-NL', { maximumFractionDigits: d })

/** "50 st gereserveerd · rest besteld" — wat er van een regel al geregeld is. */
export function dekkingTekst(r: PlanRegel): string {
  const d = r.dekking
  if (d.gedektStuks >= d.nodigStuks) return `${nl(d.nodigStuks)} st gereserveerd`
  return [
    d.gedektStuks > 0 ? `${nl(d.gedektStuks)} van ${nl(d.nodigStuks)} st gereserveerd` : null,
    d.besteld ? (d.gedektStuks > 0 ? 'rest besteld' : 'besteld') : null,
  ].filter(Boolean).join(' · ') || 'nog niets gekozen'
}

/**
 * Het kiezen voor één materiaalregel: wat er nog gezaagd moet worden, de vrije
 * voorraad van dat materiaal en de voorstellen (2026-10-09, per regel sinds
 * 2026-10-23). Is de regel al geregeld, dan zegt hij alleen hoe.
 */
export function RegelKeuze({ regel, keuze, weg, onKies, onWeg }: {
  regel: PlanRegel
  keuze: number
  weg: Set<string>
  onKies: (i: number) => void
  onWeg: (barId: string, aan: boolean) => void
}) {
  if (regel.fout) {
    return <div className="hk-romp"><div className="hk-tekort">{regel.fout}</div></div>
  }
  const b = regel.behoefte
  if (!b) {
    return (
      <div className="hk-romp">
        <div className="hk-klaar">
          <b>{regel.materiaal}</b> is geregeld: {dekkingTekst(regel)}.
          {regel.dekking.besteld && regel.dekking.gedektStuks < regel.dekking.nodigStuks
            && ' Wat ontbreekt staat op de bestellijst (Inkoop → Te bestellen).'}
        </div>
      </div>
    )
  }
  const voorstel = regel.voorstellen[keuze]
  const inVoorstel = new Set(voorstel?.regels.map((r) => r.barId))
  const lader = regel.gebruikt.lader
  const schaal = Math.max(1, ...regel.kandidaten.map((k) => k.vrijMm))
  const deels = regel.dekking.gedektStuks > 0
  return (
    <>
      <div className="hk-behoefte">
        <span>{lader ? <>Stangenlader <b>{lader.machineNaam}</b> · {b.stuksPerStang} st per volle stang</> : <>Alleen lengte, elk stuk gezaagd</>}</span>
        {deels && <span>Al gereserveerd <b>{nl(regel.dekking.gedektStuks)} st</b> · nog <b>{nl(b.aantal)} st</b></span>}
        <span>Nodig: <b>{stangenTekst(b.stangen)}</b></span>
        <span>Totaal te zagen <b>{nl(b.totaalMm)} mm</b> · per stuk <b>{nl(b.perStukMm, 1)} mm</b></span>
        {b.aangevuldTotMin && <span style={{ color: 'var(--warning)' }}>Kortste stang opgerekt tot het minimum van de lader ({nl(lader?.barloaderMinMm ?? 0)} mm)</span>}
      </div>
      <div className="hk-romp">
        <div className="hk-voorraad mk-tabel" style={{ border: 0 }}>
          <div className="k" style={{ marginBottom: 4 }}>Vrije voorraad van {regel.materiaal}</div>
          <table>
            <thead><tr><th>Nr.</th><th className="n">Vrij</th><th>Locatie</th><th /></tr></thead>
            <tbody>
              {[...regel.kandidaten].sort((x, y) => x.vrijMm - y.vrijMm).map((k) => (
                <tr key={k.id} data-gekozen={inVoorstel.has(k.id) || undefined}>
                  <td className="mono">{k.code}</td>
                  <td className="n">{nl(k.vrijMm)}</td>
                  <td className="dim">{k.locatie ?? '—'}</td>
                  <td>{inVoorstel.has(k.id) && <span className="mk-tag">in voorstel {String.fromCharCode(65 + keuze)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {regel.kandidaten.length === 0 && <div className="voet">Geen vrije staven van dit materiaal.</div>}
          <div className="voet">Rest onder {nl(regel.gebruikt.schrootDrempelMm)} mm = schroot: de staaf is daarna op.</div>
        </div>
        <div className="hk-voorstellen">
          {regel.voorstellen.map((v, i) => (
            <VoorstelKaart key={v.sleutel || i} v={v} letter={String.fromCharCode(65 + i)} gekozen={i === keuze}
              weg={weg} schaalMm={schaal} zaagsnedeMm={regel.gebruikt.zaagsnedeMm}
              onKies={() => onKies(i)} onWeg={onWeg} />
          ))}
        </div>
      </div>
    </>
  )
}
