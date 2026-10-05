import type { OrderNacalculatie } from '../../../../../api/nacalculatie'
import { articlesApi } from '../../../../../api/articles'
import { ArtikelPreviewThumb } from '../../../../../components/projecten/ArtikelPreviewThumb'
import { BoomCel, KostenCellen, TijdCellen, VerschilCellen } from './cellen'
import { MachineRijen } from './MachineRijen'

interface Props {
  o: OrderNacalculatie
  isOpen: (sleutel: string) => boolean
  onToggle: (sleutel: string) => void
}

/** Wat er over de zaagbonnen van deze regel te zeggen valt, als zin. */
function bonTekst(b: OrderNacalculatie['zaagbonnen']): string {
  const bonnen = (n: number) => `${n} zaagbon${n === 1 ? '' : 'nen'}`
  if (b.afgeboekt > 0 && b.open > 0) {
    return `Afgeboekt van de staaf: ${bonnen(b.afgeboekt)}; nog open: ${bonnen(b.open)}`
  }
  if (b.afgeboekt > 0) return `Afgeboekt van de staaf: ${bonnen(b.afgeboekt)}`
  if (b.open > 0) return `Nog niet afgeboekt (${bonnen(b.open)} open) — werkelijk volgt bij gereedmelden`
  return 'Geen zaagbon — werkelijk is niet bekend'
}

/** Tijd van alle machines samen; werkelijk alleen als er iets gemeten is. */
function tijdVan(o: OrderNacalculatie) {
  let gecalcMin = 0
  let werkSec = 0
  let gemeten = false
  for (const m of o.machines) {
    if (m.gecalculeerd) gecalcMin += m.gecalculeerd.instelMin + m.gecalculeerd.draaienMin
    if (m.werkelijk) {
      werkSec += m.werkelijk.instelSeconden + m.werkelijk.draaienSeconden
      gemeten = true
    }
  }
  return { gecalcMin, werkSec: gemeten ? werkSec : null }
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
  // Iets gemeten of afgeboekt: dan is er een verschil, anders is werkelijk de calculatie.
  const telt = o.gemeten || o.zaagbonnen.afgeboekt > 0
  const afgeboekt = o.zaagbonnen.afgeboekt > 0
  const tijd = tijdVan(o)
  const artikel = o.artikelId ? articlesApi.get(o.artikelId) : null
  const tekening = artikel?.tekening ? `${artikel.tekening}${artikel.rev ? ` rev ${artikel.rev}` : ''} · ` : ''

  return (
    <>
      <tr className="pdv2-boom-0">
        <BoomCel diepte={0} open={open} onToggle={() => onToggle(sleutel)}
          beeld={<ArtikelPreviewThumb article={artikel} size={48} />}>
          <strong>{o.artikelNaam}</strong>
          <span className="sub">
            {tekening}{o.qty} besteld · {o.gemeten ? `${o.gemaakteStuks} gemaakt volgens de klokregels` : 'nog geen uren geklokt'}
          </span>
        </BoomCel>
        <TijdCellen gecalcMin={tijd.gecalcMin} werkSec={tijd.werkSec} />
        <KostenCellen gecalc={o.gecalculeerdTotaal} werk={telt ? o.werkelijkTotaal : null} />
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
              <TijdCellen gecalcMin={null} werkSec={null} />
              <KostenCellen gecalc={materiaal.gecalculeerd} werk={afgeboekt ? materiaal.werkelijk : null} />
              <VerschilCellen
                verschil={afgeboekt ? materiaal.verschil : null}
                pctWaarde={materiaal.verschilPct}
              />
            </tr>
          )}
          {o.machines.map((m) => {
            const ms = `m:${o.orderId}:${m.sleutel}`
            return <MachineRijen key={m.sleutel} m={m} open={isOpen(ms)} onToggle={() => onToggle(ms)} />
          })}
          {extern && extern.gecalculeerd > 0 && (
            <tr className="pdv2-boom-1">
              <BoomCel diepte={1}>
                Uitbesteed
                <span className="sub">Werkelijk nog niet bij te houden — het gecalculeerde bedrag telt</span>
              </BoomCel>
              <TijdCellen gecalcMin={null} werkSec={null} />
              <KostenCellen gecalc={extern.gecalculeerd} werk={null} />
              <VerschilCellen verschil={null} pctWaarde={null} />
            </tr>
          )}
        </>
      )}
    </>
  )
}
