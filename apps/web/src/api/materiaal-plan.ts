import { apiFetch } from './client'
import type { LaderGegevens, MateriaalBehoefte, PlanStaaf, TeZagen, Voorstel, VoorstelRegel } from '@stockmanager/shared'
import type { ZaagReservation } from './reservations'

/**
 * Materiaalselectie: welke staven zagen we voor deze orderregel?
 *
 * Twee stappen met opzet. `plan` rekent alleen en legt niets vast; `bevestig`
 * legt vast wat iemand gezien en gekozen heeft. Materiaal stilzwijgend
 * reserveren is precies hoe je een staaf kwijtraakt die voor een spoedklus
 * bedoeld was.
 */

export type { Voorstel, VoorstelRegel, TeZagen }

export interface PlanUitkomst {
  behoefte: MateriaalBehoefte
  /** Het beste eerst (`packages/shared/calc/zaagplan.ts`). */
  voorstellen: Voorstel[]
  gebruikt: {
    materiaal: string
    werkstukLengteMm: number
    lader: LaderGegevens | null
    zaagsnedeMm: number
    vlakMm: number
    schrootDrempelMm: number
  }
  kandidaten: PlanStaaf[]
}

export interface BevestigVraag {
  artikelId: string
  aantal: number
  projectId: string
  calculatieNr: string
  regels: { barId: string; stangen: TeZagen[]; stuks: number; verbruikMm: number; restAfboeken: boolean }[]
  todoId?: string
  offerteRegelId?: string
  tekort?: { stuks: number; mm: number }
}

export const materiaalPlanApi = {
  plan: (body: { artikelId: string; aantal: number }) =>
    apiFetch<PlanUitkomst>('/reservations/materiaal-plan', {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),

  bevestig: (body: BevestigVraag) =>
    apiFetch<{ reserveringen: ZaagReservation[]; bestelTodoId: string | null }>(
      '/reservations/materiaal-plan/bevestig',
      { method: 'POST', body: JSON.stringify(body) },
    ).then((r) => r.data),
}

/** "3 × 1.086 + 4 × 998 mm" — dezelfde lengtes samengenomen. */
export function stangenTekst(stangen: TeZagen[]): string {
  const per = new Map<number, number>()
  for (const s of stangen) per.set(s.lengteMm, (per.get(s.lengteMm) ?? 0) + 1)
  const delen = [...per.entries()].sort((a, b) => b[0] - a[0])
    .map(([l, n]) => `${n} × ${Math.round(l).toLocaleString('nl-NL')}`)
  return delen.length ? `${delen.join(' + ')} mm` : '—'
}
