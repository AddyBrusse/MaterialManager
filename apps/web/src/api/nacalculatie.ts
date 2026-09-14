import { apiFetch } from './client'
import type { Nacalculatie } from '@stockmanager/shared'

export interface OrderNacalculatie extends Nacalculatie {
  orderId: string
  projectId: string
  artikelId: string | null
  artikelNaam: string
  status: string
  gemaakteStuks: number
  advies: { instelMin: number | null; cycleMin: number | null } | null
}

export interface ProjectNacalculatie {
  projectId: string
  orders: OrderNacalculatie[]
  gecalculeerdTotaal: number
  werkelijkTotaal: number
  verschilTotaal: number
  verschilPct: number | null
  verkoopTotaal: number | null
  margeWerkelijkPct: number | null
  margeGecalculeerdPct: number | null
  gemeten: boolean
}

export interface ArtikelNacalculatie {
  artikelId: string
  orders: OrderNacalculatie[]
  aantalOrders: number
  gemetenOrders: number
  verschilPct: number | null
  advies: { instelMin: number | null; cycleMin: number | null }
  huidig: { instelMin: number; cycleMinPerStuk: number } | null
}

/** Eén regel per artikel voor de artikelenlijst — niet de hele nacalculatie. */
export interface ArtikelSamenvatting {
  artikelId: string
  aantalOrders: number
  gemetenOrders: number
  verschilPct: number | null
  laatsteMeting: string | null
}

export const nacalculatieApi = {
  project: (projectId: string) =>
    apiFetch<ProjectNacalculatie>(`/nacalculatie/project/${projectId}`).then((r) => r.data),

  order: (orderId: string) =>
    apiFetch<OrderNacalculatie>(`/nacalculatie/order/${orderId}`).then((r) => r.data),

  artikel: (artikelId: string) =>
    apiFetch<ArtikelNacalculatie>(`/nacalculatie/artikel/${artikelId}`).then((r) => r.data),

  artikelen: () => apiFetch<ArtikelSamenvatting[]>('/nacalculatie/artikelen').then((r) => r.data),

  /**
   * De norm bijstellen. Raakt de calculatie van het artikel, dus werkt door in
   * elke volgende offerte, en zet een punt in het prijsverloop.
   */
  stelNormBij: (artikelId: string, body: { instelMin?: number; cycleMinPerStuk?: number }) =>
    apiFetch<ArtikelNacalculatie>(`/nacalculatie/artikel/${artikelId}/norm`, {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),
}
