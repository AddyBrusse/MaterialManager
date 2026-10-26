import { describe, it, expect } from 'vitest'
import { volgendeVoorraadCode } from '../raw-materials'

describe('volgendeVoorraadCode', () => {
  it('telt door op de hoogste #NNNNN', () => {
    expect(volgendeVoorraadCode([{ code: '#00001' }, { code: '#00099' }])).toBe('#00100')
    expect(volgendeVoorraadCode([])).toBe('#00001')
  })
  it('een materiaalnummer als 260001-1 telt niet mee', () => {
    // Gaf "#260002", en dat weigert de server (Code moet #NNNNN formaat hebben).
    expect(volgendeVoorraadCode([{ code: '#00004' }, { code: '260001-1' }, { code: '260001-12' }])).toBe('#00005')
  })
})
