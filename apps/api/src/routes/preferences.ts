import { Router } from 'express'
import { prisma } from '../db/client'
import { SaveUserPreferenceSchema } from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { asyncHandler } from '../lib/async-handler'

// Per-user UI preferences, keyed by the caller's own user id (from the
// x-user-id header via userContext) — a user can only ever read/write their
// own. The value is an opaque JSON blob owned by the calling feature.
const router = Router()

router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const pref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: req.user.id, key: req.params.key } },
    })
    res.json({ data: pref ? pref.value : null })
  }),
)

router.put(
  '/:key',
  asyncHandler(async (req, res) => {
    // z.unknown() treats a missing key as valid, so `{}` (or no body at all)
    // would validate and then store null — silently wiping the user's saved
    // preference with a 200. Require the field explicitly.
    if (!req.body || typeof req.body !== 'object' || !('value' in req.body)) {
      throw new AppError(400, 'VALIDATION', 'value ontbreekt in body')
    }
    const { value } = SaveUserPreferenceSchema.parse(req.body)
    const data = value === undefined ? null : value
    const pref = await prisma.userPreference.upsert({
      where: { userId_key: { userId: req.user.id, key: req.params.key } },
      update: { value: data as object },
      create: { userId: req.user.id, key: req.params.key, value: data as object },
    })
    res.json({ data: pref.value })
  }),
)

/** Reset a preference back to the app default. */
router.delete(
  '/:key',
  asyncHandler(async (req, res) => {
    await prisma.userPreference.deleteMany({
      where: { userId: req.user.id, key: req.params.key },
    })
    res.status(204).end()
  }),
)

export default router
