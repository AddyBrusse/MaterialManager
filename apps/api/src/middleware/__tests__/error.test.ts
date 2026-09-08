import { describe, it, expect, vi, afterEach } from 'vitest'
import { ZodError, z } from 'zod'
import { errorMiddleware, AppError } from '../error'
import { config } from '../../config'

function nepRes() {
  const res = {
    code: 0,
    body: null as unknown,
    status(c: number) { res.code = c; return res },
    json(b: unknown) { res.body = b; return res },
  }
  return res
}

function stuur(err: unknown) {
  const res = nepRes()
  errorMiddleware(err, {} as never, res as never, (() => {}) as never)
  return res
}

const stil = vi.spyOn(console, 'error').mockImplementation(() => {})
const echteIsDev = config.isDev
afterEach(() => {
  stil.mockClear()
  Object.defineProperty(config, 'isDev', { value: echteIsDev, configurable: true })
})

/** config is een gewoon object; voor deze test even omzetten. */
function alsOntwikkeling(aan: boolean) {
  Object.defineProperty(config, 'isDev', { value: aan, configurable: true })
}

describe('errorMiddleware', () => {
  it('geeft een validatiefout als 400 met de velden erbij', () => {
    let fout: ZodError
    try { z.object({ a: z.string() }).parse({}) } catch (e) { fout = e as ZodError }
    const res = stuur(fout!)
    expect(res.code).toBe(400)
    expect((res.body as any).error.code).toBe('VALIDATION')
  })

  it('geeft een AppError met zijn eigen status en boodschap', () => {
    const res = stuur(new AppError(409, 'IN_USE', 'Hangt aan een project'))
    expect(res.code).toBe(409)
    expect((res.body as any).error.message).toBe('Hangt aan een project')
  })

  it('meldt een onverwachte fout in ontwikkeling mét de reden', () => {
    // Zonder dit staat er alleen "Interne serverfout" in het scherm en een
    // stack in een terminal die niemand openheeft — dan is fouten melden raden.
    alsOntwikkeling(true)
    const res = stuur(new Error('kolom klant_ref bestaat niet'))
    expect(res.code).toBe(500)
    expect((res.body as any).error.details.reden).toBe('kolom klant_ref bestaat niet')
  })

  it('houdt de melding kaal in productie', () => {
    alsOntwikkeling(false)
    const res = stuur(new Error('interne details die niemand aangaan'))
    expect(res.code).toBe(500)
    expect((res.body as any).error.details).toBeUndefined()
    expect((res.body as any).error.message).toBe('Interne serverfout')
  })
})
