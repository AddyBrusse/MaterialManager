import { z } from 'zod'

/**
 * Prijs van een leverancier (2026-10-06), voor één materiaal óf voor een hele
 * kwaliteit. Per kg rekent met het gewicht van wat je werkelijk bestelt — ook
 * een aangepaste lengte. Per stuk geldt voor één stuk van precies die maat.
 */
export const PRIJS_SOORTEN = ['per_kg', 'per_stuk'] as const
export type PrijsSoort = typeof PRIJS_SOORTEN[number]

export const LeverancierPrijsSchema = z.object({
  id: z.string(),
  leverancierId: z.string(),
  leverancierNaam: z.string(),
  rawMaterialId: z.string().nullable(),
  gradeId: z.string().nullable(),
  prijsSoort: z.enum(PRIJS_SOORTEN),
  prijs: z.number(),
  zaagkostenPerSnede: z.number().nullable(),
  minimumBedrag: z.number().nullable(),
  levertijdDagen: z.number().int().nullable(),
  notitie: z.string().nullable(),
  bijgewerktDoor: z.string().nullable(),
  updatedAt: z.string(),
})
export type LeverancierPrijs = z.infer<typeof LeverancierPrijsSchema>

const bedrag = z.number().nonnegative('Mag niet negatief zijn')

export const LeverancierPrijsInvoerSchema = z.object({
  leverancierId: z.string().min(1, 'Kies een leverancier'),
  rawMaterialId: z.string().nullable().optional(),
  gradeId: z.string().nullable().optional(),
  prijsSoort: z.enum(PRIJS_SOORTEN),
  prijs: z.number().positive('Vul een prijs groter dan 0 in'),
  zaagkostenPerSnede: bedrag.nullable().optional(),
  minimumBedrag: bedrag.nullable().optional(),
  levertijdDagen: z.number().int().nonnegative().nullable().optional(),
  notitie: z.string().max(500).nullable().optional(),
})
export type LeverancierPrijsInvoer = z.infer<typeof LeverancierPrijsInvoerSchema>

/** Waarom deze prijs zo niet kan, of `null`. Scherm en server vragen hetzelfde. */
export function waaromNietLeverancierPrijs(p: Pick<LeverancierPrijsInvoer, 'rawMaterialId' | 'gradeId' | 'prijsSoort'>): string | null {
  const materiaal = !!p.rawMaterialId
  const kwaliteit = !!p.gradeId
  if (materiaal === kwaliteit) return 'Een prijs hoort bij één materiaal óf bij een hele kwaliteit.'
  if (kwaliteit && p.prijsSoort === 'per_stuk') {
    return 'Een prijs per stuk kan alleen bij een materiaal met een maat. Voor een hele kwaliteit vul je een prijs per kg in.'
  }
  return null
}

export interface PrijsOpbouw {
  totaal: number
  /** "€ 7,20/kg × 24,3 kg + 4 × € 5,25 zagen" */
  uitleg: string
  /** Het minimum gaf de doorslag. */
  minimumToegepast: boolean
}

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const kgTekst = (n: number) => `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kg`

/**
 * Wat een regel bij deze leverancier kost: per kg × gewicht of per stuk ×
 * aantal, plus zaagkosten per snede, en nooit minder dan het minimum.
 */
export function prijsBijLeverancier(
  p: Pick<LeverancierPrijs, 'prijsSoort' | 'prijs' | 'zaagkostenPerSnede' | 'minimumBedrag'>,
  regel: { kg: number; stuks: number; sneden: number },
): PrijsOpbouw {
  const basis = p.prijsSoort === 'per_kg' ? p.prijs * regel.kg : p.prijs * regel.stuks
  const zagen = (p.zaagkostenPerSnede ?? 0) * regel.sneden
  const som = basis + zagen
  const minimum = p.minimumBedrag ?? 0
  const delen = [
    p.prijsSoort === 'per_kg' ? `${eur(p.prijs)}/kg × ${kgTekst(regel.kg)}` : `${regel.stuks} × ${eur(p.prijs)}`,
    zagen > 0 ? `${regel.sneden} × ${eur(p.zaagkostenPerSnede ?? 0)} zagen` : null,
  ].filter(Boolean).join(' + ')
  if (som < minimum) return { totaal: minimum, uitleg: `${delen} → minimum ${eur(minimum)}`, minimumToegepast: true }
  return { totaal: som, uitleg: delen, minimumToegepast: false }
}

/**
 * De prijzen die voor een materiaal gelden: die van het materiaal zelf, en per
 * leverancier zonder eigen materiaalprijs die van de kwaliteit. Een
 * materiaalprijs gaat voor: die is specifieker.
 */
export function geldendePrijzen<T extends Pick<LeverancierPrijs, 'leverancierId' | 'rawMaterialId' | 'gradeId'>>(
  alle: T[], materiaal: { id: string; gradeId: string },
): (T & { via: 'materiaal' | 'kwaliteit' })[] {
  const eigen = alle.filter((p) => p.rawMaterialId === materiaal.id)
  const metEigen = new Set(eigen.map((p) => p.leverancierId))
  const kwaliteit = alle.filter((p) => p.gradeId === materiaal.gradeId && !metEigen.has(p.leverancierId))
  return [
    ...eigen.map((p) => ({ ...p, via: 'materiaal' as const })),
    ...kwaliteit.map((p) => ({ ...p, via: 'kwaliteit' as const })),
  ]
}
