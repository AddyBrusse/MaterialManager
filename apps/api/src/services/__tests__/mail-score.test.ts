import { describe, expect, it } from 'vitest'
import type { CandidateLine } from '@stockmanager/shared'
import { Telling, gelijk, scoreRegels, sleutel, veldNaam } from '../mail-score'

/**
 * Een scorer die zelf niet klopt is erger dan geen scorer: hij zou een
 * verslechtering als winst kunnen rapporteren. Vandaar deze tests.
 */

function regel(over: Partial<CandidateLine> = {}): CandidateLine {
  return {
    id: 'ai-1',
    ruweTekst: '',
    tekening: null,
    rev: null,
    positie: null,
    qty: null,
    bron: 'body',
    klantArtikel: null,
    klantPrijs: null,
    omschrijving: null,
    materiaal: null,
    materiaalDoorKlant: null,
    certificaat: null,
    attachmentFilename: null,
    bestanden: [],
    matches: [],
    status: 'nieuw',
    artikelId: null,
    handmatig: false,
    extractor: 'ai',
    bronTekst: '',
    gegrond: true,
    tekeningGegrond: true,
    bevestigd: null,
    bronBestand: null,
    zekerheid: 0,
    zekerheidRedenen: [],
    ...over,
  }
}

describe('sleutel', () => {
  it('negeert punt, streep en underscore, want die verschillen per systeem', () => {
    expect(sleutel('Guide Base 5/8')).toBe(sleutel('Guide base 5_8'))
    expect(sleutel('206413050_507957355_A_')).toBe('206413050507957355A')
  })

  it('laat geen enkel cijfer vallen — daar zit de dure fout', () => {
    expect(sleutel('2615-0090-0530')).not.toBe(sleutel('2615-0091-0530'))
  })
})

describe('gelijk', () => {
  it('vergelijkt tekst zonder te struikelen over hoofdletters en spaties', () => {
    expect(gelijk('RVS-316L rondstaf 30', 'rvs-316l  rondstaf 30')).toBe(true)
    expect(gelijk('RVS-316L rondstaf 30', 'RVS-316L rondstaf 40')).toBe(false)
  })

  it('telt een klein afrondingsverschil in een prijs niet als fout', () => {
    expect(gelijk(34.49, 34.49)).toBe(true)
    expect(gelijk(34.49, 34.5)).toBe(false)
  })

  it('behandelt verwacht-null als "leeg of afwezig"', () => {
    expect(gelijk(null, null)).toBe(true)
    expect(gelijk(null, undefined)).toBe(true)
    expect(gelijk(null, 'iets')).toBe(false)
  })

  it('onderscheidt false van null bij materiaalDoorKlant', () => {
    expect(gelijk(false, null)).toBe(false)
    expect(gelijk(false, false)).toBe(true)
  })
})

describe('veldNaam', () => {
  it('vertaalt de fixturenaam naar het veld op de regel', () => {
    // De eerste meting strandde hierop: "prijs" heet op de regel "klantPrijs",
    // dus las de scorer undefined en meldde hij een fout die er niet was.
    expect(veldNaam('prijs')).toBe('klantPrijs')
    expect(veldNaam('qty')).toBe('qty')
  })

  it('gooit bij een onbekende sleutel in plaats van hem stil te missen', () => {
    expect(() => veldNaam('prijsje')).toThrow(/Onbekend veld/)
  })
})

describe('scoreRegels', () => {
  it('leest de prijs uit klantPrijs', () => {
    const t = new Telling()
    scoreRegels(t, [{ tekening: 'ABC-1', prijs: 34.49 }], [regel({ tekening: 'ABC-1', klantPrijs: 34.49 })])
    expect(t.missers).toEqual([])
  })

  it('vergelijkt bestanden als de lijst namen die het werkelijk is', () => {
    const t = new Telling()
    scoreRegels(
      t,
      [{ tekening: 'ABC-1', bestanden: ['a.pdf', 'a.step'] }],
      [regel({ tekening: 'ABC-1', bestanden: ['a.pdf', 'a.step'] })]
    )
    expect(t.missers).toEqual([])
  })

  it('scoort alleen de velden die in het verwachte antwoord staan', () => {
    const t = new Telling()
    scoreRegels(
      t,
      [{ tekening: 'ABC-1', qty: 2 }],
      [regel({ tekening: 'ABC-1', qty: 2, materiaal: 'iets wat niemand nakijkt' })]
    )
    expect(t.missers).toEqual([])
    // aantal regels + de regel gevonden + qty
    expect(t.totaal).toBe(3)
    expect(t.goed).toBe(3)
  })

  it('vindt een regel ook terug via de ruwe tekst als het tekeningveld leeg bleef', () => {
    const t = new Telling()
    scoreRegels(t, [{ tekening: 'Lower foam pin' }], [regel({ ruweTekst: 'RVS 430 as, volgens tekening Lower foam pin' })])
    expect(t.missers).toEqual([])
  })

  it('meldt een regel die het model erbij verzonnen heeft', () => {
    const t = new Telling()
    scoreRegels(t, [{ tekening: 'ABC-1' }], [regel({ tekening: 'ABC-1' }), regel({ tekening: 'ABC-2' })])
    expect(t.missers).toContain('regel te veel: ABC-2')
    expect(t.goed).toBeLessThan(t.totaal)
  })

  it('meldt een gemiste regel zonder de rest ongescoord te laten', () => {
    const t = new Telling()
    scoreRegels(t, [{ tekening: 'ABC-1' }, { tekening: 'ABC-2', qty: 5 }], [regel({ tekening: 'ABC-1' })])
    expect(t.missers.some((m) => m.includes('ABC-2') && m.includes('niet teruggevonden'))).toBe(true)
  })

  it('telt bestanden als verzameling en meldt wat er mist', () => {
    const t = new Telling()
    scoreRegels(
      t,
      [{ tekening: 'ABC-1', bestanden: ['a.pdf', 'a.step'] }],
      [regel({ tekening: 'ABC-1', bestanden: ['a.step'] })]
    )
    expect(t.missers.some((m) => m.includes('mist a.pdf'))).toBe(true)
  })

  it('meldt een bestand dat aan de verkeerde regel hangt', () => {
    const t = new Telling()
    scoreRegels(
      t,
      [{ tekening: 'ABC-1', bestanden: ['a.pdf'] }],
      [regel({ tekening: 'ABC-1', bestanden: ['a.pdf', 'b.pdf'] })]
    )
    expect(t.missers.some((m) => m.includes('te veel b.pdf'))).toBe(true)
  })
})
