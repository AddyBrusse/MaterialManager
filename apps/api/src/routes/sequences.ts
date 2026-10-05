import { Router } from 'express'
import { DOC_PREFIXEN, NummerWijzigSchema } from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { requireAdmin } from '../middleware/require-admin'
import { AppError } from '../middleware/error'
import { reeksWijzigingen, standVanReeksen, zetVolgendNummer, type DocPrefix } from '../services/doc-nummer'

const router = Router()

/**
 * De stand van de nummerreeksen van dit jaar (Instellingen → Nummering).
 * Nummers uitgeven doet alleen de server zelf, bij het aanmaken van het
 * document (`services/doc-nummer.ts`); hier stond eerder een `POST /next` die
 * niemand gebruikte en die nog de oude jaarloze teller ophoogde.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await standVanReeksen() })
  }),
)

router.get(
  '/wijzigingen',
  asyncHandler(async (_req, res) => {
    res.json({ data: await reeksWijzigingen() })
  }),
)

/** Het volgende nummer van dit jaar met de hand zetten — alleen een admin. */
router.put(
  '/:prefix',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const prefix = req.params.prefix as DocPrefix
    if (!DOC_PREFIXEN.includes(prefix)) throw new AppError(404, 'NOT_FOUND', `Onbekende nummerreeks ${req.params.prefix}.`)
    const body = NummerWijzigSchema.parse(req.body)
    res.json({ data: await zetVolgendNummer(prefix, body, req.user?.name ?? 'onbekend') })
  }),
)

export default router
