import type { OmgevingInfo } from '@stockmanager/shared'
import { apiFetch } from './client'

/** Test of echt, volgens de database van de server (2026-11-03, calc/omgeving.ts). */
export const omgevingApi = {
  haal: () => apiFetch<OmgevingInfo>('/omgeving').then((r) => r.data),
}
