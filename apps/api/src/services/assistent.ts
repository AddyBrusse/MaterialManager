// De AI-assistent (2026-10-09). Leest en stelt voor; wijzigt nooit iets.
//
// Het taalmodel krijgt alleen leestools (assistent-data.ts) en één tool om een
// knop voor te stellen. Een knop is een route in de app — de handeling zelf doet
// een mens op dat scherm, met de gewone voorwaarden en meldingen. Zo kan een
// verkeerd begrepen vraag nooit iets in de database veranderen.
import type Anthropic from '@anthropic-ai/sdk'
import {
  geldigeActie, sorteerMeldingen, type AssistentActie, type ChatBericht,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { config } from '../config'
import { getClient } from './ai-extract'
import { openActies, projectDetail, zoekProjecten, zoekVoorraad, type OpenActies } from './assistent-data'

type Msg = Anthropic.Beta.Messages.BetaMessageParam
type Tool = Anthropic.Beta.Messages.BetaTool

const MAX_RONDES = 8

export function assistentAan(): boolean {
  return Boolean(config.ai.apiKey)
}

const ROUTES = `
Routes in de app (gebruik deze voor knoppen):
/projecten · /projecten/<PRJ-nummer> · /bestellingen · /bestellingen?tab=aanvragen ·
/bestellingen?regel=<bestelregel-id> · /planning-queue (planning per opdracht) · /todos ·
/voorraad · /reserveringen · /binnenboeken · /tijdregistratie · /artikelen/<id>`

const SYSTEM = `Je bent de assistent van ShopCommand, het programma van een kleine CNC-draaierij en -freesbedrijf (ongeveer 4 mensen op kantoor en in de hal).
Je helpt het team zien wat er moet gebeuren: tekorten, materiaal dat niet vastligt, bestellingen die te laat komen, offertes zonder reactie, todo's.

Regels:
- Schrijf Nederlands, kort en zakelijk, in gewone woorden. Geen opsommingen van alles: noem wat telt, het belangrijkste eerst.
- Je kunt alleen lezen. Je verandert nooit iets en zegt ook niet dat je iets gedaan hebt. Wil je dat iemand iets doet, stel dan een knop voor met stel_actie_voor; die opent het scherm waar diegene het zelf doet.
- Gebruik de tools om gegevens op te halen. Verzin geen nummers, namen, datums of aantallen: staat het niet in wat de tools teruggeven, zeg dan dat je het niet weet.
- Iedereen ziet alles; "opgepakt door" zegt alleen wie iets oppakt. Spreek het team aan, niet één persoon.
- Datums schrijf je als dd-mm.
${ROUTES}`

const TOOLS: Tool[] = [
  {
    name: 'open_acties',
    description: 'Alles wat nu open staat: meldingen (tekorten, materiaal te laat, prijsaanvragen zonder antwoord, materiaal binnen), open todo\'s, orders die nog niet in productie zijn gegeven, offertes die nagebeld moeten worden.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'zoek_projecten',
    description: 'Zoek projecten op nummer (PRJ-…), naam, klantreferentie of klantnaam. Leeg = de lopende projecten.',
    input_schema: { type: 'object', properties: { zoek: { type: 'string' } }, required: ['zoek'] },
  },
  {
    name: 'project_detail',
    description: 'Eén project: offertes, productieorders met stappen en planning, materiaal verwacht, open bestelregels.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Projectnummer, bijv. PRJ-2026-001' } }, required: ['id'] },
  },
  {
    name: 'zoek_voorraad',
    description: 'Voorraadstaven zoeken op code, kwaliteit, profiel of maat (bijv. "C45 30"). Geeft fysiek, gereserveerd en vrij in mm.',
    input_schema: { type: 'object', properties: { zoek: { type: 'string' } }, required: ['zoek'] },
  },
  {
    name: 'stel_actie_voor',
    description: 'Zet een knop onder je antwoord die naar een scherm in de app gaat. Alleen routes die met / beginnen. Gebruik hem voor wat iemand nu het beste kan oppakken; hooguit een paar knoppen.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Korte knoptekst, bijv. "PRJ-2026-014 bestellen"' },
        link: { type: 'string', description: 'Route in de app, bijv. /bestellingen?tab=aanvragen' },
      },
      required: ['label', 'link'],
    },
  },
]

async function voerUit(naam: string, input: Record<string, unknown>, acties: AssistentActie[]): Promise<unknown> {
  const tekst = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (naam) {
    case 'open_acties': return openActies(prisma)
    case 'zoek_projecten': return zoekProjecten(prisma, tekst('zoek'))
    case 'project_detail': return (await projectDetail(prisma, tekst('id'))) ?? { fout: `Project ${tekst('id')} bestaat niet` }
    case 'zoek_voorraad': return zoekVoorraad(prisma, tekst('zoek'))
    case 'stel_actie_voor': {
      const a = geldigeActie(input)
      if (!a) return { fout: 'Ongeldige knop: de link moet een route in de app zijn die met / begint.' }
      if (!acties.some((x) => x.link === a.link)) acties.push(a)
      return { ok: true }
    }
    default: return { fout: `Onbekende tool ${naam}` }
  }
}

export class AssistentWeigering extends Error {}

export interface AssistentAntwoord {
  tekst: string
  acties: AssistentActie[]
  model: string
}

/** De gesprekslus: tools uitvoeren tot het model klaar is. */
async function praat(messages: Msg[]): Promise<AssistentAntwoord> {
  const acties: AssistentActie[] = []
  let model = config.assistent.model
  for (let ronde = 0; ronde < MAX_RONDES; ronde++) {
    const res = await getClient().beta.messages.create({
      model: config.assistent.model,
      max_tokens: 8000,
      system: SYSTEM,
      tools: TOOLS,
      messages,
      output_config: { effort: config.assistent.effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    model = res.model
    if (res.stop_reason === 'refusal') throw new AssistentWeigering('Het model wilde hier geen antwoord op geven.')
    const tekst = res.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text).join('\n').trim()
    if (res.stop_reason !== 'tool_use') {
      const afgekapt = res.stop_reason === 'max_tokens' ? '\n\n(Het antwoord is afgekapt.)' : ''
      return { tekst: (tekst || 'Ik heb hier geen antwoord op.') + afgekapt, acties, model }
    }
    messages.push({ role: 'assistant', content: res.content })
    const resultaten: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
    for (const b of res.content) {
      if (b.type !== 'tool_use') continue
      try {
        const uit = await voerUit(b.name, (b.input ?? {}) as Record<string, unknown>, acties)
        resultaten.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(uit) })
      } catch (err) {
        resultaten.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: err instanceof Error ? err.message : String(err) })
      }
    }
    messages.push({ role: 'user', content: resultaten })
  }
  return { tekst: 'Ik kwam er niet uit binnen het aantal stappen dat ik mag zetten. Stel de vraag wat preciezer.', acties, model }
}

/** Een vraag uit het chatpaneel, met het gesprek tot nu toe. */
export function chat(berichten: ChatBericht[], wie: string): Promise<AssistentAntwoord> {
  const messages: Msg[] = berichten.slice(-20).map((b) => ({
    role: b.rol === 'gebruiker' ? 'user' as const : 'assistant' as const,
    content: b.tekst,
  }))
  while (messages.length && messages[0].role !== 'user') messages.shift()
  if (messages.length) {
    const eerste = messages[0]
    messages[0] = { role: 'user', content: `(Vraag van ${wie}, ${new Date().toLocaleString('nl-NL')})\n\n${eerste.content as string}` }
  }
  return praat(messages)
}

/** Het bericht op een vast tijdstip: wat er vandaag opgepakt moet worden. */
export async function maakBericht(moment: Date): Promise<AssistentAntwoord> {
  const data = await openActies(prisma)
  const uur = moment.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return praat([{
    role: 'user',
    content: `Het is ${data.vandaag}, ${uur}. Schrijf het bericht voor het team: wat moet er nu opgepakt worden?
Begin direct met de inhoud, zonder begroeting (die zet het scherm er zelf voor). Hooguit zes korte zinnen of punten, het dringendste eerst.
Is er niets dringends, zeg dat dan in één zin. Zet bij de belangrijkste punten een knop met stel_actie_voor (hooguit vier).

De open punten van dit moment:
${JSON.stringify(data)}`,
  }])
}

/** Zonder taalmodel (geen sleutel, of de aanroep faalde): dezelfde punten, recht uit de gegevens. */
export function berichtZonderModel(d: OpenActies): { tekst: string; acties: AssistentActie[] } {
  const m = sorteerMeldingen(d.meldingen).filter((x) => x.ernst !== 'groen')
  const regels: string[] = []
  for (const x of m.slice(0, 4)) regels.push(`• ${x.titel}: ${x.tekst}`)
  if (m.length > 4) regels.push(`• En nog ${m.length - 4} andere meldingen.`)
  if (d.inVoorbereiding.length) regels.push(`• ${d.inVoorbereiding.length} ${d.inVoorbereiding.length === 1 ? 'order wacht' : 'orders wachten'} nog op in productie geven.`)
  if (d.offertesNabellen.length) regels.push(`• ${d.offertesNabellen.length} ${d.offertesNabellen.length === 1 ? 'offerte' : 'offertes'} zonder reactie — nabellen.`)
  const open = d.todos.filter((t) => !t.opgepaktDoor).length
  if (open) regels.push(`• ${open} ${open === 1 ? 'todo' : "todo's"} nog door niemand opgepakt.`)
  const acties: AssistentActie[] = []
  for (const x of m) if (acties.length < 4 && !acties.some((a) => a.link === x.link)) acties.push({ label: x.titel, link: x.link })
  if (d.offertesNabellen.length && acties.length < 4) acties.push({ label: 'Offertes nabellen', link: '/projecten' })
  return { tekst: regels.length ? regels.join('\n') : 'Niets dringends op dit moment.', acties }
}
