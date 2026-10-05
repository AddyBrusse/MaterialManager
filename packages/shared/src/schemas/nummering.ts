import { z } from 'zod'

/**
 * De stand van één nummerreeks in het lopende jaar (Instellingen → Nummering).
 * Alleen om te lezen: nummers geeft de server bij het aanmaken, per soort per
 * jaar (2026-10-05).
 */
export const DocReeksStandSchema = z.object({
  prefix: z.string(),
  naam: z.string(),
  jaar: z.number().int(),
  /** Het laatst uitgegeven nummer dit jaar, of null als er nog geen is. */
  laatste: z.string().nullable(),
  volgende: z.string(),
})
export type DocReeksStand = z.infer<typeof DocReeksStandSchema>
