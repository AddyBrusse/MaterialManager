import { Router } from 'express'
import { asyncHandler } from '../lib/async-handler'
import { config } from '../config'
import { controleer, sleutelStatus, verversAlsNodig } from '../services/ai-sleutel'

/**
 * De AI-sleutel (2026-10-28): werkt ANTHROPIC_API_KEY nog? Zie
 * services/ai-sleutel.ts. Alleen lezen en testen; de sleutel zelf staat in de
 * omgeving van de server en is hier niet te zien of te wijzigen.
 */
const router = Router()

router.get('/', (_req, res) => {
  verversAlsNodig()
  res.json({ data: sleutelStatus() })
})

/** De testknop: ook een piepklein verzoek aan het model, want alleen zo blijkt of er tegoed is. */
router.post('/test', asyncHandler(async (_req, res) => {
  if (config.ai.apiKey) {
    const fout = await controleer(true)
    if (fout) {
      res.status(502).json({ error: { code: 'AI_TEST_FOUT', message: `De test kreeg een onverwacht antwoord van de API: ${fout}` } })
      return
    }
  }
  res.json({ data: sleutelStatus() })
}))

export default router
