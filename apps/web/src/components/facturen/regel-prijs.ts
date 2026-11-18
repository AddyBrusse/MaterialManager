import { afspraakTekst, afspraakVoorKlant, prijsVoor, type ArtikelVerkoopInfo, type Prijsafspraak } from '@stockmanager/shared'
import type { Article } from '../../api/articles'
import type { PrijsBronnen } from '../../utils/artikel-prijs'

/**
 * Welke prijs een regel van een losse factuur voorgesteld krijgt (2026-11-18),
 * en waarom. Eerst de prijsafspraak met de klant; dan wat de klant de laatste
 * keer betaalde; dan de calculatie. Altijd te overschrijven: dan is het "hand".
 */
export type PrijsBron = 'afspraak' | 'laatste' | 'calculatie' | 'hand'

export interface PrijsVoorstel {
  prijs: number
  bron: PrijsBron
  /** Voor onder de prijs: "afspraak € 12,50 vanaf 10 st" of "laatst € 12,00 op 03-11-2026". */
  tekst: string
}

const euro = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const dag = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`

export function voorgesteldePrijs(
  artikel: Article,
  klantId: string | null,
  afspraken: Prijsafspraak[],
  info: ArtikelVerkoopInfo | undefined,
  qty: number,
  bronnen: PrijsBronnen,
  vandaag: string,
): PrijsVoorstel {
  const a = afspraakVoorKlant(artikel, klantId, afspraken.filter((x) => x.artikelId === artikel.id), qty, vandaag)
  if (a) return { prijs: a.prijs, bron: 'afspraak', tekst: `afspraak ${afspraakTekst(a)}` }
  if (info?.laatste) {
    return { prijs: info.laatste.prijs, bron: 'laatste', tekst: `laatst ${euro(info.laatste.prijs)} op ${dag(info.laatste.datum)}` }
  }
  const calc = artikel.estimate ? prijsVoor(artikel, bronnen, qty).verkoopprijs : 0
  if (calc > 0) return { prijs: calc, bron: 'calculatie', tekst: 'uit de calculatie' }
  return { prijs: 0, bron: 'hand', tekst: 'geen prijs bekend: vul hem in' }
}
