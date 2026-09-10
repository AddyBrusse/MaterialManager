import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import type { CandidateLine, MailAttachment } from '@stockmanager/shared'
import { config } from '../config'
import { classifyAttachment } from './attachment-kind'
import type { AttachmentBuffers } from './ai-extract'
import { getClient } from './ai-extract'
import { looksLikePdf } from './pdf-text'

/**
 * Het titelblok van een tekening laten lezen — features/62 §3.2 en §3.1b trap 3.
 *
 * Waarom dit bestaat: het koppelen van tekeningen aan orderregels gaat op de
 * bestandsnaam, en die is van de klant. Post Metaalbewerking bestelt volgens
 * `MD13504758` en stuurt een bestand `md10504758 B uitbesteding.pdf` mee — één
 * cijfer anders. Uit de bestandsnaam alleen is niet te zeggen of dat dezelfde
 * tekening is met een typefout, of een andere tekening. Op de tekening zelf staat
 * het echte nummer.
 *
 * Die tekeningen hebben geen tekstlaag, dus `pdfText` levert niets op. Het model
 * kan de pagina wél bekijken.
 *
 * Dit is bewust een ESCALATIE en niet de gewone gang van zaken: het kost een
 * tweede aanroep en de pdf's zijn groot. Het gebeurt alleen als er een regel
 * zónder bestand is én een tekening die nergens bij hoort — dan pas is er iets te
 * winnen. Bij de meeste mail matcht de bestandsnaam gewoon en gebeurt er niets.
 *
 * Wat er met de uitkomst gebeurt is streng: een titelbloknummer koppelt alleen
 * bij een EXACTE overeenkomst (op letters en cijfers). Bijna-gelijk is hier geen
 * bewijs maar juist het gevaar — dat is de hele reden dat we gaan kijken.
 */

/** Meer dan dit meesturen kost veel en de kans dat het de vijfde is, is klein. */
const MAX_TEKENINGEN = 4
/** Ruim voor een A3-tekening. */
const MAX_BYTES = 8 * 1024 * 1024

const TitelblokSchema = z.object({
  tekeningen: z
    .array(
      z.object({
        bestand: z.string().describe('De exacte bestandsnaam zoals die in de opsomming stond.'),
        tekeningnummer: z
          .string()
          .nullable()
          .describe(
            'Het tekeningnummer uit het titelblok, teken voor teken overgenomen. Dat is het veld ' +
              'dat "Tekeningnr", "Drawing No", "Zeichnungsnummer" of iets dergelijks heet — NIET de ' +
              'projectnaam, de klantnaam, het materiaal of een maat. Kun je het niet lezen, geef dan ' +
              'null; verzin nooit een nummer en vul nooit de bestandsnaam in.',
          ),
        revisie: z.string().nullable().describe('De revisie uit het titelblok, of null.'),
      }),
    )
    .describe('Eén regel per meegestuurde tekening, in dezelfde volgorde.'),
})

const SYSTEM = `Je krijgt technische tekeningen van onderdelen voor een verspanend bedrijf.

Lees van elke tekening ALLEEN het titelblok — het kader, meestal rechtsonder, met de gegevens
van de tekening. Daar staat het tekeningnummer.

- Neem het nummer teken voor teken over. Eén cijfer verschil is een ander onderdeel.
- Het tekeningnummer is niet de bestandsnaam. Die kan afwijken; daarom kijken we juist.
- Twijfel je of lees je het niet goed genoeg om elk teken te durven noemen, geef dan null.
  Niets teruggeven is goed; een half gelezen nummer is schadelijk.`

/** Kandidaten om te laten lezen: pdf-tekeningen die nergens aan hangen. */
export function tekeningenZonderRegel(
  lines: CandidateLine[],
  attachments: MailAttachment[],
  buffers: AttachmentBuffers,
  document?: string | null,
): MailAttachment[] {
  const gekoppeld = new Set(lines.flatMap((l) => l.bestanden))
  return attachments
    .filter(
      (a) =>
        !a.isEmbeddedMessage &&
        a.filename !== document &&
        !gekoppeld.has(a.filename) &&
        classifyAttachment(a.filename) === 'tekening' &&
        a.sizeBytes <= MAX_BYTES &&
        looksLikePdf(buffers.get(a.filename) ?? Buffer.alloc(0)),
    )
    .slice(0, MAX_TEKENINGEN)
}

/** Is er iets te winnen? Alleen dan is de tweede aanroep het geld waard. */
export function loontEscalatie(lines: CandidateLine[], kandidaten: MailAttachment[]): boolean {
  if (!kandidaten.length) return false
  return lines.some((l) => l.bestanden.length === 0)
}

export function titelblokEnabled(): boolean {
  return Boolean(config.ai.apiKey) && config.ai.titelblok
}

/**
 * De titelblokken lezen. Geeft bestandsnaam → nummer terug; een tekening
 * waarvan het nummer niet te lezen was komt er niet in voor.
 *
 * Faalt de aanroep, dan is dat geen mislukte import: we hadden zonder deze stap
 * ook niets gehad. De aanroeper krijgt een lege map.
 */
export async function leesTitelblokken(
  tekeningen: MailAttachment[],
  buffers: AttachmentBuffers,
): Promise<Map<string, string>> {
  if (!tekeningen.length) return new Map()

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: [
        'Lees het titelblok van deze tekeningen:',
        ...tekeningen.map((t) => `- ${t.filename}`),
      ].join('\n'),
    },
  ]
  for (const t of tekeningen) {
    const buf = buffers.get(t.filename)
    if (!buf) continue
    content.push({ type: 'text', text: `--- TEKENING: ${t.filename} ---` })
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
    })
  }

  try {
    const response = await getClient().messages.parse({
      model: config.ai.model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort: config.ai.effort, format: zodOutputFormat(TitelblokSchema) },
    })
    const uit = new Map<string, string>()
    for (const t of response.parsed_output?.tekeningen ?? []) {
      const nummer = t.tekeningnummer?.trim()
      // Alleen namen die we ook echt hebben meegestuurd: het model mag hier geen
      // bestand verzinnen dat niet in de mail zit.
      if (nummer && tekeningen.some((k) => k.filename === t.bestand)) uit.set(t.bestand, nummer)
    }
    return uit
  } catch {
    return new Map()
  }
}
