import type { NacalculatieRegel } from '@stockmanager/shared'
import type { ProjectNacalculatie } from '../../../../../api/nacalculatie'

/** Zo zegt de kern dat er voor een post (nog) niets gemeten of afgeboekt is. */
const NIET_GEMETEN = new Set(['nog niet gemeten', 'nog niet afgeboekt', 'geen afwijking geregistreerd'])

export type Post = NacalculatieRegel & { gemeten: boolean }

/** Waarom er bij een post (nog) geen werkelijk bedrag staat. */
export const NOG_NIET: Record<string, string> = {
  materiaal: 'Nog niets afgeboekt van de staaf',
  instellen: 'Nog geen uren geklokt',
  draaien: 'Nog geen uren geklokt',
  extern: 'Werkelijk nog niet bij te houden',
}

/** Vier posten over alle orders heen opgeteld: materiaal, instellen, draaien, extern. */
export function telPosten(nacalc: ProjectNacalculatie): Post[] {
  const perPost = new Map<string, Post>()
  for (const order of nacalc.orders) {
    for (const r of order.regels) {
      const gemeten = !NIET_GEMETEN.has(r.toelichting)
      const bestaand = perPost.get(r.post)
      if (!bestaand) {
        perPost.set(r.post, { ...r, gemeten })
        continue
      }
      bestaand.gecalculeerd += r.gecalculeerd
      bestaand.werkelijk += r.werkelijk
      bestaand.verschil += r.verschil
      bestaand.gemeten ||= gemeten
      bestaand.verschilPct =
        bestaand.gecalculeerd === 0 ? null : (bestaand.verschil / bestaand.gecalculeerd) * 100
      bestaand.toelichting = `uit ${nacalc.orders.length} orders`
    }
  }
  return [...perPost.values()]
}

/** Tijd per post over alle orders en machines: alleen instellen en draaien hebben tijd. */
export function tijdPerPost(nacalc: ProjectNacalculatie, post: string): { gecalcMin: number | null; werkSec: number | null } {
  if (post !== 'instellen' && post !== 'draaien') return { gecalcMin: null, werkSec: null }
  let gecalcMin = 0
  let werkSec = 0
  let gemeten = false
  for (const o of nacalc.orders) {
    for (const m of o.machines) {
      if (m.gecalculeerd) gecalcMin += post === 'instellen' ? m.gecalculeerd.instelMin : m.gecalculeerd.draaienMin
      if (m.werkelijk) {
        werkSec += post === 'instellen' ? m.werkelijk.instelSeconden : m.werkelijk.draaienSeconden
        gemeten = true
      }
    }
  }
  return { gecalcMin, werkSec: gemeten ? werkSec : null }
}

