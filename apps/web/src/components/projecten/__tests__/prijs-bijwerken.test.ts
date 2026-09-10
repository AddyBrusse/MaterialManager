import { describe, expect, it } from 'vitest'
import { berekenBijwerkingen, isBijTeWerken, samenvatting } from '../prijs-bijwerken'
import type { PrijsBronnen } from '../../../utils/artikel-prijs'
import type { Article } from '../../../api/articles'
import type { OfferteRegel } from '@stockmanager/shared'

const bronnen: PrijsBronnen = {
  grades: [{ id: 'g1', name: 'S235', densityKgM3: 7850, pricePerKg: 2 } as never],
  profiles: [{ id: 'p1', name: 'Rond', volumeFormula: 'round' }],
  machines: [{ id: 'm1', name: 'Draaibank', machineRatePerHour: 60, operatorRatePerHour: 0 } as never],
}

function artikel(partial: Partial<Article>): Article {
  return {
    id: 'ART-1', naam: 'Testartikel', klant: null, relatieId: null, contactId: null,
    tekening: null, rev: null, drawingPath: null, photoPath: null, recipe: null,
    operations: [], notes: { workholding: '', general: '' }, attachments: [],
    estimate: null, locatie: null, currentStock: 0, minStock: null, maxStock: null,
    createdAt: '', updatedAt: '',
    ...partial,
  } as Article
}

/** Eén machinestap van 60 minuten insteltijd: 1 uur à 60 = 60 kostprijs bij qty 1. */
function metCalculatie(id: string, marginPct = 25): Article {
  return artikel({
    id,
    estimate: {
      marginPct,
      updatedAt: '',
      nodes: [{ id: 'n1', type: 'machine', name: 'Draaibank', machineId: 'm1', setupMin: 60, steps: [] }],
    },
  } as Partial<Article>)
}

function regel(over: Partial<OfferteRegel> = {}): OfferteRegel {
  return {
    id: 'r1', sortOrder: 0, artikelId: 'ART-1', naam: 'Testartikel', omschrijving: '',
    qty: 1, eenheid: 'st', verkoopprijs: 0, totaal: 0, bewerkingen: [],
    ...over,
  }
}

describe('berekenBijwerkingen', () => {
  it('noemt een regel die op nul stond "nieuw" — daar is niets te verliezen', () => {
    const [b] = berekenBijwerkingen([regel()], [metCalculatie('ART-1')], bronnen)
    expect(b.reden).toBe('nieuw')
    expect(b.oudeVerkoopprijs).toBe(0)
    expect(b.nieuweVerkoopprijs).toBe(75) // 60 kostprijs + 25% marge
    expect(b.nieuweBewerkingen).toEqual(['Draaibank'])
  })

  it('noemt een regel met een afwijkende prijs "gewijzigd" — daar wél', () => {
    const [b] = berekenBijwerkingen([regel({ verkoopprijs: 84 })], [metCalculatie('ART-1')], bronnen)
    expect(b.reden).toBe('gewijzigd')
    expect(b.oudeVerkoopprijs).toBe(84)
    expect(b.nieuweVerkoopprijs).toBe(75)
  })

  it('noemt een gelijke prijs "gelijk" en laat hem met rust', () => {
    const [b] = berekenBijwerkingen([regel({ verkoopprijs: 75 })], [metCalculatie('ART-1')], bronnen)
    expect(b.reden).toBe('gelijk')
    expect(isBijTeWerken(b)).toBe(false)
  })

  it('ziet een verschil van één cent wél, maar een afrondingsrestje niet', () => {
    const [eenCent] = berekenBijwerkingen([regel({ verkoopprijs: 75.01 })], [metCalculatie('ART-1')], bronnen)
    expect(eenCent.reden).toBe('gewijzigd')

    const [restje] = berekenBijwerkingen(
      [regel({ verkoopprijs: 75.000000001 })], [metCalculatie('ART-1')], bronnen
    )
    expect(restje.reden).toBe('gelijk')
  })

  it('rekent bij het aantal van de regel, want instelkosten gelden per batch', () => {
    const [een] = berekenBijwerkingen([regel({ qty: 1 })], [metCalculatie('ART-1')], bronnen)
    const [tien] = berekenBijwerkingen([regel({ qty: 10 })], [metCalculatie('ART-1')], bronnen)
    expect(tien.nieuweVerkoopprijs).toBeLessThan(een.nieuweVerkoopprijs)
  })

  it('meldt een artikel zonder recept in plaats van er nul van te maken', () => {
    const [b] = berekenBijwerkingen([regel({ verkoopprijs: 40 })], [artikel({ id: 'ART-1' })], bronnen)
    expect(b.reden).toBe('geen-calculatie')
    expect(b.nieuweVerkoopprijs).toBe(40)
    expect(isBijTeWerken(b)).toBe(false)
  })

  it('laat een handmatige regel zonder artikel met rust', () => {
    const [b] = berekenBijwerkingen([regel({ artikelId: null, verkoopprijs: 250 })], [], bronnen)
    expect(b.reden).toBe('geen-artikel')
    expect(b.nieuweVerkoopprijs).toBe(250)
  })

  it('behandelt een verdwenen artikel als "niets uit te rekenen", niet als fout', () => {
    const [b] = berekenBijwerkingen([regel({ artikelId: 'ART-WEG', verkoopprijs: 12 })], [], bronnen)
    expect(b.reden).toBe('geen-artikel')
    expect(b.nieuweVerkoopprijs).toBe(12)
  })

  it('raakt de bewerkingen alleen aan waar ook de prijs vandaan komt', () => {
    const [zonder] = berekenBijwerkingen(
      [regel({ bewerkingen: ['Oude stap'] })], [artikel({ id: 'ART-1' })], bronnen
    )
    // Geen calculatie: de bevroren stappen blijven staan zoals ze waren.
    expect(zonder.nieuweBewerkingen).toEqual(['Oude stap'])
  })
})

describe('samenvatting', () => {
  it('telt per soort en zegt hoeveel er werkelijk te doen is', () => {
    const regels = [
      regel({ id: 'r1', artikelId: 'ART-1' }),
      regel({ id: 'r2', artikelId: 'ART-2', verkoopprijs: 84 }),
      regel({ id: 'r3', artikelId: 'ART-3', verkoopprijs: 75 }),
      regel({ id: 'r4', artikelId: 'ART-4' }),
      regel({ id: 'r5', artikelId: null, verkoopprijs: 250 }),
    ]
    const artikelen = [metCalculatie('ART-1'), metCalculatie('ART-2'), metCalculatie('ART-3'), artikel({ id: 'ART-4' })]

    expect(samenvatting(berekenBijwerkingen(regels, artikelen, bronnen))).toEqual({
      nieuw: 1,
      gewijzigd: 1,
      gelijk: 1,
      zonderCalculatie: 1,
      zonderArtikel: 1,
      bijTeWerken: 2,
    })
  })
})
