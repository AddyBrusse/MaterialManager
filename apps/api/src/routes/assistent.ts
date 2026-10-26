import { Router } from 'express'
import { z } from 'zod'
import { laatsteMoment, type AssistentActie, type AssistentBericht } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { aiFoutTekst } from '../services/ai-extract'
import { openActies } from '../services/assistent-data'
import { AssistentWeigering, assistentAan, berichtZonderModel, chat, maakBericht } from '../services/assistent'

/**
 * De AI-assistent (2026-10-09): het bericht op vaste tijden en het chatpaneel.
 * Leest en stelt voor; er is hier geen enkele route die iets wijzigt behalve
 * het bewaren van het bericht zelf.
 */
const router = Router()

/** Eén aanmaak per moment, ook als vier schermen tegelijk vragen. */
const bezig = new Map<number, Promise<AssistentBericht>>()
/** Na een mislukte aanroep tien minuten niet opnieuw proberen — anders kost elke pagina-lading een aanroep. */
let misluktTot = 0

function naarBericht(r: { moment: Date; tekst: string; acties: unknown; model: string | null }): AssistentBericht {
  return { moment: r.moment.toISOString(), tekst: r.tekst, acties: (r.acties ?? []) as AssistentActie[], model: r.model }
}

async function berichtVoor(moment: Date): Promise<AssistentBericht> {
  const bestaand = await prisma.assistentBericht.findUnique({ where: { moment } })
  if (bestaand) return naarBericht(bestaand)

  if (assistentAan() && Date.now() >= misluktTot) {
    try {
      const a = await maakBericht(moment)
      const r = await prisma.assistentBericht.upsert({
        where: { moment }, update: {},
        create: { moment, tekst: a.tekst, acties: a.acties as object[], model: a.model },
      })
      return naarBericht(r)
    } catch (err) {
      misluktTot = Date.now() + 10 * 60_000
      console.error('[assistent] bericht maken mislukt:', aiFoutTekst(err))
    }
  }
  // Zonder taalmodel: uit de gegevens zelf, en niet bewaren — dan probeert het
  // volgende moment (of de volgende keer na een storing) het weer met het model.
  const z = berichtZonderModel(await openActies(prisma))
  return { moment: moment.toISOString(), tekst: z.tekst, acties: z.acties, model: null }
}

router.get('/bericht', asyncHandler(async (_req, res) => {
  const bedrijf = await prisma.company.findUnique({ where: { id: 'default' }, select: { assistentAan: true, assistentTijden: true } })
  const tijden = bedrijf?.assistentTijden ?? ['08:00', '15:00']
  const moment = bedrijf?.assistentAan === false ? null : laatsteMoment(tijden)
  if (!moment) { res.json({ data: null }); return }
  const sleutel = moment.getTime()
  let p = bezig.get(sleutel)
  if (!p) {
    p = berichtVoor(moment).finally(() => bezig.delete(sleutel))
    bezig.set(sleutel, p)
  }
  res.json({ data: await p })
}))

const ChatSchema = z.object({
  berichten: z.array(z.object({
    rol: z.enum(['gebruiker', 'assistent']),
    tekst: z.string().min(1).max(4000),
  })).min(1).max(40),
})

router.post('/chat', asyncHandler(async (req, res) => {
  if (!assistentAan()) {
    res.status(503).json({ error: { code: 'AI_UIT', message: 'De assistent heeft geen API-sleutel. Zet ANTHROPIC_API_KEY in de omgeving van de server.' } })
    return
  }
  const { berichten } = ChatSchema.parse(req.body)
  try {
    res.json({ data: await chat(berichten, req.user.name) })
  } catch (err) {
    if (err instanceof AssistentWeigering) {
      res.status(422).json({ error: { code: 'AI_WEIGERT', message: err.message } })
      return
    }
    res.status(502).json({ error: { code: 'AI_FOUT', message: `De assistent kon niet antwoorden: ${aiFoutTekst(err)}.`, details: { reden: err instanceof Error ? err.message : String(err) } } })
  }
}))

export default router
