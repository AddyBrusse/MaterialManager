import { describe, it, expect, beforeEach } from 'vitest'
import { kaderUitPunten, lijnDikte, paginaAdres, browserNaam } from '../verbeterpunt'
import { onthoudFout, recenteFouten, wisRecenteFouten, BEWAAR_MS } from '../recente-fouten'

describe('kaderUitPunten', () => {
  it('maakt een kader in welke richting er ook gesleept is', () => {
    const k = kaderUitPunten({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })!
    expect(k.x).toBeCloseTo(0.2); expect(k.y).toBeCloseTo(0.1)
    expect(k.b).toBeCloseTo(0.4); expect(k.h).toBeCloseTo(0.4)
  })
  it('een klik is geen kader', () => {
    expect(kaderUitPunten({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.503 })).toBeNull()
  })
  it('een smalle streep wel', () => {
    expect(kaderUitPunten({ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.501 })).not.toBeNull()
  })
  it('blijft binnen de afbeelding als je erbuiten loslaat', () => {
    expect(kaderUitPunten({ x: 0.9, y: 0.9 }, { x: 1.4, y: -0.2 })).toEqual({ x: 0.9, y: 0, b: expect.closeTo(0.1), h: 0.9 })
  })
})

describe('lijnDikte', () => {
  it('minstens 3 px, dikker op een groot beeld', () => {
    expect(lijnDikte(800)).toBe(3)
    expect(lijnDikte(3840)).toBe(10)
  })
})

describe('paginaAdres', () => {
  it('neemt pad en zoekdeel mee', () => {
    expect(paginaAdres({ pathname: '/todos', search: '?tab=verbeterpunten' })).toBe('/todos?tab=verbeterpunten')
  })
  it('een los venster wordt de gewone pagina', () => {
    expect(paginaAdres({ pathname: '/pop/planning-queue', search: '' })).toBe('/planning-queue')
    expect(paginaAdres({ pathname: '/popcorn', search: '' })).toBe('/popcorn')
  })
})

describe('browserNaam', () => {
  it('herkent Edge, Chrome en Firefox op Windows', () => {
    expect(browserNaam('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0')).toBe('Edge 130 · Windows')
    expect(browserNaam('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36')).toBe('Chrome 129 · Windows')
    expect(browserNaam('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox 131 · Windows')
  })
  it('zegt het als hij hem niet kent', () => {
    expect(browserNaam('iets')).toBe('Onbekende browser')
  })
})

describe('recente foutmeldingen', () => {
  beforeEach(wisRecenteFouten)
  it('houdt de laatste tien, oudste eerst', () => {
    const nu = new Date('2026-10-24T20:00:00Z')
    for (let i = 1; i <= 12; i++) onthoudFout({ titel: `Fout ${i}`, tekst: 'x' }, nu)
    expect(recenteFouten(nu).map((f) => f.titel)).toEqual(Array.from({ length: 10 }, (_, i) => `Fout ${i + 3}`))
  })
  it('vergeet wat ouder is dan een kwartier', () => {
    onthoudFout({ titel: 'Oud', tekst: 'x' }, new Date('2026-10-24T20:00:00Z'))
    onthoudFout({ titel: 'Nieuw', tekst: 'x' }, new Date('2026-10-24T20:10:00Z'))
    const later = new Date(new Date('2026-10-24T20:00:00Z').getTime() + BEWAAR_MS + 1000)
    expect(recenteFouten(later).map((f) => f.titel)).toEqual(['Nieuw'])
  })
})
