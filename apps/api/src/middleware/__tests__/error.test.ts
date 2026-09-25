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

describe('errorMiddleware: database loopt achter op de code', () => {
  /**
   * De letterlijke melding die Prisma gaf toen er een terminal-account werd
   * aangemaakt op een database waar de migratie niet op gedraaid was. Niet
   * nagebouwd maar overgenomen: de code zit alleen in de tekst van de fout, dus
   * een verzonnen vorm zou hier slagen en in het echt niet.
   */
  const ECHTE_PRISMA_FOUT = `
Invalid \`prisma.user.create()\` invocation:


Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "22P02", message: "invalid input value for enum \\"Role\\": \\"terminal\\"", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })`

  it('noemt de ontbrekende migratie in plaats van "Interne serverfout"', () => {
    alsOntwikkeling(false)
    const res = stuur(new Error(ECHTE_PRISMA_FOUT))
    expect(res.code).toBe(500)
    const body = res.body as any
    expect(body.error.code).toBe('MIGRATIE_ONTBREEKT')
    expect(body.error.message).toContain('npm run db:deploy')
    // De reden hoort erbij, ook op de NAS: het noemt geen data.
    expect(body.error.details.reden).toContain('invalid input value for enum')
  })

  it('herkent een ontbrekende tabel en kolom net zo', () => {
    alsOntwikkeling(false)
    for (const code of ['42P01', '42703']) {
      const res = stuur(new Error(`PostgresError { code: "${code}", message: "relation does not exist" }`))
      expect((res.body as any).error.code, code).toBe('MIGRATIE_ONTBREEKT')
    }
  })

  /**
   * Hoe Prisma een ontbrekende kolom meldt: niet als Postgres-code in de
   * tekst, maar als eigen code op het foutobject. Tekst en velden overgenomen
   * uit de echte fout van 2026-09-25 (offertes.externe_ref, migratie niet
   * gedraaid) — daar viel hij door naar "Interne serverfout".
   */
  it('herkent de eigen code van Prisma voor een ontbrekende kolom', () => {
    alsOntwikkeling(false)
    const fout = Object.assign(
      new Error(
        'Invalid `prisma.project.findUniqueOrThrow()` invocation:\n\n\n'
        + 'The column `offertes.externe_ref` does not exist in the current database.',
      ),
      { code: 'P2022', clientVersion: '5.22.0', meta: { modelName: 'Project', column: 'offertes.externe_ref' } },
    )
    const res = stuur(fout)
    const body = res.body as any
    expect(body.error.code).toBe('MIGRATIE_ONTBREEKT')
    expect(body.error.message).toContain('npm run db:deploy')
    expect(body.error.details.reden).toContain('offertes.externe_ref')
  })

  it('herkent een ontbrekende tabel via Prisma net zo', () => {
    alsOntwikkeling(false)
    const fout = Object.assign(new Error('The table `public.x` does not exist'), {
      code: 'P2021', meta: { table: 'public.x' },
    })
    expect((stuur(fout).body as any).error.details.reden).toContain('public.x')
  })

  it('laat een gewone fout gewoon een interne fout blijven', () => {
    alsOntwikkeling(false)
    const res = stuur(new Error('kapot'))
    expect((res.body as any).error.code).toBe('INTERNAL')
  })

  it('verwart een foutcode met letters niet met een gewone fout', () => {
    // SQLSTATE is alfanumeriek. Een patroon van vijf cijfers matchte 22P02 niet
    // en liet elke migratiefout alsnog doorvallen — dat is hier de valstrik.
    alsOntwikkeling(false)
    const res = stuur(new Error('PostgresError { code: "22P02", message: "x" }'))
    expect((res.body as any).error.code).toBe('MIGRATIE_ONTBREEKT')
  })
})
