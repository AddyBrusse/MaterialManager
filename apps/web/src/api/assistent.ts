import type { AssistentActie, AssistentBericht, ChatBericht } from '@stockmanager/shared'
import { apiFetch } from './client'

export type { AssistentActie, AssistentBericht, ChatBericht }

/**
 * De AI-assistent (2026-10-09). Leest en stelt voor; de knoppen openen een
 * scherm, de handeling zelf doet een mens. Een taalmodel heeft tijd nodig, dus
 * deze verzoeken krijgen een ruime time-out.
 */
export const assistentApi = {
  /** Het bericht van het laatste vaste tijdstip; null als de assistent uit staat. */
  bericht: () => apiFetch<AssistentBericht | null>('/assistent/bericht', { timeoutMs: 120_000 }).then((r) => r.data),
  chat: (berichten: ChatBericht[]) =>
    apiFetch<{ tekst: string; acties: AssistentActie[]; model: string }>('/assistent/chat', {
      method: 'POST', body: JSON.stringify({ berichten: berichten.map(({ rol, tekst }) => ({ rol, tekst })) }), timeoutMs: 180_000,
    }).then((r) => r.data),
}
