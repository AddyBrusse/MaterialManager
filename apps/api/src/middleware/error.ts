import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

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
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
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

  console.error(err)
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Interne serverfout' } })
}

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}
