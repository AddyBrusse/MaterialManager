import { describe, it, expect } from 'vitest'
import type { ZaagReservation } from '../../../../../api/reservations'
import type { OrderRegelDekking } from '../../../../../api/materiaal-plan'
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

// Elke materiaalregel uit voorraad (2026-10-23): de server zegt per regel of hij geregeld is.
describe('materiaalVanRegel met meer materiaalregels', () => {
  const regel = (regelId: string, gedekt: number, p: Partial<OrderRegelDekking['regels'][number]> = {}) => ({
    regelId, nodigStuks: 50, gedektStuks: gedekt, besteld: false, klaar: gedekt >= 50,
    naam: regelId, materiaal: regelId, fout: null, ...p,
  })
  const dekking = (...regels: OrderRegelDekking['regels']): OrderRegelDekking => ({ offerteRegelId: 'r1', regels, exoten: [] })

  it('één van twee materialen gekozen is deels, met hoeveel', () => {
    const m = materiaalVanRegel(bus, [bus], [res({ offerteRegelId: 'r1' })], dekking(regel('as', 50), regel('bus', 0)))
    expect(m.stand).toBe('deels')
    expect(m.deelTekst).toBe('1 van 2 materialen')
  })

  it('bij één materiaal: hoeveel stuks er al liggen', () => {
    const m = materiaalVanRegel(bus, [bus], [res({ offerteRegelId: 'r1' })], dekking(regel('as', 40)))
    expect(m).toMatchObject({ stand: 'deels', deelTekst: '40 van 50 st' })
  })

  it('nog niets gekozen blijft kiezen', () => {
    expect(materiaalVanRegel(bus, [bus], [], dekking(regel('as', 0), regel('bus', 0))).stand).toBe('kiezen')
  })

  it('niets op voorraad en alles op de bestellijst is besteld', () => {
    const m = materiaalVanRegel(bus, [bus], [], dekking(regel('as', 0, { besteld: true, klaar: true })))
    expect(m.stand).toBe('besteld')
  })

  it('alles geregeld met een deel besteld is gereserveerd, met de rest besteld erbij', () => {
    const m = materiaalVanRegel(bus, [bus], [res({ offerteRegelId: 'r1' })],
      dekking(regel('as', 50), regel('bus', 20, { besteld: true, klaar: true })))
    expect(m).toMatchObject({ stand: 'gereserveerd', besteld: true })
  })
})

describe('materiaalSamenvatting', () => {
  it('telt staven en meters op', () => {
    expect(materiaalSamenvatting([res({ barId: 'a' }), res({ barId: 'b', sawLength: 1700 })]))
      .toBe('2 staven · 3,40 m · 42CrMo4')
  })
})
