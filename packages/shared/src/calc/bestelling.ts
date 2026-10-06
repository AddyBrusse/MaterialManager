import type { Antwoord, BestelRegel } from '../schemas/bestelling'
import { prijsBijLeverancier, type LeverancierPrijs, type PrijsOpbouw } from '../schemas/leverancier-prijs'
import { computeWeightKg, type VolumeFormula } from './estimate'

/**
 * Rekenregels voor inkoop (2026-10-06). Scherm en server rekenen met dezelfde
 * functies: de vergelijking op het scherm en de prijs die bij "Kies" wordt
 * vastgelegd mogen niet uit elkaar lopen.
 */

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type RegelMaat = Pick<BestelRegel, 'dimensions' | 'lengteMm' | 'stuks'> & { volumeFormula: string; densityKgM3: number }

/** Gewicht van alle stuks samen, over de bestelde lengte — ook een aangepaste. */
export function kgVanRegel(r: RegelMaat): number {
  return computeWeightKg(r.volumeFormula as VolumeFormula, r.dimensions, r.lengteMm, r.densityKgM3) * r.stuks
}

/** Elk stuk is één snede: ook een op maat gezaagde plaat. */
export const snedenVanRegel = (r: Pick<BestelRegel, 'stuks'>) => r.stuks

type RegelVoorPrijs = Pick<BestelRegel, 'stuks' | 'kg' | 'gradeId' | 'rawMaterialId'>

/** Wat een antwoord voor deze regel kost. "Totaal" is al alles; zagen telt dan niet apart. */
export function prijsVanAntwoord(a: Pick<Antwoord, 'prijsSoort' | 'prijs' | 'zaagkostenPerSnede'>, r: RegelVoorPrijs): PrijsOpbouw {
  if (a.prijsSoort === 'totaal') return { totaal: a.prijs, uitleg: `${eur(a.prijs)} totaal`, minimumToegepast: false }
  return prijsBijLeverancier(
    { prijsSoort: a.prijsSoort, prijs: a.prijs, zaagkostenPerSnede: a.zaagkostenPerSnede, minimumBedrag: null },
    { kg: r.kg, stuks: r.stuks, sneden: r.stuks },
  )
}

/**
 * De prijslijstprijs per leverancier voor deze regel. Een prijs voor een
 * materiaal van dezelfde maat gaat voor een prijs voor de hele kwaliteit.
 * Per stuk geldt alleen voor precies dat stuk (de exoot zelf): een prijs per
 * stuk voor een staaf van 3 m zegt niets over een stuk van 1.250 mm.
 */
export function prijslijstVoorRegel(
  prijzen: LeverancierPrijs[], r: Pick<BestelRegel, 'gradeId' | 'rawMaterialId'>, gelijkeMateriaalIds: string[],
): Map<string, LeverancierPrijs> {
  const gelijk = new Set(gelijkeMateriaalIds)
  if (r.rawMaterialId) gelijk.add(r.rawMaterialId)
  const uit = new Map<string, LeverancierPrijs>()
  const bruikbaar = (p: LeverancierPrijs) => p.prijsSoort === 'per_kg' || (p.rawMaterialId != null && p.rawMaterialId === r.rawMaterialId)
  // 2 = prijs voor een materiaal van deze maat, 1 = voor de kwaliteit, 0 = past niet.
  const rang = (p: LeverancierPrijs) =>
    !bruikbaar(p) ? 0 : p.rawMaterialId != null && gelijk.has(p.rawMaterialId) ? 2 : p.gradeId === r.gradeId ? 1 : 0
  for (const p of prijzen) {
    const rp = rang(p)
    if (rp === 0) continue
    const al = uit.get(p.leverancierId)
    const ra = al ? rang(al) : 0
    if (!al || rp > ra || (rp === ra && p.updatedAt > al.updatedAt)) uit.set(p.leverancierId, p)
  }
  return uit
}

export type Cel =
  | {
      soort: 'prijs'
      bron: 'antwoord' | 'prijslijst'
      antwoordId: string | null
      aanvraagId: string | null
      totaal: number
      uitleg: string
      levertijdDagen: number | null
      datum: string
    }
  | { soort: 'gevraagd'; aanvraagId: string }
  | { soort: 'geen' }

export interface CelBronnen {
  prijslijst: Map<string, LeverancierPrijs>
  /** Antwoorden op deze regel, van alle aanvragen. */
  antwoorden: Antwoord[]
  /** Per leverancier de aanvragen (id) waarin deze regel is gevraagd, nieuwste eerst. */
  gevraagd: Map<string, string[]>
}

/**
 * Wat er in de vergelijking staat voor één regel bij één leverancier. Een
 * antwoord gaat voor de prijslijst: dat is wat ze voor déze bestelling zeiden.
 */
export function celVoor(r: RegelVoorPrijs, leverancierId: string, b: CelBronnen): Cel {
  const antwoord = b.antwoorden
    .filter((a) => a.leverancierId === leverancierId)
    .sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1))[0]
  if (antwoord) {
    const p = prijsVanAntwoord(antwoord, r)
    return {
      soort: 'prijs', bron: 'antwoord', antwoordId: antwoord.id, aanvraagId: antwoord.prijsaanvraagId,
      totaal: p.totaal, uitleg: p.uitleg, levertijdDagen: antwoord.levertijdDagen, datum: antwoord.updatedAt,
    }
  }
  const lijst = b.prijslijst.get(leverancierId)
  if (lijst) {
    const p = prijsBijLeverancier(lijst, { kg: r.kg, stuks: r.stuks, sneden: r.stuks })
    return {
      soort: 'prijs', bron: 'prijslijst', antwoordId: null, aanvraagId: null,
      totaal: p.totaal, uitleg: p.uitleg, levertijdDagen: lijst.levertijdDagen, datum: lijst.updatedAt,
    }
  }
  const aanvraag = b.gevraagd.get(leverancierId)?.[0]
  return aanvraag ? { soort: 'gevraagd', aanvraagId: aanvraag } : { soort: 'geen' }
}

/** De leverancier met de laagste prijs in deze rij, of null. Bij gelijke prijs de snelste. */
export function goedkoopste(cellen: Map<string, Cel>): string | null {
  let beste: { id: string; totaal: number; dagen: number } | null = null
  for (const [id, c] of cellen) {
    if (c.soort !== 'prijs') continue
    const dagen = c.levertijdDagen ?? Number.MAX_SAFE_INTEGER
    if (!beste || c.totaal < beste.totaal - 0.005 || (Math.abs(c.totaal - beste.totaal) < 0.005 && dagen < beste.dagen)) {
      beste = { id, totaal: c.totaal, dagen }
    }
  }
  return beste?.id ?? null
}

/** Gekozen regels per leverancier: zo worden het inkooporders. */
export function perLeverancier(regels: Pick<BestelRegel, 'id' | 'keuze'>[]) {
  const groepen = new Map<string, { leverancierId: string; naam: string; regelIds: string[]; totaal: number }>()
  for (const r of regels) {
    if (!r.keuze) continue
    const g = groepen.get(r.keuze.leverancierId) ?? { leverancierId: r.keuze.leverancierId, naam: r.keuze.leverancierNaam, regelIds: [], totaal: 0 }
    g.regelIds.push(r.id)
    g.totaal += r.keuze.totaal
    groepen.set(g.leverancierId, g)
  }
  return [...groepen.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
}

/**
 * Een gekozen antwoord als prijs in de prijslijst. Bij een exoot voor dat
 * stuk; bij gewoon materiaal alleen per kg — een prijs per stuk of in totaal
 * hoort bij deze ene lengte en zou elke andere bestelling verkeerd voorrekenen.
 */
export function antwoordAlsPrijs(
  a: Pick<Antwoord, 'prijsSoort' | 'prijs' | 'zaagkostenPerSnede' | 'levertijdDagen'>,
  r: Pick<BestelRegel, 'stuks' | 'rawMaterialId' | 'exoot' | 'gradeId'>,
): { rawMaterialId: string | null; gradeId: string | null; prijsSoort: 'per_kg' | 'per_stuk'; prijs: number; zaagkostenPerSnede: number | null; levertijdDagen: number | null } | { reden: string } {
  const basis = { zaagkostenPerSnede: a.zaagkostenPerSnede, levertijdDagen: a.levertijdDagen }
  if (r.exoot && r.rawMaterialId) {
    if (a.prijsSoort === 'totaal') {
      return { rawMaterialId: r.rawMaterialId, gradeId: null, prijsSoort: 'per_stuk', prijs: a.prijs / Math.max(1, r.stuks), zaagkostenPerSnede: null, levertijdDagen: a.levertijdDagen }
    }
    return { rawMaterialId: r.rawMaterialId, gradeId: null, prijsSoort: a.prijsSoort, prijs: a.prijs, ...basis }
  }
  if (a.prijsSoort !== 'per_kg') {
    return { reden: 'Een prijs per stuk of in totaal geldt alleen voor deze lengte; in de prijslijst gaat alleen een prijs per kg, die past op elke lengte.' }
  }
  return { rawMaterialId: null, gradeId: r.gradeId, prijsSoort: 'per_kg', prijs: a.prijs, ...basis }
}

// ── Voorwaarden: waarom iets niet kan, of null ──

const opInkooporder = (r: Pick<BestelRegel, 'status'>) => r.status === 'besteld' || r.status === 'ontvangen'

type MetOrder = { inkooporder?: BestelRegel['inkooporder'] }
const opConcept = (r: MetOrder) =>
  r.inkooporder?.status === 'concept' ? `staat op inkooporder ${r.inkooporder.id} (concept). Haal hem daar eerst af.` : null

export function waaromNietBestelRegelWijzigen(r: Pick<BestelRegel, 'status' | 'materiaal'> & MetOrder): string | null {
  const c = opConcept(r)
  if (c) return `${r.materiaal} ${c}`
  if (r.status === 'te_bestellen') return null
  if (opInkooporder(r)) return `${r.materiaal} staat al op een inkooporder; daar verander je niets meer aan.`
  return `${r.materiaal} is al aangevraagd bij leveranciers. Wijzig je nu de maat of het aantal, dan klopt hun antwoord niet meer. Verwijder de regel en maak een nieuwe.`
}

export function waaromNietBestelRegelVerwijderen(r: Pick<BestelRegel, 'status' | 'materiaal'> & MetOrder): string | null {
  const c = opConcept(r)
  if (c) return `${r.materiaal} ${c}`
  return opInkooporder(r) ? `${r.materiaal} staat al op een inkooporder en kan niet meer weg.` : null
}

export function waaromNietPrijsaanvraag(regels: Pick<BestelRegel, 'status' | 'materiaal'>[], leverancierIds: string[]): string | null {
  if (regels.length === 0) return 'Kies eerst één of meer regels om aan te vragen.'
  if (leverancierIds.length === 0) return 'Kies minstens één leverancier.'
  const besteld = regels.find(opInkooporder)
  if (besteld) return `${besteld.materiaal} staat al op een inkooporder; die vraag je niet opnieuw aan.`
  return null
}

export function waaromNietAanvraagVersturen(l: { naam: string; email: string | null }): string | null {
  return l.email ? null : `Bij ${l.naam} staat geen e-mailadres. Vul het in bij Relaties → ${l.naam} (of bij een contactpersoon), dan kan de aanvraag de deur uit.`
}

export function waaromNietKiezen(r: Pick<BestelRegel, 'status' | 'materiaal'> & MetOrder, cel: Cel): string | null {
  if (opInkooporder(r) || r.inkooporder) return `${r.materiaal} staat al op een inkooporder${r.inkooporder ? ` (${r.inkooporder.id})` : ''}; de keuze ligt vast.`
  if (cel.soort !== 'prijs') return 'Er is nog geen prijs van deze leverancier. Vul eerst zijn antwoord in.'
  return null
}

/** "Ø40", "250×30", "Ø60/Ø40" — zoals de voorraadlijst het schrijft. */
export function maatTekst(volumeFormula: string, d: Record<string, number>): string {
  switch (volumeFormula) {
    case 'round':  return `Ø${d.diameter}`
    case 'square': return `${d.side}×${d.side}`
    case 'flat':   return `${d.width}×${d.height}`
    case 'tube':   return `Ø${d.outerDiameter}/Ø${d.innerDiameter}`
    default:       return Object.values(d).join('×')
  }
}

/**
 * Alles wat de vergelijking nodig heeft, in één antwoord van de server. Het
 * scherm en de server bouwen er met `celBronnenVoor` dezelfde cellen van.
 */
export interface VergelijkData {
  regels: BestelRegel[]
  leveranciers: { id: string; naam: string }[]
  prijzen: LeverancierPrijs[]
  antwoorden: Antwoord[]
  /** Per regel: materialen in de lijst met dezelfde kwaliteit, vorm en maat. */
  gelijk: Record<string, string[]>
  /** Per regel, per leverancier: de aanvragen waarin hij gevraagd is, nieuwste eerst. */
  gevraagd: Record<string, Record<string, string[]>>
}

export function celBronnenVoor(v: VergelijkData, r: Pick<BestelRegel, 'id' | 'gradeId' | 'rawMaterialId'>): CelBronnen {
  return {
    prijslijst: prijslijstVoorRegel(v.prijzen, r, v.gelijk[r.id] ?? []),
    antwoorden: v.antwoorden.filter((a) => a.bestelRegelId === r.id),
    gevraagd: new Map(Object.entries(v.gevraagd[r.id] ?? {})),
  }
}
