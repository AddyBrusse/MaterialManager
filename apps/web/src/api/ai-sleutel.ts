import type { AiSleutelStatus } from '@stockmanager/shared'
import { apiFetch } from './client'

/** Werkt de AI-sleutel van de server nog (2026-10-28)? Zie apps/api/src/services/ai-sleutel.ts. */
export const aiSleutelApi = {
  status: () => apiFetch<AiSleutelStatus>('/ai-sleutel').then((r) => r.data),
  /** Controleert ook het tegoed met een piepklein verzoek; de API mag daar even over doen. */
  test: () => apiFetch<AiSleutelStatus>('/ai-sleutel/test', { method: 'POST', timeoutMs: 60_000 }).then((r) => r.data),
}
