import { prijsVoor, type PrijsBronnen } from '../../utils/artikel-prijs'
import type { Article } from '../../api/articles'
import type { CandidateLine } from '@stockmanager/shared'

/**
 * De prijs van de klant naast die van ons — features/60-mail-import.md §3.7.
 *
 * Een klant die bestelt tegen een oude prijslijst is het geval waar dit voor
 * bestaat: de order ziet er normaal uit, de regels kloppen, en pas bij het
 * factureren blijkt dat er te weinig op staat. Dat moet vóór het bevestigen
 * opvallen, niet erna.
 *
 * Alleen vergelijken als de klant écht een prijs noemt. Bij een offerteaanvraag
 * staat er niets, en dan is er ook niets mis.
 */

/** Onder dit verschil is het afronding, geen andere prijs. */
const TOLERANTIE_EURO = 0.01

export interface PrijsVergelijking {
  /** Wat de klant in zijn document zette, per stuk. */
  klant: number
  /** Wat onze calculatie zegt bij dit aantal. */
  onze: number
  verschil: number
  /** Positief = de klant rekent te weinig; dat is de kant die geld kost. */
  klantLager: boolean
  procent: number
}

export function vergelijkPrijs(
  line: CandidateLine,
  article: Article | null,
  bronnen: PrijsBronnen
): PrijsVergelijking | null {
  if (line.klantPrijs === null || !article) return null
  const { verkoopprijs } = prijsVoor(article, bronnen, line.qty ?? 1)
  // Zonder calculatie is onze prijs 0 — dan valt er niets te vergelijken, en
  // een melding "de klant rekent te veel" zou onzin zijn.
  if (verkoopprijs <= 0) return null

  const verschil = line.klantPrijs - verkoopprijs
  if (Math.abs(verschil) < TOLERANTIE_EURO) return null

  return {
    klant: line.klantPrijs,
    onze: verkoopprijs,
    verschil,
    klantLager: verschil < 0,
    procent: Math.round((verschil / verkoopprijs) * 1000) / 10,
  }
}

/** Hoeveel regels wijken af, en hoeveel daarvan in ons nadeel. */
export function telAfwijkingen(
  vergelijkingen: (PrijsVergelijking | null)[]
): { totaal: number; inOnsNadeel: number } {
  const echte = vergelijkingen.filter((v): v is PrijsVergelijking => v !== null)
  return { totaal: echte.length, inOnsNadeel: echte.filter((v) => v.klantLager).length }
}
