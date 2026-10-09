/**
 * Welke staven zagen we voor een opdracht? (herzien 2026-10-09)
 *
 * De lengtes staan al vast vóór de voorraad erbij komt: `materiaalBehoefte`
 * (`bruto-lengte.ts`) maakt van het aantal stuks een lijst laderstangen — zo
 * veel mogelijk stuks per stang binnen de lader, gelijk verdeeld — of, zonder
 * lader, één lengte per stuk. Hier worden die lengtes tegen de voorraad
 * gelegd.
 *
 * De rekenkern is bewust puur: geen database, geen fetch. Hij geeft een paar
 * voorstellen terug, het beste eerst; kiezen en vastleggen doet een mens
 * (nooit automatisch, zie CLAUDE.md).
 *
 * ── Wat is "het beste"? (afgesproken 2026-10-09) ──────────────────────────
 *
 *   1. alles gedekt
 *   2. de meeste staven helemaal op — een restant dat precies past en daarna
 *      afgeboekt kan worden is ideaal
 *   3. het minste schroot
 *   4. geen korte rest aanmaken: liever een lange staaf aansnijden dan van een
 *      staaf van 3 m een stuk overhouden waar niemand meer iets mee kan
 *   5. zo min mogelijk staven
 *
 * Of een rest bruikbaar is, beslist voorlopig de mens: bij het kiezen kan hij
 * een rest meteen laten afboeken (`restAfboeken` op de reservering).
 */

import type { TeZagen } from './bruto-lengte'

export interface PlanStaaf {
  id: string
  code: string
  /** Vrije lengte: fysiek minus wat er al gereserveerd ligt. */
  vrijMm: number
  locatie?: string | null
}

export interface VoorstelInvoer {
  /** Uit `materiaalBehoefte`. */
  stangen: TeZagen[]
  zaagsnedeMm: number
  /** Restant hieronder is schroot; daarboven gaat het terug in het rek. */
  schrootDrempelMm: number
  staven: PlanStaaf[]
}

export interface VoorstelRegel {
  barId: string
  barCode: string
  locatie: string | null
  vrijMm: number
  /** Wat er uit deze staaf gezaagd wordt. */
  stangen: TeZagen[]
  stuks: number
  /** Wat er van de staaf af gaat, zaagsneden inbegrepen. */
  verbruikMm: number
  restMm: number
  /** Rest onder de schrootgrens: de staaf is daarna op. */
  restWordtSchroot: boolean
}

export interface Voorstel {
  sleutel: string
  regels: VoorstelRegel[]
  gedekt: number
  tekortStuks: number
  /** De lengtes die niet uit de voorraad komen — de basis voor een bestelling. */
  tekortStangen: TeZagen[]
  tekortMm: number
  /** Staven die helemaal op gaan (rest onder de schrootgrens). */
  stavenOp: number
  schrootMm: number
  /** Kortste rest die terug het rek in gaat; null als er geen is. */
  kortsteRestMm: number | null
}

/**
 * Vul één staaf zo vol mogelijk met wat er nog moet. Er zijn hooguit een paar
 * verschillende lengtes (laderstangen van k en k−1 stuks, of één stuklengte),
 * dus alle aantallen per lengte proberen kan: langste eerst mist dat 3 × 998
 * precies in 3000 past. Bij gelijke rest de meeste stuks.
 */
function vul(staaf: PlanStaaf, nog: TeZagen[], zaag: number): { genomen: number[]; verbruik: number } {
  const lengtes = [...new Set(nog.map((x) => x.lengteMm))].sort((a, b) => b - a)
  const idx = lengtes.map((l) => nog.map((x, i) => (x.lengteMm === l ? i : -1)).filter((i) => i >= 0))
  // De laatste lengte van een staaf heeft geen zaagsnede nodig als hij precies
  // tot het eind loopt: past als Σ lengte + zaag × (n − 1) ≤ vrij.
  const past = (som: number, n: number) => n === 0 || som + zaag * (n - 1) <= staaf.vrijMm + 1e-9
  let beste = { aantallen: lengtes.map(() => 0), som: 0, n: 0 }
  const probeer = (i: number, aantallen: number[], som: number, n: number) => {
    if (i === lengtes.length) {
      const verbruik = Math.min(staaf.vrijMm, som + zaag * n)
      const besteVerbruik = Math.min(staaf.vrijMm, beste.som + zaag * beste.n)
      if (verbruik > besteVerbruik + 1e-9 || (Math.abs(verbruik - besteVerbruik) < 1e-9 && n > beste.n)) {
        beste = { aantallen: [...aantallen], som, n }
      }
      return
    }
    for (let c = idx[i].length; c >= 0; c--) {
      if (!past(som + c * lengtes[i], n + c)) continue
      aantallen[i] = c
      probeer(i + 1, aantallen, som + c * lengtes[i], n + c)
    }
    aantallen[i] = 0
  }
  if (lengtes.length <= 4) probeer(0, lengtes.map(() => 0), 0, 0)
  else {
    // Veel verschillende lengtes komt niet voor; dan gewoon langste eerst.
    let som = 0, n = 0
    const aantallen = lengtes.map(() => 0)
    lengtes.forEach((l, i) => { for (let c = 0; c < idx[i].length && past(som + l, n + 1); c++) { som += l; n++; aantallen[i]++ } })
    beste = { aantallen, som, n }
  }
  const genomen = beste.aantallen.flatMap((c, i) => idx[i].slice(0, c))
  return { genomen, verbruik: Math.min(staaf.vrijMm, beste.som + zaag * beste.n) }
}

type Keuze = 'passend-lang' | 'passend-kort' | 'kort-eerst' | 'lang-eerst'

/**
 * Eén voorstel volgens een strategie:
 *  - passend: steeds de staaf die het best past (staaf op > minste rest); kan
 *    geen staaf meer op, dan de langste rest (`-lang`) of de kortste (`-kort`)
 *  - kort-eerst / lang-eerst: staven op lengte
 */
function maak(invoer: VoorstelInvoer, keuze: Keuze): Voorstel {
  const zaag = invoer.zaagsnedeMm
  let nog = [...invoer.stangen].sort((a, b) => b.lengteMm - a.lengteMm)
  const vrij = invoer.staven.filter((s) => s.vrijMm > 0)
  const regels: VoorstelRegel[] = []
  const gebruikt = new Set<string>()

  const kies = (): { staaf: PlanStaaf; genomen: number[]; verbruik: number } | null => {
    const opties = vrij
      .filter((s) => !gebruikt.has(s.id))
      .map((s) => ({ staaf: s, ...vul(s, nog, zaag) }))
      .filter((o) => o.genomen.length > 0)
    if (opties.length === 0) return null
    if (keuze === 'kort-eerst') return opties.sort((a, b) => a.staaf.vrijMm - b.staaf.vrijMm)[0]
    if (keuze === 'lang-eerst') return opties.sort((a, b) => b.staaf.vrijMm - a.staaf.vrijMm)[0]
    const rest = (o: { staaf: PlanStaaf; verbruik: number }) => o.staaf.vrijMm - o.verbruik
    const op = opties.filter((o) => rest(o) < invoer.schrootDrempelMm)
    if (op.length > 0) {
      // Past het precies: de staaf met de kleinste rest, dan die met de meeste stuks.
      return op.sort((a, b) => rest(a) - rest(b) || b.genomen.length - a.genomen.length)[0]
    }
    // Er gaat geen staaf meer helemaal op. Past alles wat nog moet in één
    // staaf, kies dan welke rest je overhoudt; anders gewoon de meeste stuks.
    const alles = opties.filter((o) => o.genomen.length === nog.length)
    const pool = alles.length > 0 ? alles : opties
    return pool.sort((a, b) =>
      (alles.length > 0 ? 0 : b.genomen.length - a.genomen.length)
      || (keuze === 'passend-lang' ? rest(b) - rest(a) : rest(a) - rest(b)))[0]
  }

  while (nog.length > 0) {
    const k = kies()
    if (!k) break
    gebruikt.add(k.staaf.id)
    const stangen = k.genomen.map((i) => nog[i])
    const restMm = k.staaf.vrijMm - k.verbruik
    regels.push({
      barId: k.staaf.id, barCode: k.staaf.code, locatie: k.staaf.locatie ?? null, vrijMm: k.staaf.vrijMm,
      stangen, stuks: stangen.reduce((s, x) => s + x.stuks, 0), verbruikMm: k.verbruik, restMm,
      restWordtSchroot: restMm < invoer.schrootDrempelMm,
    })
    const weg = new Set(k.genomen)
    nog = nog.filter((_, i) => !weg.has(i))
  }

  const totaal = invoer.stangen.reduce((s, x) => s + x.stuks, 0)
  const gedekt = regels.reduce((s, r) => s + r.stuks, 0)
  const terug = regels.filter((r) => !r.restWordtSchroot).map((r) => r.restMm)
  return {
    sleutel: regels.map((r) => `${r.barId}:${r.stangen.length}`).sort().join('|'),
    regels,
    gedekt,
    tekortStuks: totaal - gedekt,
    tekortStangen: nog,
    tekortMm: nog.reduce((s, x) => s + x.lengteMm + zaag, 0),
    stavenOp: regels.filter((r) => r.restWordtSchroot).length,
    schrootMm: regels.filter((r) => r.restWordtSchroot).reduce((s, r) => s + r.restMm, 0),
    kortsteRestMm: terug.length > 0 ? Math.min(...terug) : null,
  }
}

/** Negatief = `a` is beter. Zie de kop van dit bestand. */
export function vergelijkVoorstel(a: Voorstel, b: Voorstel): number {
  return (b.gedekt - a.gedekt)
    || (b.stavenOp - a.stavenOp)
    || (a.schrootMm - b.schrootMm)
    || ((b.kortsteRestMm ?? Infinity) - (a.kortsteRestMm ?? Infinity))
    || (a.regels.length - b.regels.length)
}

/** Hooguit `max` verschillende voorstellen, het beste eerst. */
export function materiaalVoorstellen(invoer: VoorstelInvoer, max = 3): Voorstel[] {
  const keuzes: Keuze[] = ['passend-lang', 'passend-kort', 'kort-eerst', 'lang-eerst']
  const uniek = new Map<string, Voorstel>()
  for (const k of keuzes) {
    const v = maak(invoer, k)
    if (!uniek.has(v.sleutel)) uniek.set(v.sleutel, v)
  }
  return [...uniek.values()].sort(vergelijkVoorstel).slice(0, max)
}
