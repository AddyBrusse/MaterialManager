import { describe, it, expect } from 'vitest'
import { afwijkingKleur, afwijkingTekst, devBalk, DEV_HALF, devKleurVar } from '../nacalculatie'

describe('afwijkingKleur', () => {
  it('goedkoper gemaakt dan berekend is groen, ook bij een kleine afwijking', () => {
    expect(afwijkingKleur(-10)).toBe('ok')
    expect(afwijkingKleur(-3)).toBe('ok')
    expect(afwijkingKleur(-40)).toBe('ok')
  })

  it('duurder is rood', () => {
    expect(afwijkingKleur(3)).toBe('dgr')
    expect(afwijkingKleur(40)).toBe('dgr')
  })

  it('afronding en een ontbrekende meting zijn neutraal', () => {
    expect(afwijkingKleur(0.3)).toBe('neutraal')
    expect(afwijkingKleur(null)).toBe('neutraal')
    expect(afwijkingKleur(undefined)).toBe('neutraal')
    expect(afwijkingKleur(NaN)).toBe('neutraal')
  })
})

describe('afwijkingTekst', () => {
  it('zegt in woorden welke kant op', () => {
    expect(afwijkingTekst(-10)).toBe('10,0 % onder calculatie')
    expect(afwijkingTekst(8.25)).toBe('8,3 % boven calculatie')
    expect(afwijkingTekst(0.2)).toBe('gelijk aan calculatie')
    expect(afwijkingTekst(null)).toBe('')
  })
})

describe('devBalk', () => {
  it('groeit vanuit het midden naar rechts bij overschrijding', () => {
    const b = devBalk(25)
    expect(b).toEqual({ left: DEV_HALF, width: DEV_HALF / 2 })
  })

  it('groeit naar links bij onderschrijding', () => {
    const b = devBalk(-25)
    expect(b).toEqual({ left: DEV_HALF / 2, width: DEV_HALF / 2 })
  })

  it('kapt af op 50 procent, zodat de balk geen schaal suggereert die er niet is', () => {
    expect(devBalk(50)?.width).toBe(DEV_HALF)
    expect(devBalk(500)?.width).toBe(DEV_HALF)
  })

  it('tekent niets bij nul of zonder meting', () => {
    expect(devBalk(0)).toBeNull()
    expect(devBalk(null)).toBeNull()
  })
})

describe('devKleurVar', () => {
  it('gebruikt de rail bij gelijk: zichtbaar, maar geen signaal', () => {
    expect(devKleurVar(0.2)).toBe('var(--rail)')
    expect(devKleurVar(2)).toBe('var(--dgr)')
    expect(devKleurVar(20)).toBe('var(--dgr)')
    expect(devKleurVar(-20)).toBe('var(--ok)')
  })
})
