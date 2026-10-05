import { Router } from 'express'
import { asyncHandler } from '../lib/async-handler'
import { standVanReeksen } from '../services/doc-nummer'

const router = Router()

/**
 * De stand van de nummerreeksen van dit jaar, om te lezen (Instellingen →
 * Nummering). Nummers uitgeven doet alleen de server zelf, bij het aanmaken
 * van het document (`services/doc-nummer.ts`); hier stond eerder een
 * `POST /next` die niemand gebruikte en die nog de oude jaarloze teller ophoogde.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await standVanReeksen() })
  }),
)

export default router
