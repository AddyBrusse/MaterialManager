import { describe, it, expect } from 'vitest'
import type { ZaagReservation } from '../../../../../api/reservations'
import { materiaalVanRegel, materiaalSamenvatting } from '../materiaal-stand'

function res(p: Partial<ZaagReservation>): ZaagReservation {
  return {
    id: 'r', calculatieNr: 'OB-1', projectId: 'PRJ', artikelId: 'ART-1', offerteRegelId: null,
    barId: 'bar1', barCode: 'B-001', barLocation: '', barVorm: 'rond', pieces: 10, productLen: 120,
    sawLength: 1700, fysiekeLengte: 3000, materiaal: '42CrMo4', diameter: 45, werkstukLengte: 123,
    steekbreedte: 3, vlakToeslag: 3, machine: 'Draaibank', createdAt: '', priority: null, rush: false,
    status: 'open', restLengteMm: null, completedAt: null, ...p,
  }
}

const bus = { id: 'r1', artikelId: 'ART-1' }
const klem = { id: 'r2', artikelId: 'ART-2' }

describe('materiaalVanRegel', () => {
  it('een regel zonder artikel heeft geen materiaal nodig', () => {
    expect(materiaalVanRegel({ id: 'x', artikelId: null }, [], []).stand).toBe('geen')
  })

  it('zonder reservering moet er nog gekozen worden', () => {
    expect(materiaalVanRegel(bus, [bus, klem], []).stand).toBe('kiezen')
  })

  it('een open reservering is gereserveerd', () => {
    expect(materiaalVanRegel(bus, [bus], [res({ offerteRegelId: 'r1' })]).stand).toBe('gereserveerd')
  })

  // De fout van vóór 2026-09-28: afgeboekt materiaal telde als "nog niets".
  it('een afgeboekte reservering is gezaagd, niet "nog niets"', () => {
    expect(materiaalVanRegel(bus, [bus], [res({ offerteRegelId: 'r1', status: 'done' })]).stand).toBe('gezaagd')
  })

  it('een geannuleerde reservering telt niet', () => {
    expect(materiaalVanRegel(bus, [bus], [res({ offerteRegelId: 'r1', status: 'geannuleerd' })]).stand).toBe('kiezen')
  })

  it('koppelt per regel, niet per artikel', () => {
    const tweede = { id: 'r3', artikelId: 'ART-1' }
    const r = [res({ offerteRegelId: 'r1' })]
    expect(materiaalVanRegel(bus, [bus, tweede], r).stand).toBe('gereserveerd')
    expect(materiaalVanRegel(tweede, [bus, tweede], r).stand).toBe('kiezen')
  })

  it('een oude reservering zonder regel telt alleen als het artikel één keer voorkomt', () => {
    const oud = [res({ offerteRegelId: null })]
    expect(materiaalVanRegel(bus, [bus, klem], oud).stand).toBe('gereserveerd')
    const tweede = { id: 'r3', artikelId: 'ART-1' }
    expect(materiaalVanRegel(bus, [bus, tweede], oud).stand).toBe('kiezen')
  })
})

describe('materiaalSamenvatting', () => {
  it('telt staven en meters op', () => {
    expect(materiaalSamenvatting([res({ barId: 'a' }), res({ barId: 'b', sawLength: 1700 })]))
      .toBe('2 staven · 3,40 m · 42CrMo4')
  })
})
