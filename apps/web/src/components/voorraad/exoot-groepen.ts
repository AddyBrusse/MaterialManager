import type { ExootStand } from '@stockmanager/shared'

/**
 * Eén regel per exoot in de voorraad (2026-10-16). Binnen boeken maakt één
 * regel per stuk, dus twintig platen voor één opdracht stonden er als twintig
 * gelijke regels. Hier komen ze samen; uitklappen toont de stukken.
 *
 * Alleen exoten: een gewone staaf heeft zijn eigen restlengte en blijft een
 * eigen regel (besluit 2026-10-07). Een exoot met één stuk ook, een groep van
 * één voegt niets toe.
 */
export interface GroepRij {
  id: string
  code: string
  exoot: boolean
  klantId: string | null
  artikelId: string | null
  gradeId: string
  profileId: string
  surfaceFinishId: string | null
  dimensions: Record<string, number>
  lengthMm: string
  exootStand: ExootStand | null
}

export interface ExootGroep<T extends GroepRij> {
  sleutel: string
  /** Alle stukken van deze exoot, ook die het filter niet toont: de telling moet kloppen. */
  stukken: T[]
  binnen: number
  nietBinnen: number
  verbruikt: number
}

export type Weergaveregel<T extends GroepRij> =
  | { soort: 'stuk'; rij: T }
  | { soort: 'exoot'; groep: ExootGroep<T> }

const dimsSleutel = (d: Record<string, number>) => Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join(',')

/** Wat een exoot is: voor wie, voor welk artikel, en welke maat. De stukken uit één levering delen dit. */
export function exootSleutel(r: GroepRij): string {
  return [r.klantId ?? '', r.artikelId ?? '', r.gradeId, r.profileId, r.surfaceFinishId ?? '', dimsSleutel(r.dimensions), Number(r.lengthMm)].join('|')
}

const VOLGORDE: Record<ExootStand, number> = { binnen: 0, niet_binnen: 1, verbruikt: 2 }

function maakGroep<T extends GroepRij>(sleutel: string, stukken: T[]): ExootGroep<T> {
  const tel = (s: ExootStand) => stukken.filter((r) => r.exootStand === s).length
  const gesorteerd = [...stukken].sort((a, b) =>
    (VOLGORDE[a.exootStand ?? 'binnen'] - VOLGORDE[b.exootStand ?? 'binnen']) || a.code.localeCompare(b.code, 'nl'))
  return { sleutel, stukken: gesorteerd, binnen: tel('binnen'), nietBinnen: tel('niet_binnen'), verbruikt: tel('verbruikt') }
}

/**
 * `zichtbaar` is wat het filter doorlaat, al gesorteerd; `alle` is waar de
 * groepen hun stukken uit halen. Een groep staat op de plek van zijn eerste
 * zichtbare stuk, zodat de sortering blijft werken.
 */
export function groepeerExoten<T extends GroepRij>(zichtbaar: T[], alle: T[]): Weergaveregel<T>[] {
  const perSleutel = new Map<string, T[]>()
  for (const r of alle) {
    if (!r.exoot) continue
    const k = exootSleutel(r)
    const lijst = perSleutel.get(k)
    if (lijst) lijst.push(r)
    else perSleutel.set(k, [r])
  }
  const gedaan = new Set<string>()
  const uit: Weergaveregel<T>[] = []
  for (const r of zichtbaar) {
    if (!r.exoot) { uit.push({ soort: 'stuk', rij: r }); continue }
    const k = exootSleutel(r)
    if (gedaan.has(k)) continue
    gedaan.add(k)
    const stukken = perSleutel.get(k) ?? [r]
    uit.push(stukken.length > 1 ? { soort: 'exoot', groep: maakGroep(k, stukken) } : { soort: 'stuk', rij: r })
  }
  return uit
}

/** De stand van de hele exoot, voor het label op de groepsregel. */
export function groepStand(g: ExootGroep<GroepRij>): ExootStand {
  if (g.binnen > 0) return 'binnen'
  return g.nietBinnen > 0 ? 'niet_binnen' : 'verbruikt'
}

/** "20 stuks: 12 in het rek, 8 verbruikt" — wat er niet is, staat er niet. */
export function telTekst(g: ExootGroep<GroepRij>): string {
  const delen = [
    g.binnen ? `${g.binnen} in het rek` : '',
    g.nietBinnen ? `${g.nietBinnen} nog niet binnen` : '',
    g.verbruikt ? `${g.verbruikt} verbruikt` : '',
  ].filter(Boolean)
  return `${g.stukken.length} stuks: ${delen.join(', ')}`
}
