import { describe, it, expect } from 'vitest'
import {
  waaromNietVersturen, waaromNietAccepteren, waaromNietWijzigen,
  type Offerte, type OfferteRegel,
} from '@stockmanager/shared'

function regel(naam: string, qty: number): OfferteRegel {
  return {
    id: naam, sortOrder: 1, artikelId: null, naam, omschrijving: '',
    qty, eenheid: 'st', verkoopprijs: 10, totaal: qty * 10, bewerkingen: [],
  }
}

function versie(v: number, status: Offerte['status'], regels: OfferteRegel[]): Offerte {
  return {
    id: `off${v}`, documentNr: 'OFF-2026-014', projectId: 'PRJ', versie: v, status, regels,
    notities: '', externeRef: null, geldigTot: null, verzondenOp: null, geaccepteerdOp: null,
    createdAt: '2026-09-25T09:00:00.000Z', updatedAt: '2026-09-25T09:00:00.000Z',
  }
}

describe('waaromNietVersturen', () => {
  it('mag een concept met regels', () => {
    expect(waaromNietVersturen(versie(1, 'concept', [regel('As', 5)]))).toBeNull()
  })

  it('zegt dat er geen regels in staan', () => {
    expect(waaromNietVersturen(versie(1, 'concept', []))).toBe(
      'Kan offerte niet versturen: er staan nog geen regels in. Voeg eerst artikelen toe.',
    )
  })

  it('noemt de regel zonder aantal', () => {
    expect(waaromNietVersturen(versie(1, 'concept', [regel('As', 5), regel('Bus', 0)])))
      .toContain('regel "Bus" heeft geen aantal')
  })

  it('weigert een versie die al de deur uit is', () => {
    expect(waaromNietVersturen(versie(2, 'verzonden', [regel('As', 5)])))
      .toContain('v2 niet versturen: deze versie is al verstuurd')
  })

  // Vóór deze regel gaf de server hier "gelukt" en veranderde er niets.
  it('weigert een versie die niet bestaat', () => {
    expect(waaromNietVersturen(undefined)).toContain('bestaat niet')
  })
})

describe('waaromNietAccepteren', () => {
  const v1 = versie(1, 'verzonden', [regel('As', 5)])

  it('mag een verstuurde versie', () => {
    expect(waaromNietAccepteren(v1, [v1])).toBeNull()
  })

  it('weigert een concept: eerst versturen', () => {
    const c = versie(1, 'concept', [regel('As', 5)])
    expect(waaromNietAccepteren(c, [c])).toContain('nog niet verstuurd')
  })

  it('weigert als een andere versie al geaccepteerd is', () => {
    const v2 = versie(2, 'geaccepteerd', [regel('As', 10)])
    expect(waaromNietAccepteren(v1, [v1, v2])).toContain('v2 is al geaccepteerd')
  })
})

describe('waaromNietWijzigen', () => {
  it('mag alleen op een concept', () => {
    expect(waaromNietWijzigen(versie(1, 'concept', []))).toBeNull()
    expect(waaromNietWijzigen(versie(1, 'verzonden', []))).toContain('Maak een kopie')
  })
})
