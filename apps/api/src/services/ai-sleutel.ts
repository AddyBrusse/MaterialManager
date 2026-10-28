// De AI-sleutel (2026-10-28): wat zei de API het laatst over ANTHROPIC_API_KEY?
//
// Twee bronnen. Elke echte aanroep (mail-import, titelblok, assistent) loopt via
// `meekijkFetch`, zodat geen aanroeper kan vergeten te melden dat de sleutel
// het niet meer doet. En een eigen controle: bij het starten van de server, en
// daarna hooguit elk kwartier zolang iemand de meldingen of Instellingen open
// heeft. De regels en de woorden staan in `packages/shared/calc/ai-sleutel.ts`.
//
// De sleutel zelf staat in de omgeving en wordt alleen bij het starten gelezen
// (config.ts): een nieuwe sleutel werkt pas na een herstart.
import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import {
  AI_SLEUTEL_UITLEG, sleutelWeergave, standUitAntwoord, vervangtStand,
  type AiSleutelBron, type AiSleutelStand, type AiSleutelStatus,
} from '@stockmanager/shared'
import { config } from '../config'

type Fetch = NonNullable<ClientOptions['fetch']>

interface Waarneming { stand: AiSleutelStand; bron: AiSleutelBron; op: Date; reden: string | null }

let laatste: Waarneming | null = null

/** Zo oud mag de laatste waarneming zijn voor de app zelf weer kijkt. */
const VERVERS_MS = 15 * 60_000

function noteer(stand: AiSleutelStand | null, bron: AiSleutelBron, reden: string | null): void {
  if (!stand) return
  const nieuw = { stand, bron, op: new Date(), reden }
  if (vervangtStand(laatste, nieuw)) laatste = nieuw
}

/** De reden die de API meestuurt (`{ error: { message } }`). */
async function redenVan(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: { message?: unknown } } | null
  return typeof body?.error?.message === 'string' ? body.error.message : `HTTP ${res.status}`
}

/**
 * `fetch` voor de SDK: kijkt mee met elk antwoord van de API. Een gelukt
 * antwoord blijft onaangeroerd (het kan een stream zijn); van een fout leest hij
 * een kopie. Een fout over het verzoek zelf, zoals een te grote mail, verandert
 * niets aan de stand.
 */
export const meekijkFetch: Fetch = async (input, init) => {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (err) {
    noteer('storing', 'aanroep', err instanceof Error ? err.message : String(err))
    throw err
  }
  if (res.ok) noteer('werkt', 'aanroep', null)
  else {
    const reden = await redenVan(res.clone())
    noteer(standUitAntwoord(res.status, reden), 'aanroep', reden)
  }
  return res
}

/** De modellen die de app aanroept: mail-import en assistent. */
function aiModellen(): string[] {
  return [...new Set([config.ai.model, config.assistent.model])]
}

export function sleutelStatus(): AiSleutelStatus {
  const basis = { ...sleutelWeergave(config.ai.apiKey), modellen: aiModellen() }
  if (!config.ai.apiKey) return { stand: 'ontbreekt', op: null, bron: null, reden: null, ...basis }
  if (!laatste) return { stand: 'onbekend', op: null, bron: null, reden: null, ...basis }
  return { stand: laatste.stand, op: laatste.op.toISOString(), bron: laatste.bron, reden: laatste.reden, ...basis }
}

function oordeelUit(err: unknown): { stand: AiSleutelStand | null; reden: string } {
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { message?: unknown } } | undefined
    const reden = typeof body?.error?.message === 'string' ? body.error.message : err.message
    // Geen verbinding of time-out: de SDK geeft dan geen status.
    return { stand: standUitAntwoord(err.status ?? null, reden), reden }
  }
  return { stand: null, reden: err instanceof Error ? err.message : String(err) }
}

/**
 * De controle zelf. Gratis: de lijst met modellen (is de sleutel geldig?) en
 * elk model dat de app gebruikt opvragen (mag dit account het?). `volledig`
 * stuurt daarna één piepklein verzoek aan het model, een fractie van een cent:
 * alleen zo blijkt of er tegoed is. Geeft de reden terug als de controle zelf
 * iets onverwachts kreeg, anders null.
 */
async function voerControleUit(volledig: boolean): Promise<string | null> {
  // Zonder herhalen en met een korte time-out: de testknop mag niet minuten hangen.
  const client = new Anthropic({ apiKey: config.ai.apiKey ?? undefined, maxRetries: 0, timeout: 20_000 })
  let model: string | null = null
  try {
    await client.models.list({ limit: 1 })
    for (model of aiModellen()) await client.models.retrieve(model)
    model = null
    if (volledig) {
      await client.messages.create({
        model: aiModellen()[0], max_tokens: 64,
        messages: [{ role: 'user', content: 'Antwoord alleen met: ok' }],
        output_config: { effort: 'low' },
      })
    }
    noteer('werkt', volledig ? 'aanroep' : 'controle', null)
    return null
  } catch (err) {
    const { stand, reden } = oordeelUit(err)
    noteer(stand, volledig ? 'aanroep' : 'controle', model && stand === 'model' ? `${model}: ${reden}` : reden)
    return stand ? null : reden
  }
}

const bezig = new Map<boolean, Promise<string | null>>()

/** Eén controle tegelijk per soort, ook als vier schermen tegelijk vragen. */
export function controleer(volledig = false): Promise<string | null> {
  let p = bezig.get(volledig)
  if (!p) {
    p = voerControleUit(volledig).finally(() => bezig.delete(volledig))
    bezig.set(volledig, p)
  }
  return p
}

/**
 * Is de laatste waarneming ouder dan een kwartier, dan kijkt de app op de
 * achtergrond opnieuw. Bij een leeg tegoed volledig, anders zie je niet wanneer
 * het weer bijgeladen is; die aanroep kost niets zolang er geen tegoed is.
 */
export function verversAlsNodig(nu = Date.now()): void {
  if (!config.ai.apiKey || bezig.size) return
  if (laatste && nu - laatste.op.getTime() < VERVERS_MS) return
  void controleer(laatste?.stand === 'geen_tegoed').then((fout) => {
    if (fout) console.error('[ai-sleutel] controle mislukt:', fout)
  })
}

/**
 * Bij het starten: één regel in de console, zodat je na een herstart meteen ziet
 * of de nieuwe sleutel werkt. Drie punten in plaats van "…": cmd op Windows
 * toont dat teken anders als rommel.
 */
export async function controleerBijStart(): Promise<void> {
  if (!config.ai.apiKey) {
    console.log('[ai] Geen ANTHROPIC_API_KEY: mail-import en assistent werken zonder AI.')
    return
  }
  const fout = await controleer()
  const s = sleutelStatus()
  const reden = s.reden ?? fout
  console.log(`[ai] Sleutel ${s.sleutel?.replace('…', '...')}: ${AI_SLEUTEL_UITLEG[s.stand].titel}${reden ? ` (${reden})` : ''}`)
}
