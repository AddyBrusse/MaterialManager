import type { MailImport, MailImportStatus, MailIntent, MailKoppeling } from '@stockmanager/shared'
import { apiFetch, apiUpload, MODEL_TIMEOUT_MS } from './client'

interface IngestResult {
  mailImport: MailImport
  /** True als deze mail al eerder was binnengehaald — er is niets nieuws gemaakt. */
  duplicate: boolean
  /** True als die bestaande import opnieuw is uitgelezen (er was nog niets over beslist). */
  refreshed?: boolean
}

export interface IngestSchatting {
  verwachtSeconden: number | null
  ondergrensSeconden: number | null
  bovengrensSeconden: number | null
  gebaseerdOp: number
}

interface UpdateMailImport {
  relatieId?: string | null
  contactId?: string | null
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
   * Hoe lang gaat dit ongeveer duren? Uit gemeten runs op deze installatie.
   * Faalt stil: zonder schatting loopt de balk gewoon blind.
   */
  schatting: (bytes: number) =>
    apiFetch<IngestSchatting>(`/mail-imports/schatting?bytes=${bytes}`)
      .then((r) => r.data)
      .catch(() => null),

  /**
   * De mail opnieuw laten uitlezen. Gooit de vorige uitkomst weg — handmatige
   * koppelingen inbegrepen — en laat het model er vers naar kijken.
   */
  reread: (id: string) =>
    apiFetch<MailImport>(`/mail-imports/${id}/opnieuw`, { method: 'POST', timeoutMs: MODEL_TIMEOUT_MS })
      .then((r) => r.data),

  /**
   * De mail aan het project koppelen en, als de offerte nog leeg is, de regels
   * overnemen — op de server, in één keer (2026-10-28): klant, referentie en
   * levertijd op het project, regels en referentie op de offerte, nieuwe
   * artikelen met hun tekeningen en per nieuw artikel de taak "Recept maken".
   * Lukt het niet, dan is er niets veranderd. Gooit een `ApiFout`.
   */
  koppel: (id: string, body: { projectId: string; relatieId: string; contactId: string | null; intent: MailIntent }) =>
    // Ruim: het kopiëren van een STEP-bestand van tientallen MB kost tijd.
    apiFetch<MailKoppeling>(`/mail-imports/${id}/koppel`, { method: 'POST', body: JSON.stringify(body), timeoutMs: 60_000 })
      .then((r) => r.data),

  /**
   * De tekeningen uit deze mail alsnog aan de al bestaande artikelen hangen.
   * Voor een mail die al aan een project gekoppeld is: opnieuw uitlezen kan dan
   * niet en opnieuw slepen ook niet, dus zonder dit zit je klem.
   */
  tekeningenNaarArtikelen: (id: string) =>
    apiFetch<{
      mailImport: MailImport
      artikelen: { artikelId: string; toegevoegd: number }[]
      overgeslagen: { naam: string; reden: string }[]
    }>(`/mail-imports/${id}/tekeningen-naar-artikelen`, { method: 'POST' }).then((r) => r.data),

  remove: (id: string) => apiFetch<void>(`/mail-imports/${id}`, { method: 'DELETE' }),
}
