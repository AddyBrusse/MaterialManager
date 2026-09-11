import { describe, it, expect } from 'vitest'
import { gereserveerdPerStaaf, beschikbaarheidVan, OPEN_STATUSSEN, mm } from '../voorraad'

// Handgemaakte dubbel: een vi.fn() die een afgewezen promise teruggeeft laat een
// losse rejection achter (vitest hangt er zijn eigen .then aan).
function nepDb(opties: {
  groepen?: { barId: string; _sum: { sawLength: unknown } }[]
  staaf?: { currentStock: number } | null
  som?: unknown
} = {}) {
  const gezien: Record<string, unknown>[] = []
  const db = {
    zaagReservering: {
      groupBy: async (arg: Record<string, unknown>) => { gezien.push(arg); return opties.groepen ?? [] },
      aggregate: async (arg: Record<string, unknown>) => {
        gezien.push(arg)
        return { _sum: { sawLength: opties.som ?? null } }
      },
    },
    rawMaterial: {
      findUnique: async () => (opties.staaf === undefined ? { currentStock: 3000 } : opties.staaf),
    },
  }
  return { db: db as never, gezien }
}

describe('OPEN_STATUSSEN', () => {
  it('bevat alleen de statussen die materiaal vasthouden', () => {
    // Dit is de kern van het hele ontwerp: afgeboekt of geannuleerd houdt niets
    // meer vast. Stond 'done' er wel in, dan bleef een gezaagde staaf voor
    // altijd gereserveerd én korter — dubbel geraakt.
    expect([...OPEN_STATUSSEN]).toEqual(['open', 'in_progress'])
  })
})

describe('gereserveerdPerStaaf', () => {
  it('telt per staaf op en filtert op de open statussen', async () => {
    const { db, gezien } = nepDb({ groepen: [{ barId: 'b1', _sum: { sawLength: 870 } }] })
    const map = await gereserveerdPerStaaf(db, ['b1', 'b2'])
    expect(map.get('b1')).toBe(870)
    expect(map.get('b2')).toBeUndefined()
    expect(gezien[0].where).toMatchObject({ status: { in: ['open', 'in_progress'] } })
  })

  it('maakt van een Prisma Decimal een getal', async () => {
    // Prisma geeft een DECIMAL als object terug. Zonder Number() zou een
    // optelling stringplakwerk worden — precies de fout die in september in de
    // reserveringsroute zat.
    const decimal = { toString: () => '870', valueOf: () => 870 }
    const { db } = nepDb({ groepen: [{ barId: 'b1', _sum: { sawLength: decimal } }] })
    expect(await gereserveerdPerStaaf(db).then((m) => m.get('b1'))).toBe(870)
  })
})

describe('beschikbaarheidVan', () => {
  it('trekt het vastliggende van het fysieke af', async () => {
    const { db } = nepDb({ staaf: { currentStock: 3000 }, som: 1200 })
    expect(await beschikbaarheidVan(db, 'b1')).toEqual({
      fysiekMm: 3000, gereserveerdMm: 1200, vrijMm: 1800,
    })
  })

  it('geeft null als de staaf niet bestaat', async () => {
    const { db } = nepDb({ staaf: null })
    expect(await beschikbaarheidVan(db, 'weg')).toBeNull()
  })

  it('laat de eigen reservering buiten beschouwing als daarom gevraagd wordt', async () => {
    // Bij het wijzigen van een bestaande reservering zou hij anders tegen
    // zichzelf botsen.
    const { db, gezien } = nepDb({ staaf: { currentStock: 3000 }, som: 0 })
    await beschikbaarheidVan(db, 'b1', 'res-1')
    expect(gezien[0].where).toMatchObject({ id: { not: 'res-1' } })
  })
})

describe('mm', () => {
  it('schrijft lengtes leesbaar op', () => {
    expect(mm(1200)).toBe('1.200 mm')
    expect(mm(1199.6)).toBe('1.200 mm')
  })
})
