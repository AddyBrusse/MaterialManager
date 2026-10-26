import { describe, it, expect } from 'vitest'
import { mutatieReden, nieuweLengte, waaromNietInvoer } from '../mutatie'

describe('mutatie met de hand', () => {
  it('nieuwe lengte per soort, nooit onder 0', () => {
    expect(nieuweLengte('toevoegen', 300, 200)).toBe(500)
    expect(nieuweLengte('afboeken', 300, 200)).toBe(100)
    expect(nieuweLengte('afboeken', 300, 500)).toBe(0)
    expect(nieuweLengte('correctie', 300, 1200)).toBe(1200)
  })

  it('reden in de historie', () => {
    expect(mutatieReden('toevoegen')).toBe('received')
    expect(mutatieReden('afboeken')).toBe('used')
    expect(mutatieReden('correctie')).toBe('correction')
  })

  it('lege of nul-invoer is geen mutatie', () => {
    expect(waaromNietInvoer(NaN)).toMatch(/geldige lengte/)
    expect(waaromNietInvoer(0)).toMatch(/geldige lengte/)
    expect(waaromNietInvoer(5)).toBeNull()
  })
})
