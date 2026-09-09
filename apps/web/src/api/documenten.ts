import type { DocumentRegel } from '@stockmanager/shared'
import { apiFetch } from './client'

export const documentenApi = {
  list: () => apiFetch<DocumentRegel[]>('/documenten'),
}
