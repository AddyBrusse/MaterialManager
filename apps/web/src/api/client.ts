import { useUserStore } from '../stores/user'

/**
 * Hoe lang een verzoek mag duren waarin de server het taalmodel aanroept: een
 * mail slepen of opnieuw uitlezen. Twee lezingen met pdf's erbij duren al snel
 * een minuut; met de 3 seconden van een gewone JSON-call brak "Opnieuw
 * uitlezen" altijd af terwijl de server gewoon doorlas (2026-09-28).
 */
export const MODEL_TIMEOUT_MS = 120_000

/**
 * Multipart file upload — separate from apiFetch because a FormData body
 * must NOT get a Content-Type header (the browser sets its own multipart
 * boundary), and apiFetch's 3s abort timeout is sized for JSON calls, not
 * multi-MB CAD/NC files over a LAN connection.
 */
export async function apiUpload<T>(path: string, file: File): Promise<{ data: T }> {
  const user = useUserStore.getState().user
  const headers: HeadersInit = user ? { 'x-user-id': user.id } : {}
  const form = new FormData()
  form.append('file', file)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`/api${path}`, { method: 'POST', body: form, headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  const json = await res.json()

  if (!res.ok) {
    // De server stuurt bij een 500 in ontwikkeling de echte reden mee; die
    // hoort in de melding, anders staat er alleen "Interne serverfout" en
    // begint het zoeken opnieuw.
    const reden = json?.error?.details?.reden
    const msg = [json?.error?.message ?? `HTTP ${res.status}`, reden].filter(Boolean).join(' — ')
    throw new Error(msg)
  }

  return json as { data: T }
}

/**
 * Een mislukt verzoek, met alles wat een melding nodig heeft om te zeggen wát
 * er misging en wáár (zie `utils/fout-melding.ts` en de afspraak in CLAUDE.md).
 *
 * Een subklasse van Error, zodat bestaande code die `e.message` toont blijft
 * werken — die krijgt dezelfde tekst als voorheen.
 */
export class ApiFout extends Error {
  constructor(
    /** Wat de server zei, of een eigen uitleg als hij niets zei. */
    public readonly uitleg: string,
    /** De code uit `{ error: { code } }`, of GEEN_VERBINDING / TIMEOUT. */
    public readonly code: string,
    /** HTTP-status; 0 als het verzoek de server nooit bereikte. */
    public readonly status: number,
    /** Methode en pad, bijvoorbeeld "POST /projects/PRJ-1/offertes". */
    public readonly verzoek: string,
    /** De technische reden die de server meestuurde, als die er is. */
    public readonly reden?: string,
  ) {
    super(reden ? `${uitleg} — ${reden}` : uitleg)
    this.name = 'ApiFout'
  }
}

export async function apiFetch<T>(
  path: string,
  /** `timeoutMs` alleen voor verzoeken die echt lang duren; standaard 3 s. */
  { timeoutMs = 3000, ...options }: RequestInit & { timeoutMs?: number } = {}
): Promise<{ data: T }> {
  const user = useUserStore.getState().user
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(user ? { 'x-user-id': user.id } : {}),
    ...(options.headers ?? {}),
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const verzoek = `${(options.method ?? 'GET').toUpperCase()} ${path}`

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...options, headers, signal: controller.signal })
  } catch (e) {
    // Het verzoek bereikte de server niet, of kwam niet op tijd terug. Twee
    // verschillende situaties met een verschillende oplossing, dus ook twee
    // verschillende meldingen.
    if (controller.signal.aborted) {
      throw new ApiFout(`De server antwoordde niet binnen ${Math.round(timeoutMs / 1000)} seconden`, 'TIMEOUT', 0, verzoek)
    }
    throw new ApiFout(
      'De server is niet bereikbaar — draait de API, en is het netwerk in orde?',
      'GEEN_VERBINDING', 0, verzoek, e instanceof Error ? e.message : undefined,
    )
  } finally {
    clearTimeout(timer)
  }

  // A 204 (or any empty body) has nothing to parse — calling res.json() on it
  // throws "Unexpected end of JSON input", which used to turn every successful
  // DELETE into a rejected promise.
  const raw = await res.text()
  let json: any = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    // Geen JSON terug — bijvoorbeeld een HTML-foutpagina van een proxy. Dan
    // is dát de fout, niet een onleesbare "Unexpected token <".
    if (!res.ok) throw new ApiFout(`De server gaf een onverwacht antwoord (HTTP ${res.status})`, 'ONLEESBAAR', res.status, verzoek)
    throw new ApiFout('De server gaf een onleesbaar antwoord', 'ONLEESBAAR', res.status, verzoek)
  }

  if (!res.ok) {
    // De server stuurt bij een 500 in ontwikkeling de echte reden mee; die
    // hoort in de melding, anders staat er alleen "Interne serverfout" en
    // begint het zoeken opnieuw.
    throw new ApiFout(
      json?.error?.message ?? `HTTP ${res.status}`,
      json?.error?.code ?? `HTTP_${res.status}`,
      res.status,
      verzoek,
      // Een validatiefout zegt in de melding zelf al welk veld (de server
      // vertaalt dat, zie lib/zod-nl.ts); hier alleen de technische reden.
      json?.error?.details?.reden,
    )
  }

  return (json ?? { data: undefined }) as { data: T }
}
