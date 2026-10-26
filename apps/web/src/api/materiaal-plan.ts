import { apiFetch } from './client'
import type { LaderGegevens, MateriaalBehoefte, PlanStaaf, RegelDekking, TeZagen, Voorstel } from '@stockmanager/shared'
import type { ZaagReservation } from './reservations'

/**
 * Materiaalselectie: welke staven zagen we voor deze orderregel?
 *
 * Twee stappen met opzet. `plan` rekent alleen en legt niets vast; `bevestig`
 * legt vast wat iemand gezien en gekozen heeft. Materiaal stilzwijgend
 * reserveren is precies hoe je een staaf kwijtraakt die voor een spoedklus
 * bedoeld was.
 *
 * Per materiaalregel van het artikel (2026-10-23): elke regel heeft een eigen
 * plan, en wordt apart vastgelegd.
 */

export type { Voorstel, RegelDekking }

export interface PlanGebruikt {
  materiaal: string
  werkstukLengteMm: number
  lader: LaderGegevens | null
  zaagsnedeMm: number
  vlakMm: number
  schrootDrempelMm: number
}

/** Het plan van één materiaalregel (`apps/api/src/services/materiaal-selectie.ts`). */
export interface PlanRegel {
  regelId: string | null
  naam: string
  materiaal: string
  /** De regel mist iets (maat, lengte): eerst invullen in de calculatie. */
  fout: string | null
  dekking: RegelDekking
  /** Wat er nog gezaagd moet worden; null als er niets meer te kiezen is. */
  behoefte: MateriaalBehoefte | null
  /** Het beste eerst (`packages/shared/calc/zaagplan.ts`). */
  voorstellen: Voorstel[]
  gebruikt: PlanGebruikt
  kandidaten: PlanStaaf[]
}

export interface PlanUitkomst {
  regels: PlanRegel[]
  /** Exoten: op maat besteld, komen niet uit de voorraad. */
  exoten: string[]
}

interface BevestigVraag {
  artikelId: string
  aantal: number
  projectId: string
  calculatieNr: string
  materiaalRegelId: string | null
  regels: { barId: string; stangen: TeZagen[]; stuks: number; verbruikMm: number; restAfboeken: boolean }[]
  todoId?: string
  offerteRegelId?: string
  tekort?: { stuks: number; mm: number }
}

interface BevestigUitkomst {
  reserveringen: ZaagReservation[]
  bestelTodoId: string | null
  /** Elke materiaalregel geregeld: de todo is afgevinkt. */
  todoKlaar: boolean
  dekking: RegelDekking[]
}

/** Per orderregel van de opdracht: wat er per materiaalregel geregeld is. */
export interface OrderRegelDekking {
  offerteRegelId: string
  regels: (RegelDekking & { naam: string; materiaal: string; fout: string | null })[]
  exoten: string[]
}

export const materiaalPlanApi = {
  plan: (body: { artikelId: string; aantal: number; projectId?: string; offerteRegelId?: string }) =>
    apiFetch<PlanUitkomst>('/reservations/materiaal-plan', {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),

  bevestig: (body: BevestigVraag) =>
    apiFetch<BevestigUitkomst>('/reservations/materiaal-plan/bevestig', {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),

  dekking: (projectId: string) =>
    apiFetch<OrderRegelDekking[]>(`/reservations/materiaal-dekking?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.data),
}

/** "3 × 1.086 + 4 × 998 mm" — dezelfde lengtes samengenomen. */
export function stangenTekst(stangen: TeZagen[]): string {
  const per = new Map<number, number>()
  for (const s of stangen) per.set(s.lengteMm, (per.get(s.lengteMm) ?? 0) + 1)
  const delen = [...per.entries()].sort((a, b) => b[0] - a[0])
    .map(([l, n]) => `${n} × ${Math.round(l).toLocaleString('nl-NL')}`)
  return delen.length ? `${delen.join(' + ')} mm` : '—'
}
