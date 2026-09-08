import { describe, it, expect } from 'vitest'
import { matchLine, type ArticleCandidate } from '../match-articles'
import type { CandidateLine } from '@stockmanager/shared'

function line(tekening: string): CandidateLine {
  return {
    id: 'ai-1', ruweTekst: tekening, tekening, rev: null, positie: 1, qty: 10,
    bron: 'pdf', attachmentFilename: null, bestanden: [], matches: [], status: 'nieuw',
    artikelId: null, handmatig: false, extractor: 'ai', bronTekst: tekening,
    gegrond: true, tekeningGegrond: true, bevestigd: true, bronBestand: null,
    klantArtikel: null, klantPrijs: null, omschrijving: null,
    zekerheid: 0, zekerheidRedenen: [],
  }
}

const namen = new Map([['REL-A', 'Stinis B.V.'], ['REL-B', 'Nieuwe Klant BV']])

describe('een tekeningnummer is van de klant', () => {
  const vanStinis: ArticleCandidate[] = [
    { id: 'ART-0011', naam: 'Signaleringsplaat', tekening: '4471', rev: null, relatieId: 'REL-A' },
  ]

  it('vult niet voor met het artikel van een andere klant', () => {
    // Zonder deze rem werd dit automatisch gekoppeld — aangetoond 2026-09-08.
    const uit = matchLine(line('4471'), vanStinis, [], 'REL-B', namen)
    expect(uit.status).toBe('twijfel')
    expect(uit.artikelId).toBeNull()
  })

  it('zegt bij wie het artikel hoort', () => {
    const uit = matchLine(line('4471'), vanStinis, [], 'REL-B', namen)
    expect(uit.matches[0].vanAndereKlant).toBe(true)
    expect(uit.matches[0].reden).toMatch(/hoort bij Stinis B\.V\./)
  })

  it('koppelt gewoon voor als het dezelfde klant is', () => {
    const uit = matchLine(line('4471'), vanStinis, [], 'REL-A', namen)
    expect(uit.status).toBe('match')
    expect(uit.artikelId).toBe('ART-0011')
  })

  it('houdt een artikel zonder relatie bruikbaar voor iedereen', () => {
    // Oude data draagt geen relatie; die mag niet ineens onbruikbaar worden.
    const zonder: ArticleCandidate[] = [{ id: 'ART-9', naam: 'Bus', tekening: '4471', rev: null, relatieId: null }]
    expect(matchLine(line('4471'), zonder, [], 'REL-B', namen).status).toBe('match')
  })

  it('gedraagt zich als vanouds zolang er geen relatie bekend is', () => {
    expect(matchLine(line('4471'), vanStinis, [], null, namen).status).toBe('match')
  })
})
