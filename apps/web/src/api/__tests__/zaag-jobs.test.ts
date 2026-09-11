import { describe, it, expect } from 'vitest'
import { buildJobs } from '../zaag-jobs'
import type { ZaagReservation, ReservationStatus } from '../reservations'

function res(p: Partial<ZaagReservation> & { id: string }): ZaagReservation {
  return {
    calculatieNr: 'ZB-1', projectId: null, artikelId: null,
    barId: 'b1', barCode: '#00001', barLocation: 'Hal A', barVorm: 'Rond',
    pieces: 2, productLen: 100, sawLength: 220, fysiekeLengte: 3000,
    materiaal: 'S235', diameter: 50, werkstukLengte: 100, steekbreedte: 3,
    vlakToeslag: 2, machine: 'Zaag', createdAt: '2026-09-11T08:00:00.000Z',
    priority: null, rush: false, status: 'open' as ReservationStatus,
    restLengteMm: null, completedAt: null,
    ...p,
  }
}

describe('buildJobs', () => {
  it('noemt een bon af zodra niets meer materiaal vasthoudt', () => {
    // Geannuleerd telt als afgehandeld. Keek dit alleen naar 'done', dan bleef
    // een geannuleerde zaagbon voor altijd als open werk in de wachtrij staan.
    const jobs = buildJobs([
      res({ id: 'a', status: 'done' }),
      res({ id: 'b', status: 'geannuleerd' }),
    ])
    expect(jobs[0].status).toBe('done')
  })

  it('is nog bezig zolang er één regel openstaat', () => {
    const jobs = buildJobs([
      res({ id: 'a', status: 'done' }),
      res({ id: 'b', status: 'open' }),
    ])
    expect(jobs[0].status).toBe('open')
  })

  it('telt geannuleerde regels niet mee in de stuks', () => {
    const jobs = buildJobs([
      res({ id: 'a', pieces: 4 }),
      res({ id: 'b', pieces: 6, status: 'geannuleerd' }),
    ])
    expect(jobs[0].totalPcs).toBe(4)
  })

  it('zet spoed vooraan en afgehandelde bonnen achteraan', () => {
    const jobs = buildJobs([
      res({ id: 'a', calculatieNr: 'ZB-A' }),
      res({ id: 'b', calculatieNr: 'ZB-B', rush: true }),
      res({ id: 'c', calculatieNr: 'ZB-C', status: 'done' }),
    ])
    expect(jobs.map(j => j.calcNr)).toEqual(['ZB-B', 'ZB-A', 'ZB-C'])
  })
})
