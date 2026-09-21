/**
 * Viewmodel van de projectdetailpagina — het contract tussen data en scherm
 * (§12 van de bouwspecificatie).
 *
 * De spec laat de backend dit opleveren. Dat doet hij (nog) niet, dus wordt het
 * hier afgeleid uit `Project` plus nacalculatie, reserveringen en todo's; zie
 * `lib/build-vm.ts`. Alle afleidingen staan in pure functies zonder React, zodat
 * ze later ongewijzigd naar een `GET /projects/:id/detail-vm` kunnen verhuizen
 * en dit bestand het contract blijft.
 */

import type { ProjectStatus } from '@stockmanager/shared'

export type Fase = ProjectStatus

export type Ernst = 'rood' | 'amber' | 'blauw'

export interface AandachtVM {
  ernst: Ernst
  titel: string
  toelichting: string
}

export interface FacetVM {
  label: string
  waarde: string
  sub?: string
  /** Kleur alleen als de waarde aandacht vraagt; anders gewoon --text. */
  kleur?: 'warn' | 'dgr' | 'ok'
  meter?: { deel: number; gereed: boolean }
}

export interface ActieVM {
  label: string
  kan: boolean
  reden?: string
}

export interface TerugVM {
  label: string
  naar: Fase | null
  blokkades: string[]
  gevolgen: string[]
}

export interface SlotVM {
  houder: string | null
  /** True als de houder iemand anders is dan de huidige gebruiker. */
  vreemd: boolean
  opslag: 'opgeslagen' | 'bezig' | 'mislukt' | 'stil'
  opslagTekst: string
}

export interface ActiviteitVM {
  tijd: string
  tekst: string
}

export interface ReserveringVM {
  materiaal: string
  hoeveelheid: string
  toestand: string
  wacht: boolean
}

export interface TodoVM {
  id: string
  titel: string
  herkomst: string
}

export interface TabBadge {
  tekst: string
  kleur?: 'ok' | 'warn' | 'dgr' | 'accent'
}

export type TabId =
  | 'algemeen'
  | 'offertes'
  | 'opdracht'
  | 'productie'
  | 'nacalculatie'
  | 'documenten'

export interface GeldVM {
  offertetotaal: number | null
  kostprijsCalculatie: number | null
  kostprijsWerkelijk: number | null
  verschil: number | null
  verschilPct: number | null
  margeWerkelijkPct: number | null
  margeCalculatiePct: number | null
  notitie: string | null
}
