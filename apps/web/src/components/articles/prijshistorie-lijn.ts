import type { PrijsSnapshot } from '../../api/prijshistorie'

/**
 * Van snapshots naar wat de grafiek en de kop nodig hebben.
 *
 * Apart van het scherm zodat het te testen is zonder browser — de regel die
 * hier het meeste toe doet is dat een prijs per stuk zonder aantal niet te
 * lezen is: instelkosten worden over de batch verdeeld, dus € 40 bij 1 stuk en
 * € 15 bij 5 stuks kunnen dezelfde calculatie zijn.
 */

export interface LijnPunt {
  /** Epoch-ms: de x-as is een tijdschaal, geen rij gelijke stapjes. Tussen twee
   *  orders kan een dag of een jaar zitten en dat hoort te zien te zijn. */
  t: number
  datum: string
  bron: PrijsSnapshot['bron']
  /** Wat de lijnen tekenen: herrekend bij 1 stuk, dus over de tijd te
   *  vergelijken. Zonder deze normalisatie duikt de lijn bij elke grote order
   *  omlaag terwijl er niets goedkoper geworden is — insteltijd wordt over de
   *  batch verdeeld. */
  kostprijs: number
  verkoopprijs: number
  /** Wat er op dat moment werkelijk gold, bij dit aantal. Staat in de tooltip
   *  en de tabel, niet in de lijn. */
  kostprijsBijAantal: number
  betaaldPerStuk: number | null
  qty: number
  klant: string | null
  offerteId: string | null
}

export function naarLijn(snapshots: PrijsSnapshot[]): LijnPunt[] {
  return [...snapshots]
    .sort((a, b) => a.gemetenOp.localeCompare(b.gemetenOp))
    .map((s) => ({
      t: new Date(s.gemetenOp).getTime(),
      datum: s.gemetenOp,
      bron: s.bron,
      kostprijs: s.kostprijsBasis,
      verkoopprijs: s.verkoopprijsBasis,
      kostprijsBijAantal: s.kostprijsPerStuk,
      betaaldPerStuk: s.verkoopprijsPerStuk,
      qty: s.qty,
      klant: s.klant,
      offerteId: s.offerteId,
    }))
}

export interface Samenvatting {
  laatsteKostprijs: number | null
  laatsteVerkoopprijs: number | null
  /** Verschil tussen de eerste en de laatste kostprijs, in procenten. Null bij
   *  minder dan twee punten of een eerste kostprijs van 0 — daar is geen
   *  percentage van te maken. */
  verschilPct: number | null
  aantalOrders: number
  eerste: string | null
  laatste: string | null
}

export function samenvatten(punten: LijnPunt[]): Samenvatting {
  if (punten.length === 0) {
    return {
      laatsteKostprijs: null, laatsteVerkoopprijs: null, verschilPct: null,
      aantalOrders: 0, eerste: null, laatste: null,
    }
  }
  const eerste = punten[0]
  const laatste = punten[punten.length - 1]
  const verschilPct = punten.length > 1 && eerste.kostprijs > 0
    ? Math.round(((laatste.kostprijs / eerste.kostprijs) - 1) * 1000) / 10
    : null
  return {
    laatsteKostprijs: laatste.kostprijs,
    laatsteVerkoopprijs: laatste.verkoopprijs,
    verschilPct,
    aantalOrders: punten.filter((p) => p.bron === 'order').length,
    eerste: eerste.datum,
    laatste: laatste.datum,
  }
}

/**
 * Het bereik van de y-as: rond de waarden heen, niet vanaf nul.
 *
 * Vanaf nul beginnen zou hier de beweging wegdrukken — een kostprijs die van
 * € 75 naar € 92 loopt is een vlakke streep boven in het vlak als de as bij 0
 * begint. Dit is een prijsverloop, geen vergelijking van staven, dus het gaat
 * om de verandering. Wel altijd met de bedragen op de as erbij, zodat niemand
 * de sprong voor groter aanziet dan hij is.
 */
export function yDomein(punten: LijnPunt[]): [number, number] {
  const waarden = punten.flatMap((p) => [p.kostprijs, p.verkoopprijs])
  const min = Math.min(...waarden)
  const max = Math.max(...waarden)
  const marge = Math.max((max - min) * 0.15, max * 0.02, 1)
  return [Math.max(0, Math.floor((min - marge) / 5) * 5), Math.ceil((max + marge) / 5) * 5]
}

/** € 12,50 — zonder valuta-teken waar de kolom dat al draagt. */
export function euro(v: number | null, metTeken = true): string {
  if (v == null) return '—'
  const n = v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return metTeken ? `€ ${n}` : n
}

export function datumKort(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Alleen maand + jaar op de as: bij vier punten in een jaar is een volledige
 *  datum per tick onleesbaar smal. */
export function asLabel(t: number): string {
  return new Date(t).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
}
