import { describe, it, expect } from 'vitest'
import type { Project } from '@stockmanager/shared'
import { boekAfBijGereed, bonnenVanOrderWaar } from '../zaagbon'

/** Een geheugen-db met precies wat afboeken aanraakt. */
function nepDb(staven: Record<string, number>, bonnen: Record<string, unknown>[]) {
  const mutaties: Record<string, unknown>[] = []
  const gezocht: Record<string, unknown>[] = []
  const db = {
    zaagReservering: {
      findMany: async (arg: { where: Record<string, unknown> }) => {
        gezocht.push(arg.where)
        return bonnen.filter((b) => b.status === 'open')
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const b = bonnen.find((x) => x.id === where.id)!
        Object.assign(b, data)
        return b
      },
    },
    rawMaterial: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id in staven ? { id: where.id, currentStock: staven[where.id] } : null,
      update: async ({ where, data }: { where: { id: string }; data: { currentStock: number } }) => {
        staven[where.id] = data.currentStock
      },
    },
    stockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => { mutaties.push(data); return { id: 'm', ...data } },
    },
  }
  return { db: db as never, mutaties, gezocht, staven, bonnen }
}

function bon(id: string, barId: string, fysiekeLengte: number) {
  return { id, barId, fysiekeLengte, calculatieNr: 'ZB-1', status: 'open' }
}

function project(status: string, orders = 1): Project {
  return {
    id: 'P1',
    productieOrders: Array.from({ length: orders }, (_, i) => ({
      id: `o${i}`, offerteRegelId: `r${i}`, artikelId: 'A1', artikelNaam: 'As', status,
    })),
  } as unknown as Project
}

describe('boekAfBijGereed', () => {
  it('boekt de open bonnen af zodra een order gereed wordt, met de uitgerekende rest', async () => {
    const t = nepDb({ s1: 3000 }, [bon('b1', 's1', 1200), bon('b2', 's1', 900)])
    const n = await boekAfBijGereed(t.db, project('in_productie'), project('gereed'), 'u1')
    expect(n).toBe(2)
    // Na elkaar op dezelfde staaf: 3000 → 1800 → 900.
    expect(t.mutaties.map((m) => m.newStock)).toEqual([1800, 900])
    expect(t.mutaties[0].note).toContain('rest uitgerekend, niet gemeten')
    expect(t.bonnen.every((b) => b.status === 'done')).toBe(true)
  })

  it('maakt een rest onder 100 mm schroot, net als de Zaagflow', async () => {
    const t = nepDb({ s1: 1250 }, [bon('b1', 's1', 1200)])
    await boekAfBijGereed(t.db, project('in_productie'), project('gereed'), 'u1')
    expect(t.mutaties[0]).toMatchObject({ newStock: 0, reason: 'scrapped' })
  })

  it('doet niets als de order al gereed was of het nog niet is', async () => {
    const t = nepDb({ s1: 3000 }, [bon('b1', 's1', 1200)])
    expect(await boekAfBijGereed(t.db, project('gereed'), project('gereed'), 'u1')).toBe(0)
    expect(await boekAfBijGereed(t.db, project('gepland'), project('in_productie'), 'u1')).toBe(0)
    expect(t.mutaties).toHaveLength(0)
  })
})

describe('bonnenVanOrderWaar', () => {
  const order = { projectId: 'P1', offerteRegelId: 'r1', artikelId: 'A1' }

  it('zoekt op de orderregel', () => {
    expect(bonnenVanOrderWaar(order, false)).toEqual({ projectId: 'P1', OR: [{ offerteRegelId: 'r1' }] })
  })

  it('neemt oude bonnen zonder regel alleen mee als er één order met dat artikel is', () => {
    expect(bonnenVanOrderWaar(order, true).OR).toContainEqual({ offerteRegelId: null, artikelId: 'A1' })
  })
})
