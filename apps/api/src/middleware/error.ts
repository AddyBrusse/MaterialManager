import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { config } from '../config'

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION', message: 'Validatiefout', details: err.flatten() },
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
    const code = (err as { type?: string }).type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST'
    res.status(status).json({
      error: { code, message: (err as Error).message || 'Ongeldig verzoek' },
    })
    return
  }

  // Draait de code voor op de database, dan is dat geen "interne fout" maar een
  // vergeten migratie — en dat is precies wat de beheerder moet weten. Deze
  // melding noemt geen data en geen schema-interne details, dus hij mag ook op
  // de NAS mee: hem inslikken kostte een ronde zoeken toen het aanmaken van een
  // terminal-account op 2026-09-14 alleen "Aanmaken mislukt" opleverde, terwijl
  // Postgres gewoon zei: invalid input value for enum "Role": "terminal".
  const pg = postgresFout(err)
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

  console.error(err)
  // In ontwikkeling de echte reden meesturen. "Interne serverfout" in het scherm
  // en een stack in een terminal die niemand openheeft staan, betekent dat een
  // fout melden neerkomt op raden — dat heeft ons een ronde gekost. Op de NAS
  // (production) blijft de melding kaal: daar hoort geen interne informatie in
  // een antwoord dat over het netwerk gaat.
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Interne serverfout',
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
const MIGRATIE_CODES = new Set(['22P02', '42P01', '42703'])

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
