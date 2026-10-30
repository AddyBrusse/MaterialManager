// Wat de AI-assistent werkelijk verbruikt (2026-10-28). Eén rij per antwoord,
// zodat Instellingen een gemeten getal laat zien in plaats van de schatting uit
// het voorstel ($15–40 per maand). Het echte tegoed staat in de Anthropic Console.
import type Anthropic from '@anthropic-ai/sdk'
import type { AssistentGebruik } from '@stockmanager/shared'
import { prisma } from '../db/client'

interface Verbruik {
  rondes: number
  invoer: number
  cacheLezen: number
  cacheSchrijven: number
  uitvoer: number
}

export const nulVerbruik = (): Verbruik => ({ rondes: 0, invoer: 0, cacheLezen: 0, cacheSchrijven: 0, uitvoer: 0 })

export function telOp(v: Verbruik, u: Anthropic.Beta.Messages.BetaUsage): void {
  v.rondes++
  v.invoer += u.input_tokens
  v.cacheLezen += u.cache_read_input_tokens ?? 0
  v.cacheSchrijven += u.cache_creation_input_tokens ?? 0
  v.uitvoer += u.output_tokens
}

/** Bewaren mag het antwoord nooit tegenhouden: lukt het niet, dan alleen een regel in de log. */
export async function bewaarVerbruik(soort: 'chat' | 'bericht', model: string, v: Verbruik): Promise<void> {
  console.log(`[assistent] ${soort}: ${v.rondes} rondes, ${v.invoer} in, ${v.cacheLezen} uit cache, ${v.cacheSchrijven} naar cache, ${v.uitvoer} uit (${model})`)
  if (!v.rondes) return
  try {
    await prisma.assistentGebruik.create({ data: { soort, model, ...v } })
  } catch (err) {
    console.error('[assistent] verbruik bewaren mislukt:', err instanceof Error ? err.message : err)
  }
}

/**
 * Dollar per miljoen tokens, prijslijst van oktober 2026: invoer, uitvoer,
 * lezen uit de cache, schrijven naar de cache (5 minuten = 1,25 × invoer).
 * Een ander model (bijv. na een terugval) krijgt geen bedrag: liever niets dan
 * een verzonnen getal.
 */
const PRIJS: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
}

export async function gebruikOverzicht(dagen = 30): Promise<AssistentGebruik> {
  const sinds = new Date(Date.now() - dagen * 86_400_000)
  const rijen = await prisma.assistentGebruik.groupBy({
    by: ['model', 'soort'], where: { op: { gte: sinds } },
    _count: { _all: true }, _sum: { invoer: true, cacheLezen: true, cacheSchrijven: true, uitvoer: true },
  })
  let kosten: number | null = 0
  const tel = { chat: 0, bericht: 0, invoer: 0, cacheLezen: 0, cacheSchrijven: 0, uitvoer: 0 }
  for (const r of rijen) {
    const s = { invoer: r._sum.invoer ?? 0, cacheLezen: r._sum.cacheLezen ?? 0, cacheSchrijven: r._sum.cacheSchrijven ?? 0, uitvoer: r._sum.uitvoer ?? 0 }
    if (r.soort === 'chat') tel.chat += r._count._all
    else tel.bericht += r._count._all
    tel.invoer += s.invoer; tel.cacheLezen += s.cacheLezen; tel.cacheSchrijven += s.cacheSchrijven; tel.uitvoer += s.uitvoer
    const p = PRIJS[r.model]
    if (!p || kosten === null) { kosten = null; continue }
    kosten += (s.invoer * p[0] + s.uitvoer * p[1] + s.cacheLezen * p[2] + s.cacheSchrijven * p[3]) / 1_000_000
  }
  return { dagen, ...tel, kostenUsd: kosten === null ? null : Math.round(kosten * 100) / 100 }
}
