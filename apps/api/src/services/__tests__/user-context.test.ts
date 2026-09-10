import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextFunction, Request, Response } from 'express'

/**
 * De middleware die vóór álle /api-routes zit — features/23-users-roles.md.
 *
 * De eerste test is de belangrijkste. Express 4 vangt een afgewezen promise uit
 * async middleware niet op, en Node beëindigt daarop het proces. Op 10-09-2026
 * viel Postgres weg en nam het eerste binnenkomende verzoek de hele API mee;
 * daarna gaf alles ECONNREFUSED, wat eruitziet als "de app is stuk" terwijl
 * alleen de database weg was.
 *
 * `findUnique` is met opzet een gewone functie en geen `vi.fn()`. Een spy hangt
 * zijn eigen `.then()` aan de teruggegeven promise om het resultaat vast te
 * leggen, en die afgeleide promise vangt niemand op — dat meldt zich als een
 * mislukte test terwijl de middleware precies doet wat hij moet doen.
 */

let antwoord: () => unknown = () => null
const aanroepen: unknown[] = []

vi.mock('../../db/client', () => ({
  prisma: { user: { findUnique: (arg: unknown) => { aanroepen.push(arg); return antwoord() } } },
}))

async function roep(headers: Record<string, string>) {
  const { userContext } = await import('../../middleware/user-context')
  const req = { headers } as unknown as Request
  const gekregen: unknown[] = []
  const next = ((e?: unknown) => { gekregen.push(e) }) as unknown as NextFunction
  await (userContext(req, {} as Response, next) as unknown as Promise<void>)
  return { req, gekregen }
}

describe('userContext', () => {
  beforeEach(() => {
    antwoord = () => null
    aanroepen.length = 0
  })

  it('geeft een databasefout door aan next in plaats van het proces te laten vallen', async () => {
    const stuk = new Error("Can't reach database server at `localhost:5432`")
    antwoord = () => Promise.reject(stuk)

    const { gekregen } = await roep({ 'x-user-id': 'u-addy' })

    expect(gekregen).toEqual([stuk])
  })

  it('weigert een verzoek zonder x-user-id, zonder de database te raadplegen', async () => {
    const { gekregen } = await roep({})
    expect(gekregen[0]).toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(aanroepen).toEqual([])
  })

  it('weigert een onbekende gebruiker', async () => {
    antwoord = () => Promise.resolve(null)
    const { gekregen } = await roep({ 'x-user-id': 'bestaat-niet' })
    expect(gekregen[0]).toMatchObject({ status: 401, message: 'Gebruiker niet gevonden' })
    expect(aanroepen).toEqual([{ where: { id: 'bestaat-niet' } }])
  })

  it('zet de gebruiker op het verzoek en laat het verzoek door', async () => {
    antwoord = () => Promise.resolve({ id: 'u-addy', name: 'Addy', role: 'admin' })
    const { req, gekregen } = await roep({ 'x-user-id': 'u-addy' })
    expect(gekregen).toEqual([undefined])
    expect(req.user).toEqual({ id: 'u-addy', name: 'Addy', role: 'admin' })
  })
})
