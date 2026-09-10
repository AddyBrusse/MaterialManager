import { apiFetch } from './client'

/** Waar dit punt vandaan komt. Zie `apps/api/src/services/prijs-snapshot.ts`. */
export type SnapshotBron = 'order' | 'calculatie'

export interface PrijsSnapshot {
  id: string
  artikelId: string
  bron: SnapshotBron
  gemetenOp: string

  qty: number
  kostprijsPerStuk: number
  /** Herrekend bij 1 stuk — de enige maat die over de tijd vergelijkbaar is. */
  kostprijsBasis: number
  verkoopprijsBasis: number
  verkoopprijsPerStuk: number | null
  margePct: number | null
  kostprijsTotaal: number
  verkoopprijsTotaal: number | null

  materiaalPerStuk: number
  instellenPerStuk: number
  bewerkingPerStuk: number
  externPerStuk: number

  projectId: string | null
  offerteId: string | null
  offerteRegelId: string | null
  relatieId: string | null
  klant: string | null
  door: string | null
  createdAt: string
}

export const prijshistorieApi = {
  /** Oudste eerst — de grafiek leest van links naar rechts. */
  list: (artikelId: string) =>
    apiFetch<PrijsSnapshot[]>(`/articles/${artikelId}/prijshistorie`),
}
