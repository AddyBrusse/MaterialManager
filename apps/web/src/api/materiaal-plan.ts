import { apiFetch } from './client'
import type { PlanRegel, ZaagPlan, ZaagParams, PlanStaaf } from '@stockmanager/shared'
import type { ZaagReservation } from './reservations'

/**
 * Materiaalselectie: wat gaan we zagen voor dit artikel?
 *
 * Twee stappen met opzet. `plan` rekent alleen en legt niets vast; `bevestig`
 * legt vast wat iemand gezien heeft. Materiaal stilzwijgend reserveren is
 * precies hoe je een staaf kwijtraakt die voor een spoedklus bedoeld was.
 */

export type { PlanRegel, ZaagPlan }

export interface PlanUitkomst {
  plan: ZaagPlan
  gebruikt: {
    machineNaam: string | null
    werkstukLengteMm: number
    params: ZaagParams
    loaderMinMm: number
    loaderMaxMm: number
    schrootDrempelMm: number
  }
  kandidaten: PlanStaaf[]
}

export interface PlanVraag {
  artikelId: string
  aantal: number
  machineId?: string | null
  overschrijf?: Partial<ZaagParams> & { loaderMinMm?: number; loaderMaxMm?: number }
}

export interface BevestigVraag extends PlanVraag {
  projectId: string
  calculatieNr: string
  machine: string
  regels: { barId: string; laderstangen: number; stuks: number; verbruikMm: number }[]
  todoId?: string
  tekort?: { stuks: number; mm: number }
}

export const materiaalPlanApi = {
  plan: (body: PlanVraag) =>
    apiFetch<PlanUitkomst>('/reservations/materiaal-plan', {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),

  bevestig: (body: BevestigVraag) =>
    apiFetch<{ reserveringen: ZaagReservation[]; bestelTodoId: string | null }>(
      '/reservations/materiaal-plan/bevestig',
      { method: 'POST', body: JSON.stringify(body) },
    ).then((r) => r.data),
}
