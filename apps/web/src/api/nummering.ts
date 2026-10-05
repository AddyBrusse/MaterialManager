import type { DocReeksStand } from '@stockmanager/shared'
import { apiFetch } from './client'

export const nummeringApi = {
  /** De stand van de nummerreeksen van dit jaar, om te lezen. */
  stand: () => apiFetch<DocReeksStand[]>('/sequences').then((r) => r.data),
}
