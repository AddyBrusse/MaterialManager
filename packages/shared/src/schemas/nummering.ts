import { z } from 'zod'

export const DOC_PREFIXEN = ['PRJ', 'OFF', 'OB', 'PROD', 'PL', 'FACT', 'CRED', 'PA'] as const
export type DocPrefix = typeof DOC_PREFIXEN[number]

/**
 * De stand van één nummerreeks in het lopende jaar (Instellingen → Nummering).
 * Nummers geeft de server bij het aanmaken, per soort per jaar (2026-10-05).
 */
export const DocReeksStandSchema = z.object({
  prefix: z.enum(DOC_PREFIXEN),
  naam: z.string(),
  jaar: z.number().int(),
  /** Het laatst uitgegeven nummer dit jaar volgens de teller, of null. */
  laatste: z.string().nullable(),
  volgende: z.string(),
  /** Het volgnummer dat het volgende document krijgt (zonder voorvoegsel). */
  volgendeN: z.number().int(),
  /** Het hoogste volgnummer dat dit jaar echt bestaat (0 = nog niets). */
  hoogsteBestaand: z.number().int(),
})
export type DocReeksStand = z.infer<typeof DocReeksStandSchema>

/** Het volgende nummer met de hand zetten — alleen een admin, met een reden. */
export const NummerWijzigSchema = z.object({
  volgende: z.number().int().min(1, 'Minimaal 1').max(99999, 'Maximaal 99999'),
  reden: z.string().trim().min(3, 'Vul minstens 3 tekens in'),
  /** Bevestigd dat er bij facturen een gat in de nummering komt. */
  gatAkkoord: z.boolean().optional(),
})
export type NummerWijzig = z.infer<typeof NummerWijzigSchema>

export const DocReeksWijzigingSchema = z.object({
  id: z.string(),
  sleutel: z.string(),
  van: z.number().int(),
  naar: z.number().int(),
  reden: z.string(),
  door: z.string(),
  createdAt: z.string(),
})
export type DocReeksWijziging = z.infer<typeof DocReeksWijzigingSchema>

const nr = (prefix: string, jaar: number, n: number) => `${prefix}-${jaar}-${String(n).padStart(3, '0')}`

/**
 * Waarom het volgende nummer niet op `volgende` kan, of `null`. Lager dan wat er
 * al bestaat heeft geen zin: de server slaat bezette nummers toch over, en het
 * scherm zou dan een "volgende" tonen die het niet wordt.
 */
export function waaromNietNummerZetten(
  s: Pick<DocReeksStand, 'prefix' | 'jaar' | 'hoogsteBestaand'>, volgende: number,
): string | null {
  if (!Number.isInteger(volgende) || volgende < 1) return 'Vul een heel getal van 1 of hoger in.'
  if (volgende <= s.hoogsteBestaand) {
    return `${nr(s.prefix, s.jaar, s.hoogsteBestaand)} bestaat al; het volgende nummer moet minstens `
      + `${String(s.hoogsteBestaand + 1).padStart(3, '0')} zijn.`
  }
  return null
}

/**
 * Bij facturen en credits: slaat dit nummers over? Dan de waarschuwing, want
 * factuurnummers horen aaneengesloten te zijn. `null` als er geen gat komt.
 */
export function gatInFactuurnummers(
  s: Pick<DocReeksStand, 'prefix' | 'jaar' | 'hoogsteBestaand' | 'volgendeN'>, volgende: number,
): string | null {
  if (s.prefix !== 'FACT' && s.prefix !== 'CRED') return null
  const eerstVrij = Math.max(s.hoogsteBestaand, s.volgendeN - 1) + 1
  if (volgende <= eerstVrij) return null
  const tot = volgende - 1
  const reeks = tot === eerstVrij
    ? nr(s.prefix, s.jaar, eerstVrij)
    : `${nr(s.prefix, s.jaar, eerstVrij)} t/m ${nr(s.prefix, s.jaar, tot)}`
  return `Dit slaat ${reeks} over. ${s.prefix === 'FACT' ? 'Factuurnummers' : 'Creditnummers'} horen aaneengesloten `
    + 'te zijn; een gat moet je aan de boekhouder kunnen uitleggen.'
}
