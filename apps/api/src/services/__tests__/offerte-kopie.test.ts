import { describe, it, expect } from 'vitest'
import { kopieerOfferte, volgendeVersie, type Offerte, type OfferteRegel } from '@stockmanager/shared'

// Het geval waarvoor dit gebouwd is: een staffel. v1 is verstuurd voor 5 stuks
// en geaccepteerd; de klant wil ook een prijs voor 10, dus v2 begint als kopie.

const NU = '2026-09-25T09:00:00.000Z'

function regel(id: string, sortOrder: number, qty: number, prijs: number): OfferteRegel {
  return {
    id, sortOrder, artikelId: `ART-${id}`, naam: `Artikel ${id}`, omschrijving: 'Ø45 × 120',
    qty, eenheid: 'st', verkoopprijs: prijs, totaal: qty * prijs, bewerkingen: ['zagen', 'draaien'],
  }
}

const bron: Offerte = {
  id: 'OFF-2026-014',
  documentNr: 'OFF-2026-014',
  projectId: 'PRJ-2026-003',
  versie: 1,
  status: 'geaccepteerd',
  // Bewust niet op volgorde: de kopie moet de volgorde van het scherm houden,
  // niet die van de array.
  regels: [regel('b', 2, 5, 58.75), regel('a', 1, 10, 46.2)],
  notities: 'Levering in twee delen',
  geldigTot: '2026-10-01',
  verzondenOp: '2026-09-01T08:00:00.000Z',
  geaccepteerdOp: '2026-09-03T08:00:00.000Z',
  createdAt: '2026-08-30T08:00:00.000Z',
  updatedAt: '2026-09-03T08:00:00.000Z',
}

const nieuw = { id: 'OFF-2026-031', documentNr: 'OFF-2026-014', versie: 2, regelIds: ['n1', 'n2'], nu: NU }

describe('kopieerOfferte', () => {
  it('neemt de inhoud mee: regels, aantallen, prijzen, bewerkingen en notities', () => {
    const k = kopieerOfferte(bron, nieuw)
    expect(k.regels.map(r => [r.naam, r.qty, r.verkoopprijs, r.bewerkingen])).toEqual([
      ['Artikel a', 10, 46.2, ['zagen', 'draaien']],
      ['Artikel b', 5, 58.75, ['zagen', 'draaien']],
    ])
    expect(k.notities).toBe('Levering in twee delen')
  })

  it('begint als concept dat nog nergens heen is', () => {
    const k = kopieerOfferte(bron, nieuw)
    expect(k.status).toBe('concept')
    expect(k.verzondenOp).toBeNull()
    expect(k.geaccepteerdOp).toBeNull()
    expect(k.geldigTot).toBeNull()
    expect(k.createdAt).toBe(NU)
  })

  it('draagt het nummer, id en versienummer dat de aanroeper meegeeft', () => {
    const k = kopieerOfferte(bron, nieuw)
    expect(k.id).toBe('OFF-2026-031')
    expect(k.documentNr).toBe('OFF-2026-014')
    expect(k.versie).toBe(2)
  })

  // De opdrachtregels van een geaccepteerde kopie krijgen de id's van déze
  // regels. Hergebruikt de kopie die van de bron, dan wijzen twee offertes
  // naar dezelfde regel.
  it('geeft elke regel een nieuw id, in de volgorde van de bron', () => {
    const k = kopieerOfferte(bron, nieuw)
    expect(k.regels.map(r => r.id)).toEqual(['n1', 'n2'])
    expect(k.regels.map(r => r.sortOrder)).toEqual([1, 2])
  })

  it('maakt zelf id\'s als er geen zijn meegegeven, en nooit die van de bron', () => {
    const k = kopieerOfferte(bron, { ...nieuw, regelIds: undefined })
    const ids = k.regels.map(r => r.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids).not.toContain('a')
    expect(ids).not.toContain('b')
  })

  it('laat de bron ongemoeid — ook de bewerkingen-array', () => {
    const k = kopieerOfferte(bron, nieuw)
    k.regels[0].bewerkingen.push('frezen')
    k.regels[0].qty = 99
    expect(bron.regels.find(r => r.id === 'a')!.bewerkingen).toEqual(['zagen', 'draaien'])
    expect(bron.regels.find(r => r.id === 'a')!.qty).toBe(10)
    expect(bron.status).toBe('geaccepteerd')
  })
})

describe('volgendeVersie', () => {
  it('telt door vanaf de hoogste versie, niet vanaf het aantal', () => {
    // Het project waarop dit misging: v2 bestaat niet. `length + 1` gaf 4, en
    // dan stonden er twee versies 4 naast elkaar.
    expect(volgendeVersie([{ versie: 1 }, { versie: 3 }, { versie: 4 }])).toBe(5)
  })

  it('begint bij 1 op een project zonder offertes', () => {
    expect(volgendeVersie([])).toBe(1)
  })
})
