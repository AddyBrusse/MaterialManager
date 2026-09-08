import type { MailImport, MailImportStatus, MailIntent } from '@stockmanager/shared'
import { apiFetch, apiUpload } from './client'

export interface IngestResult {
  mailImport: MailImport
  /** True als deze mail al eerder was binnengehaald — er is niets nieuws gemaakt. */
  duplicate: boolean
  /** True als die bestaande import opnieuw is uitgelezen (er was nog niets over beslist). */
  refreshed?: boolean
}

export interface UpdateMailImport {
  relatieId?: string | null
  intent?: MailIntent
  status?: MailImportStatus
  projectId?: string | null
}

export const mailImportsApi = {
  /** Een uit Outlook gesleept .msg naar binnen halen. Gebruikt apiUpload: geen
   *  Content-Type header en een ruimere timeout dan de JSON-calls. */
  upload: (file: File) => apiUpload<IngestResult>('/mail-imports', file).then((r) => r.data),

  list: (params: { status?: MailImportStatus; relatieId?: string; projectId?: string } = {}) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
    const suffix = q.toString() ? `?${q}` : ''
    return apiFetch<MailImport[]>(`/mail-imports${suffix}`).then((r) => r.data)
  },

  get: (id: string) => apiFetch<MailImport>(`/mail-imports/${id}`).then((r) => r.data),

  update: (id: string, body: UpdateMailImport) =>
    apiFetch<MailImport>(`/mail-imports/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data),

  /** Een regel aan een artikel koppelen. De server leert dit als alias voor de relatie. */
  setLineArticle: (id: string, lineId: string, artikelId: string | null) =>
    apiFetch<MailImport>(`/mail-imports/${id}/regels/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ artikelId }),
    }).then((r) => r.data),

  /**
   * De mail opnieuw laten uitlezen. Gooit de vorige uitkomst weg — handmatige
   * koppelingen inbegrepen — en laat het model er vers naar kijken.
   */
  reread: (id: string) =>
    apiFetch<MailImport>(`/mail-imports/${id}/opnieuw`, { method: 'POST' }).then((r) => r.data),

  remove: (id: string) => apiFetch<void>(`/mail-imports/${id}`, { method: 'DELETE' }),
}
