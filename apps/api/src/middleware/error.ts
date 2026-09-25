import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { config } from '../config'
import { zodMeldingNl, zodVeldenNl } from '../lib/zod-nl'

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      // De melding zelf is leesbaar (welk veld, wat er mis is); `velden` en de
      // Zod-vorm staan erbij voor wie een formulier per veld wil markeren.
      error: {
        code: 'VALIDATION',
        message: zodMeldingNl(err),
        details: { ...err.flatten(), velden: zodVeldenNl(err) },
      },
    })
    return
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    })
    return
  }

  // body-parser and Express throw http-errors objects carrying a 4xx status
  // (malformed JSON → 400 entity.parse.failed, oversized body → 413, a bad
  // percent-escape in the URL → 400). Without this they fall through to the
  // catch-all and a plain client mistake is reported — and logged — as a
  // server fault.
  const status = (err as { status?: number; statusCode?: number } | null)?.status
    ?? (err as { statusCode?: number } | null)?.statusCode
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const type = (err as { type?: string }).type
    const code = type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST'
    // body-parser meldt in het Engels ("Unexpected token } in JSON…"); die
    // tekst gaat mee als reden, de melding zelf zegt het in gewone taal.
    const message = type === 'entity.too.large'
      ? 'Het verzoek is te groot voor de server. Er is niets opgeslagen.'
      : type === 'entity.parse.failed'
        ? 'De server kon de meegestuurde gegevens niet lezen. Er is niets opgeslagen.'
        : (err as Error).message || 'Ongeldig verzoek'
    res.status(status).json({
      error: { code, message, details: { reden: (err as Error).message } },
    })
    return
  }

  // Draait de code voor op de database, dan is dat geen "interne fout" maar een
  // vergeten migratie — en dat is precies wat de beheerder moet weten. Deze
  // melding noemt geen data en geen schema-interne details, dus hij mag ook op
  // de NAS mee: hem inslikken kostte een ronde zoeken toen het aanmaken van een
  // terminal-account op 2026-09-14 alleen "Aanmaken mislukt" opleverde, terwijl
  // Postgres gewoon zei: invalid input value for enum "Role": "terminal".
  const pg = postgresFout(err) ?? prismaSchemaFout(err)
  if (pg && MIGRATIE_CODES.has(pg.code)) {
    console.error(err)
    res.status(500).json({
      error: {
        code: 'MIGRATIE_ONTBREEKT',
        // Het projecteigen script, niet het kale prisma-commando: dat laadt
        // .env.development niet en faalt op een werk-pc met "Environment
        // variable not found: DATABASE_URL" — een melding die naar de
        // verkeerde oorzaak wijst. (Waargenomen 2026-09-14.)
        message: 'De database loopt achter op de applicatie. Draai de migraties '
          + 'met: npm run db:deploy',
        details: { reden: pg.message },
      },
    })
    return
  }

  // De code kent een veld dat de gegenereerde Prisma-client niet kent: het
  // schema is bijgewerkt, maar `prisma generate` is niet gedraaid. De database
  // kan dan al helemaal kloppen — `migrate deploy` genereert de client niet.
  // Zo gebeurd op 2026-09-25: "Unknown argument `externeRef`" bij accepteren,
  // en het scherm zei "Interne serverfout" met een Prisma-dump erachter.
  const onbekend = verouderdeClient(err)
  if (onbekend) {
    console.error(err)
    res.status(500).json({
      error: {
        code: 'CLIENT_VEROUDERD',
        message: 'De server is niet opnieuw opgebouwd na een update: hij kent het veld '
          + `"${onbekend}" nog niet. Er is niets opgeslagen. Stop de server (npm run dev), `
          + 'draai npm run db:deploy en start hem opnieuw.',
        details: { reden: err instanceof Error ? err.message : String(err) },
      },
    })
    return
  }

  console.error(err)
  // In ontwikkeling de echte reden meesturen. "Interne serverfout" in het scherm
  // en een stack in een terminal die niemand openheeft staan, betekent dat een
  // fout melden neerkomt op raden — dat heeft ons een ronde gekost. Op de NAS
  // (production) blijft de melding kaal: daar hoort geen interne informatie in
  // een antwoord dat over het netwerk gaat.
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Onverwachte fout op de server. Geef de technische details door aan wie de app beheert.',
      ...(config.isDev && { details: { reden: err instanceof Error ? err.message : String(err) } }),
    },
  })
}

/**
 * Postgres-fouten die betekenen: de code kent iets dat de database niet heeft.
 *   22P02 — ongeldige waarde voor een enum (een nieuwe rol, status, soort)
 *   42P01 — tabel bestaat niet
 *   42703 — kolom bestaat niet
 * Alle drie wijzen op een migratie die nog niet gedraaid is.
 */
const MIGRATIE_CODES = new Set(['22P02', '42P01', '42703', 'P2021', 'P2022'])

/**
 * Dezelfde situatie, maar zoals Prisma hem zelf meldt: niet als Postgres-code
 * in de tekst, maar als eigen foutcode op het object.
 *   P2021 — tabel bestaat niet
 *   P2022 — kolom bestaat niet
 *
 * Zonder dit viel een ontbrekende kolom door naar "Interne serverfout". Zo
 * gebeurd op 2026-09-25: na het bijtrekken van de branch met
 * `offertes.externe_ref` faalde elke schrijfactie op een project — kopiëren,
 * versturen, een regel toevoegen — en het scherm zei alleen "mislukt". Prisma
 * wist precies welke kolom er ontbrak; de melding zei het niet.
 */
function prismaSchemaFout(err: unknown): { code: string; message: string } | null {
  const e = err as { code?: unknown; meta?: { column?: unknown; table?: unknown }; message?: unknown } | null
  if (!e || (e.code !== 'P2021' && e.code !== 'P2022')) return null
  const wat = e.code === 'P2022'
    ? `kolom ${String(e.meta?.column ?? '?')} bestaat niet in de database`
    : `tabel ${String(e.meta?.table ?? '?')} bestaat niet in de database`
  return { code: e.code, message: wat }
}

/**
 * Een PrismaClientValidationError die een veld niet kent. Op naam herkend in
 * plaats van met `instanceof`, zodat de test geen Prisma-client nodig heeft.
 * Alleen "Unknown argument/field": een ontbrekend verplicht veld is meestal
 * een fout in onze code, geen verouderde client, en hoort bij INTERNAL.
 */
function verouderdeClient(err: unknown): string | null {
  if (!(err instanceof Error) || err.name !== 'PrismaClientValidationError') return null
  return err.message.match(/Unknown (?:argument|field) `([^`]+)`/)?.[1] ?? null
}

/**
 * Prisma pakt de Postgres-fout in een ConnectorError; de code staat alleen in
 * de tekst van de melding. Vandaar dat we hem daaruit vissen in plaats van uit
 * een veld dat er niet is.
 */
function postgresFout(err: unknown): { code: string; message: string } | null {
  const tekst = err instanceof Error ? err.message : ''
  // SQLSTATE is vijf tekens alfanumeriek, niet vijf cijfers: 22P02 heeft een
  // letter in het midden. Met \d{5} matchte hij nooit en viel elke migratiefout
  // alsnog door naar "Interne serverfout".
  const code = tekst.match(/code: "([0-9A-Z]{5})"/)?.[1]
  if (!code) return null
  const message = tekst.match(/message: "((?:[^"\\]|\\.)*)"/)?.[1] ?? tekst
  return { code, message: message.replace(/\\"/g, '"') }
}

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Optioneel, volgens de afgesproken foutvorm `{ code, message, details? }`.
     *  Bedoeld voor wat het scherm nodig heeft om de melding bruikbaar te maken
     *  — bij een te krappe staaf bijvoorbeeld hoeveel er nog vrij is. */
    public details?: unknown,
  ) {
    super(message)
  }
}
