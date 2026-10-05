import { describe, it, expect } from 'vitest'
import { gatInFactuurnummers, waaromNietNummerZetten } from '@stockmanager/shared'

const fact = { prefix: 'FACT' as const, jaar: 2026, hoogsteBestaand: 14, volgendeN: 15 }

describe('volgend nummer met de hand zetten', () => {
  it('weigert een nummer dat al bestaat of lager is, en zegt wat het minimaal moet zijn', () => {
    expect(waaromNietNummerZetten(fact, 14)).toBe('FACT-2026-014 bestaat al; het volgende nummer moet minstens 015 zijn.')
    expect(waaromNietNummerZetten(fact, 3)).toContain('minstens 015')
    expect(waaromNietNummerZetten(fact, 0)).toContain('1 of hoger')
    expect(waaromNietNummerZetten(fact, 15)).toBeNull()
    expect(waaromNietNummerZetten(fact, 40)).toBeNull()
  })

  it('waarschuwt bij een gat in de factuurnummers', () => {
    expect(gatInFactuurnummers(fact, 15)).toBeNull()
    expect(gatInFactuurnummers(fact, 16)).toContain('Dit slaat FACT-2026-015 over.')
    expect(gatInFactuurnummers(fact, 20)).toContain('FACT-2026-015 t/m FACT-2026-019')
    expect(gatInFactuurnummers({ ...fact, prefix: 'CRED' }, 20)).toContain('Creditnummers')
  })

  it('waarschuwt niet bij andere documenten', () => {
    expect(gatInFactuurnummers({ ...fact, prefix: 'OFF' }, 40)).toBeNull()
  })
})
