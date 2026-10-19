import { describe, it, expect } from 'vitest'
import { exootStand } from '@stockmanager/shared'
import { exootStandPerStuk } from '../exoot-stand'

function nepDb(ooit: string[]) {
  const gezien: Record<string, unknown>[] = []
  const db = {
    stockMovement: {
      findMany: async (arg: Record<string, unknown>) => { gezien.push(arg); return ooit.map((itemId) => ({ itemId })) },
    },
  }
  return { db: db as never, gezien }
}

describe('exootStand', () => {
  it('op voorraad = binnen; op 0 = verbruikt als hij ooit voorraad had, anders nog niet binnen', () => {
    expect(exootStand(300, false)).toBe('binnen')
    expect(exootStand(0, true)).toBe('verbruikt')
    expect(exootStand(0, false)).toBe('niet_binnen')
  })
})

describe('exootStandPerStuk', () => {
  it('zoekt alleen exoten op 0 op, en alleen mutaties met een stand boven 0', async () => {
    const { db, gezien } = nepDb(['b'])
    const map = await exootStandPerStuk(db, [
      { id: 'a', exoot: true, currentStock: 0 }, { id: 'b', exoot: true, currentStock: '0' },
      { id: 'c', exoot: true, currentStock: 300 }, { id: 'd', exoot: false, currentStock: 0 },
    ])
    expect(Object.fromEntries(map)).toEqual({ a: 'niet_binnen', b: 'verbruikt', c: 'binnen' })
    expect(gezien[0].where).toEqual({ itemType: 'raw', itemId: { in: ['a', 'b'] }, newStock: { gt: 0 } })
  })
  it('vraagt niets aan de database als er geen exoot op 0 is', async () => {
    const { db, gezien } = nepDb([])
    await exootStandPerStuk(db, [{ id: 'c', exoot: true, currentStock: 300 }])
    expect(gezien).toHaveLength(0)
  })
})
