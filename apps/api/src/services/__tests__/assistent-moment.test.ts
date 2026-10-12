import { describe, it, expect } from 'vitest'
import { geldigeActie, laatsteMoment, schoneTijden } from '@stockmanager/shared'

const op = (d: string, t: string) => new Date(`${d}T${t}:00`)

describe('laatsteMoment', () => {
  const tijden = ['15:00', '08:00']
  it('vandaag de laatste tijd die al geweest is', () => {
    expect(laatsteMoment(tijden, op('2026-10-12', '09:30'))).toEqual(op('2026-10-12', '08:00'))
    expect(laatsteMoment(tijden, op('2026-10-12', '15:00'))).toEqual(op('2026-10-12', '15:00'))
    expect(laatsteMoment(tijden, op('2026-10-12', '23:59'))).toEqual(op('2026-10-12', '15:00'))
  })
  it('vóór de eerste tijd: de laatste van gisteren', () => {
    expect(laatsteMoment(tijden, op('2026-10-12', '07:59'))).toEqual(op('2026-10-11', '15:00'))
  })
  it('zonder (geldige) tijden: geen moment', () => {
    expect(laatsteMoment([], op('2026-10-12', '09:00'))).toBeNull()
    expect(laatsteMoment(['25:00', 'acht'], op('2026-10-12', '09:00'))).toBeNull()
  })
})

describe('schoneTijden', () => {
  it('sorteert, ontdubbelt en laat ongeldige weg', () => {
    expect(schoneTijden(['15:00', '08:00', '15:00', '8:00'])).toEqual(['08:00', '15:00'])
  })
})

describe('geldigeActie', () => {
  it('alleen routes in de app', () => {
    expect(geldigeActie({ label: 'Naar Bestellingen', link: '/bestellingen' })).toEqual({ label: 'Naar Bestellingen', link: '/bestellingen' })
    expect(geldigeActie({ label: 'Weg', link: 'https://example.com' })).toBeNull()
    expect(geldigeActie({ label: 'Weg', link: '//example.com' })).toBeNull()
    expect(geldigeActie({ label: '', link: '/x' })).toBeNull()
  })
})
