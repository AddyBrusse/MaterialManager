import { describe, it, expect } from 'vitest'
import { bestaandeExoot } from '../bestaande-exoot'
import type { RawMaterialRow } from '../../../api/raw-materials'

const rij = (id: string, o: Partial<RawMaterialRow> = {}) => ({
  id, code: `#${id}`, exoot: true, klantId: 'k', artikelId: 'a', gradeId: 'g', profileId: 'p',
  dimensions: { width: 250, thickness: 30 }, lengthMm: '300', createdAt: `2026-10-0${id}T00:00:00Z`, ...o,
} as RawMaterialRow)
const zoek = { klantId: 'k', gradeId: 'g', profileId: 'p', maten: { width: 250, thickness: 30 }, lengte: 300, artikelId: 'a' }

describe('bestaandeExoot', () => {
  it('vindt dezelfde exoot: die van dit artikel eerst, dan de oudste', () => {
    expect(bestaandeExoot([rij('3'), rij('2')], zoek)?.id).toBe('2')
    expect(bestaandeExoot([rij('1', { artikelId: 'b' }), rij('4')], zoek)?.id).toBe('4')
    expect(bestaandeExoot([rij('1', { artikelId: 'b' })], zoek)?.id).toBe('1')
  })
  it('een andere klant, maat, lengte of kwaliteit telt niet, en gewone staven ook niet', () => {
    expect(bestaandeExoot([
      rij('1', { klantId: 'x' }), rij('2', { dimensions: { width: 250, thickness: 20 } }),
      rij('3', { lengthMm: '310' }), rij('4', { gradeId: 'h' }), rij('5', { exoot: false }),
    ], zoek)).toBeUndefined()
  })
  it('zonder klant zoekt hij niet', () => {
    expect(bestaandeExoot([rij('1')], { ...zoek, klantId: null })).toBeUndefined()
  })
})
