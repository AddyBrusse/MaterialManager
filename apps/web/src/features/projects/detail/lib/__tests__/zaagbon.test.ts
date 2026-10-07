import { describe, expect, it } from 'vitest'
import type { Project } from '@stockmanager/shared'
import type { ZaagReservation } from '../../../../../api/reservations'
import { teZagen, waaromNietZaagbon, zaagbonGegevens } from '../zaagbon-document'

const res = (deel: Partial<ZaagReservation>): ZaagReservation => ({
  id: 'z', calculatieNr: 'CALC-1', projectId: 'P', artikelId: null, barId: 'b', barCode: '260003-1', barLocation: 'Stelling A · 2',
  barVorm: 'Rond', pieces: 4, productLen: 125, sawLength: 520, fysiekeLengte: 3000, materiaal: 'C45', diameter: 60,
  werkstukLengte: 120, steekbreedte: 3, vlakToeslag: 2, machine: 'Mazak', createdAt: '2026-10-07T09:00:00Z',
  priority: null, rush: false, status: 'open', restLengteMm: null, completedAt: null, ...deel,
})

describe('zaagbon', () => {
  it('alleen wat voor dit project nog vastligt', () => {
    const lijst = [res({ id: '1' }), res({ id: '2', status: 'done' }), res({ id: '3', status: 'geannuleerd' }), res({ id: '4', projectId: 'Q' }), res({ id: '5', status: 'in_progress' })]
    expect(teZagen(lijst, 'P').map((r) => r.id)).toEqual(['1', '5'])
  })

  it('zonder vastgelegd materiaal zegt hij wat er eerst moet', () => {
    expect(waaromNietZaagbon([res({ status: 'done' })], 'P')).toMatch(/reserveer het eerst/)
    expect(waaromNietZaagbon([res({})], 'P')).toBeNull()
  })

  it('een regel per staaf: waar hij ligt en wat eraf moet', () => {
    const p = { id: 'P', naam: 'Assen', relatieId: null, contactId: null } as unknown as Project
    const d = zaagbonGegevens(p, [res({})], new Date('2026-10-07T10:00:00Z'))
    expect(d.regels).toEqual([{ staaf: '260003-1', materiaal: 'C45 Ø60', locatie: 'Stelling A · 2', stuks: '4 × 120 mm', zaaglengte: 520, notitie: 'CALC-1 · Mazak' }])
    expect(d.project).toBe('P')
  })
})
