import { describe, it, expect, vi } from 'vitest'

vi.mock('../../db/client', () => ({ prisma: {} }))
import { nextDocId } from '../doc-nummer'

/** Een nep-database: tellers per sleutel en een set bezette nummers. */
function nepDb(tellers: Record<string, number>, bezet: string[] = []) {
  const sleutels: string[] = []
  const vind = { findUnique: async ({ where }: { where: { id: string } }) => (bezet.includes(where.id) ? { id: where.id } : null) }
  const db = {
    $queryRaw: async (_s: TemplateStringsArray, sleutel: string) => {
      sleutels.push(sleutel)
      tellers[sleutel] = (tellers[sleutel] ?? 0) + 1
      return [{ last_n: tellers[sleutel] }]
    },
    project: vind, offerte: vind, opdrachtbevestiging: vind, productieOrder: vind, paklijst: vind, factuur: vind,
    inkooporderRegel: { findUnique: async ({ where }: { where: { materiaalNummer: string } }) => (bezet.includes(where.materiaalNummer) ? { id: 'x' } : null) },
  }
  return { db: db as never, sleutels, tellers }
}

describe('nextDocId — nummering per jaar', () => {
  it('telt door binnen het jaar', async () => {
    const { db, sleutels } = nepDb({ 'FACT-2026': 13 })
    expect(await nextDocId(db, 'FACT', new Date('2026-12-31T12:00:00'))).toBe('FACT-2026-014')
    expect(sleutels).toEqual(['FACT-2026'])
  })

  it('begint op 1 januari opnieuw bij 001', async () => {
    const { db, sleutels } = nepDb({ 'FACT-2026': 13 })
    expect(await nextDocId(db, 'FACT', new Date('2027-01-01T08:00:00'))).toBe('FACT-2027-001')
    expect(sleutels).toEqual(['FACT-2027'])
  })

  it('slaat een nummer over dat al bestaat', async () => {
    const { db } = nepDb({ 'OFF-2026': 4 }, ['OFF-2026-005'])
    expect(await nextDocId(db, 'OFF', new Date('2026-10-05T12:00:00'))).toBe('OFF-2026-006')
  })

  it('houdt credits in een eigen reeks', async () => {
    const { db } = nepDb({ 'FACT-2026': 9, 'CRED-2026': 1 })
    expect(await nextDocId(db, 'CRED', new Date('2026-10-05T12:00:00'))).toBe('CRED-2026-002')
  })
})

describe('nextDocId — materiaalnummer voor het label (2026-10-07)', () => {
  it('is kort: M26-0042, per jaar opnieuw', async () => {
    const { db, sleutels } = nepDb({ 'M-2026': 41 })
    expect(await nextDocId(db, 'M', new Date('2026-10-07T12:00:00'))).toBe('M26-0042')
    expect(sleutels).toEqual(['M-2026'])
    expect(await nextDocId(db, 'M', new Date('2027-01-02T12:00:00'))).toBe('M27-0001')
  })
  it('slaat een bezet nummer over', async () => {
    const { db } = nepDb({ 'M-2026': 0 }, ['M26-0001'])
    expect(await nextDocId(db, 'M', new Date('2026-10-07T12:00:00'))).toBe('M26-0002')
  })
})

