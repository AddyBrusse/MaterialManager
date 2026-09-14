import { z } from 'zod'

/**
 * Tijdregistratie: één rij per keer dat er een klok op een productiestap loopt.
 *
 * De indeling spiegelt de calculatie met opzet. `computeEstimateTotals` verdeelt
 * insteltijd over de batch en rekent cyclustijd per stuk; meten we die twee niet
 * apart, dan valt geschat en werkelijk achteraf niet te vergelijken en is de
 * nacalculatie een tabel zonder betekenis.
 */
export const TijdSoortSchema = z.enum(['instellen', 'draaien'])
export type TijdSoort = z.infer<typeof TijdSoortSchema>

/**
 * lopend      — de klok telt door (`lopendSinds` is gevuld)
 * gepauzeerd  — gestopt maar niet afgerond; `gemetenSeconden` staat stil
 * afgerond    — klaar, telt mee in de nacalculatie
 */
export const TijdStatusSchema = z.enum(['lopend', 'gepauzeerd', 'afgerond'])
export type TijdStatus = z.infer<typeof TijdStatusSchema>

export const TijdRegistratieSchema = z.object({
  id:          z.string().uuid(),
  stapId:      z.string(),
  orderId:     z.string(),
  projectId:   z.string(),
  artikelId:   z.string().nullable(),
  artikelNaam: z.string(),

  soort:   TijdSoortSchema,
  /** Onbemand werk telt machine-uren maar geen manuren. */
  bemand:  z.boolean(),
  status:  TijdStatusSchema,

  machineNaam: z.string().nullable(),
  /** De operator. Leeg bij onbemand — daar staat niemand bij. */
  userId:      z.string().nullable(),
  userNaam:    z.string().nullable(),

  gestartOp: z.string().datetime(),
  /**
   * Begin van de lopende deelmeting. Is dit gevuld, dan telt de klok door en is
   * de werkelijke tijd `gemetenSeconden + (nu − lopendSinds)`. Zo overleeft een
   * lopende klok een herstart van de server zonder tijd te verzinnen.
   */
  lopendSinds: z.string().datetime().nullable(),
  gestoptOp:   z.string().datetime().nullable(),

  /** Opgeteld over alle deelmetingen, exclusief de lopende. */
  gemetenSeconden: z.number().int().nonnegative(),

  /**
   * Correctie. De gemeten waarde blijft altijd staan: het verschil tussen wat
   * de klok zag en wat een mens ervan maakte is zelf een signaal.
   */
  bijgesteldeSeconden: z.number().int().nonnegative().nullable(),
  correctieReden:      z.string().nullable(),
  correctieDoor:       z.string().nullable(),
  correctieOp:         z.string().datetime().nullable(),

  /** Aantal stuks dat in deze registratie gemaakt is (alleen bij draaien). */
  aantalStuks: z.number().int().nonnegative().nullable(),
  notitie:     z.string().nullable(),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type TijdRegistratie = z.infer<typeof TijdRegistratieSchema>

/** Wat de klok werkelijk heeft opgeleverd, correctie inbegrepen. */
export const StartTijdSchema = z.object({
  stapId:      z.string().min(1, 'Stap is verplicht'),
  soort:       TijdSoortSchema,
  bemand:      z.boolean().default(true),
  /** Bij bemand werk kiest de operator zijn naam op de terminal. */
  operatorId:  z.string().nullable().default(null),
  /**
   * De machine waar het werk werkelijk gebeurt. Leeg = de machine waarop de
   * stap gepland stond.
   *
   * Die twee lopen uiteen zodra de planning op het laatste moment wijzigt:
   * draait de DMG een klus die voor de Doosan stond, dan horen die uren tegen
   * het DMG-tarief in de nacalculatie. Het geplande tarief zou rekenen met een
   * machine die niets gedaan heeft.
   */
  machineNaam: z.string().nullable().default(null),
  notitie:     z.string().max(500).nullable().default(null),
})
export type StartTijd = z.infer<typeof StartTijdSchema>

export const StopTijdSchema = z.object({
  aantalStuks: z.number().int().nonnegative().nullable().default(null),
  notitie:     z.string().max(500).nullable().default(null),
})
export type StopTijd = z.infer<typeof StopTijdSchema>

/** Wisselen tussen instellen en draaien, of tussen bemand en onbemand. */
export const WisselTijdSchema = z.object({
  soort:      TijdSoortSchema.optional(),
  bemand:     z.boolean().optional(),
  operatorId: z.string().nullable().optional(),
})
export type WisselTijd = z.infer<typeof WisselTijdSchema>

export const CorrigeerTijdSchema = z.object({
  bijgesteldeSeconden: z.number().int().nonnegative('Tijd kan niet negatief zijn'),
  reden:               z.string().min(3, 'Geef een reden op'),
  aantalStuks:         z.number().int().nonnegative().nullable().default(null),
})
export type CorrigeerTijd = z.infer<typeof CorrigeerTijdSchema>

/**
 * Effectieve duur van een registratie, in seconden.
 *
 * Eén plek, want dit is de enige regel die bepaalt wat "werkelijk" betekent:
 * een gecorrigeerde regel telt met de bijgestelde waarde, een lopende klok telt
 * door tot nu. Rekenen schermen dat zelf uit, dan drijven ze uiteen.
 */
export function effectieveSeconden(
  r: Pick<TijdRegistratie, 'gemetenSeconden' | 'bijgesteldeSeconden' | 'lopendSinds'>,
  nu: Date = new Date(),
): number {
  if (r.bijgesteldeSeconden !== null) return r.bijgesteldeSeconden
  const lopend = r.lopendSinds
    ? Math.max(0, Math.floor((nu.getTime() - new Date(r.lopendSinds).getTime()) / 1000))
    : 0
  return r.gemetenSeconden + lopend
}

/** "1:12:40" — de klokweergave. Uren lopen door voorbij 24. */
export function secondenNaarKlok(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const u = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return `${u}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** "3:15 u" / "45 min" — dezelfde vorm als minToHm in de calculatie. */
export function secondenNaarUren(sec: number): string {
  const min = Math.round(Math.max(0, sec) / 60)
  const u = Math.floor(min / 60)
  const m = min % 60
  return u > 0 ? `${u}:${String(m).padStart(2, '0')} u` : `${m} min`
}
