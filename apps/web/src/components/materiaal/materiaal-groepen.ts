import { formatDimensions, type RawMaterialRow } from '../../api/raw-materials'

/**
 * De materiaaltabel in het recept (2026-10-09): één rij per soort materiaal
 * (kwaliteit + vorm + maat + afwerking), niet per staaf — in een recept kies
 * je wát, niet welke staaf. Welke staven gezaagd worden komt pas bij het in
 * productie geven. Een exoot is wel één rij per stuk: die hoort bij één klant.
 */
export interface MateriaalGroep {
  sleutel: string
  /** Een staaf uit de groep, voor kwaliteit/vorm/maat bij het kiezen. */
  rij: RawMaterialRow
  kwaliteit: string
  vorm: string
  afmeting: string
  /** De hoofdmaat (diameter, zijde, breedte) voor het filter van–tot. */
  maat: number
  afwerking: string
  staven: number
  vrijMm: number
  langsteMm: number
  exoot: boolean
}

export interface MateriaalFilter {
  zoek: string
  kwaliteiten: string[]
  vormen: string[]
  maatVan: number | null
  maatTot: number | null
  afwerking: string | null
  alleenVrij: boolean
  exoten: boolean
}

export const LEEG_FILTER: MateriaalFilter = {
  zoek: '', kwaliteiten: [], vormen: [], maatVan: null, maatTot: null, afwerking: null, alleenVrij: false, exoten: false,
}

export type Sorteer = 'kwaliteit' | 'vorm' | 'maat' | 'afwerking' | 'staven' | 'vrij' | 'langste'

const dimsKey = (d: Record<string, number>) => Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join(',')

export function hoofdmaat(d: Record<string, number>): number {
  return Number(d.diameter ?? d.outerDiameter ?? d.side ?? d.width ?? Object.values(d)[0] ?? 0)
}

export function groepeer(rijen: RawMaterialRow[]): MateriaalGroep[] {
  const per = new Map<string, MateriaalGroep>()
  for (const r of rijen) {
    const sleutel = r.exoot ? `exoot:${r.id}` : [r.gradeId, r.profileId, dimsKey(r.dimensions), r.surfaceFinishId ?? ''].join('|')
    const vrij = Math.max(0, Number(r.vrijMm) || 0)
    const g = per.get(sleutel)
    if (g) {
      g.staven += vrij > 0 ? 1 : 0
      g.vrijMm += vrij
      g.langsteMm = Math.max(g.langsteMm, vrij)
      continue
    }
    per.set(sleutel, {
      sleutel, rij: r,
      kwaliteit: r.grade.name, vorm: r.profile.name,
      afmeting: formatDimensions(r.profile, r.dimensions), maat: hoofdmaat(r.dimensions),
      afwerking: r.surfaceFinish?.name ?? '',
      staven: vrij > 0 ? 1 : 0, vrijMm: vrij, langsteMm: vrij, exoot: r.exoot,
    })
  }
  return [...per.values()]
}

export function filter(groepen: MateriaalGroep[], f: MateriaalFilter): MateriaalGroep[] {
  const woorden = f.zoek.toLowerCase().split(/\s+/).filter(Boolean)
  return groepen.filter((g) => {
    if (g.exoot && !f.exoten) return false
    if (f.alleenVrij && g.vrijMm <= 0) return false
    if (f.kwaliteiten.length && !f.kwaliteiten.includes(g.kwaliteit)) return false
    if (f.vormen.length && !f.vormen.includes(g.vorm)) return false
    if (f.maatVan != null && g.maat < f.maatVan) return false
    if (f.maatTot != null && g.maat > f.maatTot) return false
    if (f.afwerking && g.afwerking !== f.afwerking) return false
    if (woorden.length) {
      const tekst = `${g.kwaliteit} ${g.vorm} ${g.afmeting} ${g.afwerking} ${g.rij.code}`.toLowerCase()
      if (!woorden.every((w) => tekst.includes(w))) return false
    }
    return true
  })
}

export function sorteer(groepen: MateriaalGroep[], op: Sorteer, oplopend: boolean): MateriaalGroep[] {
  const waarde = (g: MateriaalGroep): string | number => {
    switch (op) {
      case 'kwaliteit': return g.kwaliteit
      case 'vorm': return g.vorm
      case 'maat': return g.maat
      case 'afwerking': return g.afwerking
      case 'staven': return g.staven
      case 'vrij': return g.vrijMm
      case 'langste': return g.langsteMm
    }
  }
  const r = oplopend ? 1 : -1
  return [...groepen].sort((a, b) => {
    const x = waarde(a), y = waarde(b)
    const v = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nl')
    // Bij gelijke waarde op kwaliteit en maat, zodat de volgorde vast ligt.
    return r * v || a.kwaliteit.localeCompare(b.kwaliteit, 'nl') || a.maat - b.maat
  })
}
