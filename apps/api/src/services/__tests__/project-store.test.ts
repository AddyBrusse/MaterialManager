import { describe, it, expect } from 'vitest'
import { regelSleutels } from '../project-store'

describe('regelSleutels', () => {
  it('leidt dezelfde sleutel af bij elk opnieuw wegschrijven', () => {
    const een = regelSleutels('PL-2026-001', ['PROD-1', 'PROD-2'])
    const twee = regelSleutels('PL-2026-001', ['PROD-1', 'PROD-2'])
    expect(een).toEqual(twee)
    expect(een).toEqual(['PL-2026-001:PROD-1', 'PL-2026-001:PROD-2'])
  })

  it('houdt de sleutel van een regel gelijk als er een regel bij komt', () => {
    // Anders zou het toevoegen van één regel alle andere rijen verwijderen en
    // opnieuw aanmaken — de reden dat deze sleutel afgeleid is en niet gegenereerd.
    const voor = regelSleutels('FACT-2026-001', ['r1', 'r2'])
    const na = regelSleutels('FACT-2026-001', ['r1', 'r2', 'r3'])
    expect(na.slice(0, 2)).toEqual(voor)
  })

  it('houdt de sleutels uniek als dezelfde order twee keer voorkomt', () => {
    const ids = regelSleutels('PL-2026-001', ['PROD-1', 'PROD-1'])
    expect(new Set(ids).size).toBe(2)
  })

  it('valt terug op de index als er geen sleutel is', () => {
    expect(regelSleutels('PL-2026-001', ['', ''])).toEqual([
      'PL-2026-001:0', 'PL-2026-001:1',
    ])
  })
})
