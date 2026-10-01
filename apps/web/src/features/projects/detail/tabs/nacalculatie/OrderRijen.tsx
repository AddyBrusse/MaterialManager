import type { OrderNacalculatie } from '../../../../../api/nacalculatie'
import { eur } from '../../lib/format'
import { BoomCel, VerschilCellen } from './cellen'
import { MachineRijen } from './MachineRijen'

interface Props {
  o: OrderNacalculatie
  isOpen: (sleutel: string) => boolean
  onToggle: (sleutel: string) => void
}

/** Wat er over de zaagbonnen van deze regel te zeggen valt. */
function bonTekst(b: OrderNacalculatie['zaagbonnen']): string {
  const delen: string[] = []
  if (b.afgeboekt > 0) delen.push(`${b.afgeboekt} zaagbon${b.afgeboekt === 1 ? '' : 'nen'} afgeboekt`)
  if (b.open > 0) delen.push(`${b.open} nog open — wordt afgeboekt bij gereedmelden`)
  if (delen.length === 0) return 'geen zaagbon — gecalculeerd bedrag'
  return delen.join(' · ')
}

/**
 * Niveau 1 van de boom: een orderregel. Uitgeklapt materiaal, een rij per
 * machine en uitbesteed werk.
 */
export function OrderRijen({ o, isOpen, onToggle }: Props) {
  const sleutel = `o:${o.orderId}`
  const open = isOpen(sleutel)
  const post = (naam: string) => o.regels.find((r) => r.post === naam)
  const materiaal = post('materiaal')
  const extern = post('extern')
  // Gecalculeerd maar niet gebruikt: die namen horen bij een machine die
  // wel gebruikt maar niet gecalculeerd is.
  const ongebruikt = o.machines.filter((m) => m.gecalculeerd && !m.werkelijk).map((m) => m.naam)
  // Iets gemeten of afgeboekt: dan is er een verschil, anders is werkelijk de calculatie.
  const telt = o.gemeten || o.zaagbonnen.afgeboekt > 0

  return (
    <>
      <tr className="pdv2-boom-0">
        <BoomCel diepte={0} open={open} onToggle={() => onToggle(sleutel)}>
          <strong>{o.artikelNaam}</strong>
          <span className="sub">
            {o.qty} st · {o.gemeten ? `${o.gemaakteStuks} gemaakt volgens de klok` : 'nog niet gemeten'}
          </span>
        </BoomCel>
        <td />
        <td className="num">{eur(o.gecalculeerdTotaal)}</td>
        <td className="num">{eur(o.werkelijkTotaal)}</td>
        <VerschilCellen verschil={telt ? o.verschilTotaal : null} pctWaarde={o.verschilPct} />
      </tr>
      {open && (
        <>
          {materiaal && (
            <tr className="pdv2-boom-1">
              <BoomCel diepte={1}>
                Materiaal
                <span className="sub">{bonTekst(o.zaagbonnen)}</span>
              </BoomCel>
              <td />
              <td className="num">{eur(materiaal.gecalculeerd)}</td>
              <td className="num">{o.zaagbonnen.afgeboekt > 0 ? eur(materiaal.werkelijk) : '—'}</td>
              <VerschilCellen
                verschil={o.zaagbonnen.afgeboekt > 0 ? materiaal.verschil : null}
                pctWaarde={materiaal.verschilPct}
              />
            </tr>
          )}
          {o.machines.map((m) => {
            const ms = `m:${o.orderId}:${m.sleutel}`
            return (
              <MachineRijen
                key={m.sleutel}
                m={m}
                ongebruikt={m.gecalculeerd ? [] : ongebruikt}
                open={isOpen(ms)}
                onToggle={() => onToggle(ms)}
              />
            )
          })}
          {extern && extern.gecalculeerd > 0 && (
            <tr className="pdv2-boom-1">
              <BoomCel diepte={1}>
                Uitbesteed
                <span className="sub">{extern.toelichting}</span>
              </BoomCel>
              <td />
              <td className="num">{eur(extern.gecalculeerd)}</td>
              <td className="num">{eur(extern.werkelijk)}</td>
              <VerschilCellen verschil={null} pctWaarde={null} />
            </tr>
          )}
        </>
      )}
    </>
  )
}
