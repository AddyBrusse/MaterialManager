import type { Melding } from '@stockmanager/shared'
import { apiFetch } from './client'

export type { Melding }

interface Meldingen { aantal: number; rood: number; meldingen: Melding[] }

/** Eén meldingenlijst voor iedereen (2026-10-09), afgeleid op de server. */
export const meldingenApi = {
  lijst: () => apiFetch<Meldingen>('/meldingen').then((r) => r.data),
}
