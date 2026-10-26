import { describe, it, expect } from 'vitest'
import { waaromNietMutatie } from '@stockmanager/shared'
import { eisRuimteVoorMutatie } from '../voorraad'
import { AppError } from '../../middleware/error'

const bon = (calculatieNr: string, sawLength: number) => ({ calculatieNr, sawLength })

describe('mutatie op een staaf met een zaagbon', () => {
  it('weigert alleen als de staaf lager wordt dan wat er vastligt', () => {
    const open = [bon('PRJ-1', 300)]
    expect(waaromNietMutatie(300, 0, open)).not.toBeNull()
    expect(waaromNietMutatie(3000, 400, open)).toBeNull()   // past nog
    expect(waaromNietMutatie(3000, 300, open)).toBeNull()   // precies genoeg
    expect(waaromNietMutatie(0, 100, open)).toBeNull()      // toevoegen, ook al blijft het krap
    expect(waaromNietMutatie(300, 0, [])).toBeNull()        // niets vast
  })

  it('zegt welke zaagbon en wat er eerst moet', () => {
    const reden = waaromNietMutatie(300, 0, [bon('PRJ-2026-004', 300)])
    expect(reden).toBe('Op deze staaf ligt 300 mm vast voor zaagbon PRJ-2026-004, en na de mutatie is er 0 mm. '
      + 'Boek de zaagbon eerst af in de Zaagflow, of annuleer de reservering bij Reserveringen.')
  })

  it('meer bonnen: opgeteld en allemaal genoemd, elk nummer één keer', () => {
    const reden = waaromNietMutatie(3000, 800, [bon('PRJ-a', 500), bon('PRJ-b', 400), bon('PRJ-b', 100)])
    expect(reden).toMatch(/1\.000 mm vast voor zaagbonnen PRJ-a, PRJ-b/)
  })
})

function nepDb(open: { id: string; calculatieNr: string; sawLength: number }[]) {
  const gevraagd: Record<string, unknown>[] = []
  const db = { zaagReservering: { findMany: async (arg: Record<string, unknown>) => { gevraagd.push(arg); return open } } }
  return { db: db as never, gevraagd }
}

describe('eisRuimteVoorMutatie', () => {
  it('onder de reservering: 409 VOORWAARDE met de zin en de bonnen', async () => {
    const { db, gevraagd } = nepDb([{ id: 'z1', calculatieNr: 'PRJ-1', sawLength: 300 }])
    const fout = await eisRuimteVoorMutatie(db, 'staaf', 300, 0).catch((e) => e)
    expect(fout).toBeInstanceOf(AppError)
    expect(fout.status).toBe(409)
    expect(fout.code).toBe('VOORWAARDE')
    expect(fout.message).toMatch(/zaagbon PRJ-1/)
    expect(fout.details).toEqual({ zaagbonnen: [{ id: 'z1', calculatieNr: 'PRJ-1', sawLength: 300 }] })
    // Alleen wat nog vastligt, op deze staaf.
    expect(gevraagd[0]).toMatchObject({ where: { barId: 'staaf', status: { in: ['open', 'in_progress'] } } })
  })

  it('toevoegen of een kleine mutatie gaat gewoon door', async () => {
    const { db } = nepDb([{ id: 'z1', calculatieNr: 'PRJ-1', sawLength: 300 }])
    await expect(eisRuimteVoorMutatie(db, 'staaf', 3000, 1000)).resolves.toBeUndefined()
    await expect(eisRuimteVoorMutatie(db, 'staaf', 0, 100)).resolves.toBeUndefined()
  })
})
