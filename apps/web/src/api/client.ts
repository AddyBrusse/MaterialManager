import { useUserStore } from '../stores/user'

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
  const timer = setTimeout(() => controller.abort(), 120_000)

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

/**
 * Bij een validatiefout zegt de server alleen "Validatiefout"; wélk veld en
 * waarom staat in `details.fieldErrors` (Zod's flatten()). Zonder dit zei de
 * melding niet wat er mis was.
 */
function veldFouten(details: unknown): string | undefined {
  const velden = (details as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors
  if (!velden) return undefined
  const delen = Object.entries(velden)
    .filter(([, m]) => m?.length)
    .map(([veld, m]) => `${veld}: ${m.join(', ')}`)
  return delen.length ? delen.join('; ') : undefined
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T }> {
  const user = useUserStore.getState().user
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(user ? { 'x-user-id': user.id } : {}),
    ...(options.headers ?? {}),
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  const verzoek = `${(options.method ?? 'GET').toUpperCase()} ${path}`

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...options, headers, signal: controller.signal })
  } catch (e) {
    // Het verzoek bereikte de server niet, of kwam niet op tijd terug. Twee
    // verschillende situaties met een verschillende oplossing, dus ook twee
    // verschillende meldingen.
    if (controller.signal.aborted) {
      throw new ApiFout('De server antwoordde niet binnen 3 seconden', 'TIMEOUT', 0, verzoek)
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
      json?.error?.details?.reden ?? veldFouten(json?.error?.details),
    )
  }

  return (json ?? { data: undefined }) as { data: T }
}
