import { describe, it, expect } from 'vitest'
import { afwijkingKleur, devBalk, DEV_HALF, devKleurVar } from '../nacalculatie'

describe('afwijkingKleur', () => {
  it('zwijgt onder de 5 procent — 3 % mag niet schreeuwen', () => {
    expect(afwijkingKleur(3)).toBe('neutraal')
    expect(afwijkingKleur(-4.9)).toBe('neutraal')
  })

  it('waarschuwt tussen 5 en 15 procent, beide kanten op', () => {
    expect(afwijkingKleur(5)).toBe('warn')
    expect(afwijkingKleur(14.9)).toBe('warn')
    expect(afwijkingKleur(-9)).toBe('warn')
  })

  it('maakt onderschrijding vanaf 15 procent groen en overschrijding rood', () => {
    expect(afwijkingKleur(15)).toBe('dgr')
    expect(afwijkingKleur(40)).toBe('dgr')
    expect(afwijkingKleur(-15)).toBe('ok')
  })

  it('behandelt ontbrekende meting als neutraal, niet als nul', () => {
    expect(afwijkingKleur(null)).toBe('neutraal')
    expect(afwijkingKleur(undefined)).toBe('neutraal')
    expect(afwijkingKleur(NaN)).toBe('neutraal')
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
  it('gebruikt de rail onder de 5 procent: zichtbaar, maar geen signaal', () => {
    expect(devKleurVar(2)).toBe('var(--rail)')
    expect(devKleurVar(20)).toBe('var(--dgr)')
    expect(devKleurVar(-20)).toBe('var(--ok)')
  })
})
