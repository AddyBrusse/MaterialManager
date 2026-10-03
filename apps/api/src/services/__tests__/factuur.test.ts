import { describe, it, expect } from 'vitest'
import {
  voorstelFactuur, waaromNietFactuur, factuurRegels, factuurBedragen, voorstelCredit, waaromNietCredit,
  waaromNietFactuurVersturen, factuurMailadres, vervaldatumVanaf, isVervallen, openstaandBedrag, statusNaLevering,
  type Project, type ProductieOrder, type Paklijst, type Factuur,
} from '@stockmanager/shared'

const NU = '2026-10-03T10:00:00.000Z'

function order(id: string, p: Partial<ProductieOrder> = {}): ProductieOrder {
  return {
    id, projectId: 'PRJ', offerteRegelId: `r-${id}`, artikelId: null, artikelNaam: id, qty: 20, eenheid: 'st',
    aantalGereed: 0, status: 'gereed', createdAt: NU, updatedAt: NU, stappen: [], ...p,
  }
}
function pakbon(id: string, regels: [string, number][], verzonden: boolean): Paklijst {
  return {
    id, projectId: 'PRJ', notities: '', createdAt: NU, verzondenOp: verzonden ? NU : null,
    regels: regels.map(([r, qty]) => ({ productieOrderId: '', offerteRegelId: r, artikelNaam: r, qty, eenheid: 'st' })),
  }
}
function factuur(id: string, regels: [string, number, number][], over: Partial<Factuur> = {}): Factuur {
  const r = regels.map(([o, qty, prijs]) => ({ offerteRegelId: o, naam: o, qty, eenheid: 'st', verkoopprijs: prijs, totaal: qty * prijs }))
  return {
    id, soort: 'factuur', crediteertFactuurId: null, projectId: 'PRJ', offerteId: 'OFF', regels: r, btwPct: 21,
    ...factuurBedragen(r), notities: '', vervaldatum: null, verzondenOp: null, naarEmail: null, betaaldOp: null,
    createdAt: NU, ...over,
  }
}
/** Asbus 20 × € 10, Pen 5 × € 2. */
function project(paklijsten: Paklijst[], facturen: Factuur[] = [], status: Project['status'] = 'productie'): Project {
  return {
    id: 'PRJ', naam: 'Test', relatieId: null, contactId: null, klantRef: null, status,
    statusReden: null, statusVorige: null, levertijdDatum: null, notities: '', offertes: [],
    paklijsten, facturen, createdAt: NU, updatedAt: NU,
    productieOrders: [order('A'), order('B', { qty: 5 })],
    opdrachtbevestiging: {
      regels: [
        { id: 'r-A', naam: 'Asbus', qty: 20, eenheid: 'st', verkoopprijs: 10 },
        { id: 'r-B', naam: 'Pen', qty: 5, eenheid: 'st', verkoopprijs: 2 },
      ],
    } as never,
  }
}

describe('voorstelFactuur', () => {
  it('neemt alles wat verstuurd en nog niet gefactureerd is, ook over meerdere pakbonnen', () => {
    const p = project([pakbon('PL1', [['r-A', 10]], true), pakbon('PL2', [['r-A', 6], ['r-B', 5]], true)])
    expect(voorstelFactuur(p)).toEqual([
      { offerteRegelId: 'r-A', qty: 16, verkoopprijs: 10 },
      { offerteRegelId: 'r-B', qty: 5, verkoopprijs: 2 },
    ])
  })

  it('telt een concept-pakbon niet als geleverd', () => {
    const p = project([pakbon('PL1', [['r-A', 10]], false)])
    expect(voorstelFactuur(p)).toEqual([])
    expect(waaromNietFactuur(p, [])).toContain('Verstuur eerst een pakbon')
  })
})

describe('waaromNietFactuur', () => {
  const p = project([pakbon('PL1', [['r-A', 10]], true)], [factuur('F1', [['r-A', 4, 10]])])

  it('weigert meer dan verstuurd en nog niet gefactureerd', () => {
    expect(waaromNietFactuur(p, [{ offerteRegelId: 'r-A', qty: 7, verkoopprijs: 10 }]))
      .toBe('Asbus: er zijn er maar 6 verstuurd en nog niet gefactureerd.')
  })

  it('telt de eigen stuks van het concept weer als open', () => {
    expect(waaromNietFactuur(p, [{ offerteRegelId: 'r-A', qty: 10, verkoopprijs: 9.5 }], { factuurId: 'F1' })).toBeNull()
  })

  it('mag een andere prijs, maar geen negatieve', () => {
    expect(waaromNietFactuur(p, [{ offerteRegelId: 'r-A', qty: 1, verkoopprijs: -1 }])).toContain('negatief')
  })
})

describe('bedragen', () => {
  it('rekent 21 % btw op centen afgerond', () => {
    const p = project([])
    const r = factuurRegels(p, [{ offerteRegelId: 'r-A', qty: 3, verkoopprijs: 33.333 }])
    expect(r[0]).toMatchObject({ naam: 'Asbus', totaal: 100 })
    expect(factuurBedragen(r)).toEqual({ subtotaal: 100, btwBedrag: 21, totaalInclBtw: 121 })
  })
})

describe('credit', () => {
  const verstuurd = factuur('F1', [['r-A', 10, 10]], { verzondenOp: NU })

  it('stelt voor wat er nog te crediteren valt, en houdt rekening met eerdere credits', () => {
    const eerder = factuur('C1', [['r-A', 3, 10]], { soort: 'credit', crediteertFactuurId: 'F1' })
    const p = project([], [verstuurd, eerder])
    expect(voorstelCredit(p, 'F1')).toEqual([{ offerteRegelId: 'r-A', qty: 7, verkoopprijs: 10 }])
    expect(waaromNietCredit(p, 'F1', [{ offerteRegelId: 'r-A', qty: 8, verkoopprijs: 10 }])).toContain('maar 7')
  })

  it('crediteert alleen een verstuurde factuur', () => {
    const p = project([], [factuur('F1', [['r-A', 10, 10]])])
    expect(waaromNietCredit(p, 'F1', [])).toContain('nog een concept')
  })
})

describe('versturen en betalen', () => {
  it('vraagt een mailadres', () => {
    const p = project([], [factuur('F1', [['r-A', 1, 10]])])
    expect(waaromNietFactuurVersturen(p, 'F1', null)).toContain('geen mailadres')
    expect(waaromNietFactuurVersturen(p, 'F1', 'administratie@klant.nl')).toBeNull()
  })

  it('stuurt naar het factuuradres van de klant voor de contactpersoon', () => {
    expect(factuurMailadres({ email: 'info@k.nl', emailFactuur: 'administratie@k.nl' }, { email: 'jan@k.nl' })).toBe('administratie@k.nl')
    expect(factuurMailadres({ email: 'info@k.nl', emailFactuur: null }, { email: 'jan@k.nl' })).toBe('jan@k.nl')
    expect(factuurMailadres({ email: 'info@k.nl', emailFactuur: '' }, null)).toBe('info@k.nl')
  })

  it('rekent de vervaldatum met de termijn van de klant', () => {
    expect(vervaldatumVanaf(new Date('2026-10-03T10:00:00Z'), 14)).toBe('2026-10-17')
    expect(vervaldatumVanaf(new Date('2026-10-03T10:00:00Z'), null)).toBe('2026-11-02')
  })

  it('weet wat vervallen en wat openstaand is', () => {
    const f = factuur('F1', [['r-A', 10, 10]], { verzondenOp: NU, vervaldatum: '2026-10-01' })
    const c = factuur('C1', [['r-A', 2, 10]], { soort: 'credit', crediteertFactuurId: 'F1', verzondenOp: NU })
    expect(isVervallen(f, new Date(NU))).toBe(true)
    expect(isVervallen({ ...f, betaaldOp: NU }, new Date(NU))).toBe(false)
    expect(openstaandBedrag(project([], [f, c]))).toBe(96.8)
  })
})

describe('status Gefactureerd', () => {
  const pakbonnen = [pakbon('PL1', [['r-A', 20], ['r-B', 5]], true)]
  const orders = [order('A', { aantalGereed: 20 }), order('B', { qty: 5 })]

  it('pas als alles geleverd en op een verstuurde factuur staat', () => {
    const concept = factuur('F1', [['r-A', 20, 10], ['r-B', 5, 2]])
    const p = { ...project(pakbonnen, [concept], 'verzonden'), productieOrders: orders }
    expect(statusNaLevering(p)).toBe('verzonden')
    const verstuurd = { ...p, facturen: [{ ...concept, verzondenOp: NU }] }
    expect(statusNaLevering(verstuurd)).toBe('gefactureerd')
  })
})
