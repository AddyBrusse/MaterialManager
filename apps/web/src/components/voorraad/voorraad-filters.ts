/**
 * Filters op de voorraadpagina (2026-10-07). Bewaard per gebruiker in de
 * voorkeur `voorraad.filters`, zodat ze er nog staan als je terugkomt.
 */
export type ExootFilter = '' | 'alleen' | 'zonder'

export interface Bereik { van: number | null; tot: number | null }

export interface VoorraadFilters {
  kwaliteit: string
  afwerking: string
  vorm: string
  maat: Bereik
  lengte: Bereik
  exoot: ExootFilter
  status: string
}

export const GEEN_BEREIK: Bereik = { van: null, tot: null }

export const LEGE_FILTERS: VoorraadFilters = {
  kwaliteit: '', afwerking: '', vorm: '', maat: GEEN_BEREIK, lengte: GEEN_BEREIK, exoot: '', status: '',
}

/** Wat er bewaard staat kan van een oudere versie zijn: vul aan wat ontbreekt. */
export function leesFilters(v: Partial<VoorraadFilters> | null | undefined): VoorraadFilters {
  return { ...LEGE_FILTERS, ...(v ?? {}) }
}

/**
 * De kopmaat: de maat waarop je een stuk zoekt. Ø bij rond, de zijde bij
 * vierkant, de breedte bij plat, de buitendiameter bij buis.
 */
export function kopmaat(volumeFormula: string, dims: Record<string, number>): number | null {
  const v = volumeFormula === 'round' ? dims.diameter
    : volumeFormula === 'square' ? dims.side
    : volumeFormula === 'flat' ? dims.width
    : volumeFormula === 'tube' ? dims.outerDiameter
    : Object.values(dims)[0]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Nieuwe "van": staat "tot" leeg, gelijk aan de oude "van" of eronder, dan
 * schuift hij mee. Zo laat 50 meteen alleen 50 zien, en maakt 55 bij "tot"
 * er daarna 50 t/m 55 van.
 */
export function zetVan(b: Bereik, van: number | null): Bereik {
  // "Van" leeg: een "tot" die alleen was meegeschoven gaat mee weg.
  if (van == null) return { van: null, tot: b.tot === b.van ? null : b.tot }
  const meeschuiven = b.tot == null || b.tot === b.van || b.tot < van
  return { van, tot: meeschuiven ? van : b.tot }
}

/**
 * Staat er een filter aan? Op inhoud, niet op tekst: de database (jsonb) geeft
 * de sleutels in een andere volgorde terug, en dan stond "Wis filters" er
 * terwijl er niets aan stond.
 */
export function filtersActief(f: VoorraadFilters): boolean {
  return Boolean(f.kwaliteit || f.afwerking || f.vorm || f.exoot || f.status) || bereikActief(f.maat) || bereikActief(f.lengte)
}

export function bereikActief(b: Bereik): boolean {
  return b.van != null || b.tot != null
}

export function inBereik(waarde: number | null, b: Bereik): boolean {
  if (!bereikActief(b)) return true
  if (waarde == null) return false
  const lo = b.van ?? -Infinity, hi = b.tot ?? Infinity
  return waarde >= Math.min(lo, hi) && waarde <= Math.max(lo, hi)
}

const nl = (n: number) => n.toLocaleString('nl-NL')

/** Wat er op de chip staat: "50", "50–55", "vanaf 50", "tot 55". */
export function bereikTekst(b: Bereik, eenheid = ''): string {
  const e = eenheid ? ` ${eenheid}` : ''
  if (b.van != null && b.tot != null) return b.van === b.tot ? `${nl(b.van)}${e}` : `${nl(Math.min(b.van, b.tot))}–${nl(Math.max(b.van, b.tot))}${e}`
  if (b.van != null) return `vanaf ${nl(b.van)}${e}`
  if (b.tot != null) return `tot ${nl(b.tot)}${e}`
  return ''
}

export interface FilterRij {
  grade: { name: string }
  profile: { name: string; volumeFormula: string }
  surfaceFinish: { name: string } | null
  dimensions: Record<string, number>
  currentStock: string
  exoot: boolean
}

/**
 * Wat er niet ligt, staat standaard niet in de lijst: materiaal dat op is, en
 * sinds 2026-10-16 ook een exoot op 0 (nog niet binnen of verbruikt). De lijst
 * is de stand op locatie; wat onderweg is staat op Bestellingen. Status
 * "Verbruikt" of "Nog niet binnen" toont het juist, en "Alleen exoten" toont
 * alle exoten, met hun stand.
 */
export function isOp(r: FilterRij): boolean {
  return Number(r.currentStock) === 0
}

/**
 * Hoeveel stukken er liggen: de teller "Voorraad" in het zijmenu en de tegel
 * "met restlengte". De teller telde tot 2026-10-19 elke regel, ook verbruikte
 * staven en exoten die nog moesten komen.
 */
export function aantalInVoorraad(rijen: { currentStock: string | number }[]): number {
  return rijen.filter((r) => Number(r.currentStock) > 0).length
}

export function filterVoorraad<T extends FilterRij>(rijen: T[], f: VoorraadFilters, statusVan: (r: T) => string): T[] {
  return rijen.filter((r) => {
    if (f.kwaliteit && r.grade.name !== f.kwaliteit) return false
    if (f.afwerking && (r.surfaceFinish?.name ?? '') !== f.afwerking) return false
    if (f.vorm && r.profile.name !== f.vorm) return false
    if (!inBereik(kopmaat(r.profile.volumeFormula, r.dimensions), f.maat)) return false
    if (!inBereik(Number(r.currentStock), f.lengte)) return false
    if (f.exoot === 'alleen' && !r.exoot) return false
    if (f.exoot === 'zonder' && r.exoot) return false
    if (f.status) return statusVan(r) === f.status
    return f.exoot === 'alleen' || !isOp(r)
  })
}
