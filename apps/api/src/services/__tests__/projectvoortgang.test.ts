import { describe, it, expect } from 'vitest'
import {
  berekenVoortgang, balkSegmenten, stapStanden, basisRegels,
  type Project, type OfferteRegel, type ProductieOrder, type Paklijst, type Factuur,
} from '@stockmanager/shared'

// Hetzelfde project als in het ontwerp: 40 stuks besteld, 34 gemaakt, in twee
// pakbonnen 22 geleverd (10 + 12), 20 gefactureerd en 2 daarvan gecrediteerd.
// De getallen uit de artboards moeten hier na te rekenen zijn.

const NU = '2026-09-15T10:00:00.000Z'

function regel(id: string, qty: number, prijs: number): OfferteRegel {
  return {
    id, sortOrder: 1, artikelId: null, naam: `Artikel ${id}`, omschrijving: '',
    qty, eenheid: 'st', verkoopprijs: prijs, totaal: qty * prijs, bewerkingen: [],
  }
}

function order(id: string, regelId: string, qty: number, gereed: number): ProductieOrder {
  return {
    id, projectId: 'PRJ-1', offerteRegelId: regelId, artikelId: null,
    artikelNaam: 'x', qty, eenheid: 'st', aantalGereed: gereed, stappen: [],
    status: gereed >= qty ? 'gereed' : gereed > 0 ? 'in_productie' : 'gepland',
    createdAt: NU, updatedAt: NU,
  }
}

function pakbon(id: string, regels: { regelId: string; orderId: string; qty: number }[]): Paklijst {
  return {
    id, projectId: 'PRJ-1', notities: '', verzondenOp: NU, createdAt: NU,
    regels: regels.map(r => ({
      productieOrderId: r.orderId, offerteRegelId: r.regelId,
      artikelNaam: 'x', qty: r.qty, eenheid: 'st',
    })),
  }
}

function factuur(
  id: string, soort: 'factuur' | 'credit',
  regels: { regelId: string; qty: number; prijs: number }[],
  crediteert: string | null = null,
): Factuur {
  const sub = regels.reduce((t, r) => t + r.qty * r.prijs, 0)
  return {
    id, soort, crediteertFactuurId: crediteert, projectId: 'PRJ-1', offerteId: 'OFF-1',
    regels: regels.map(r => ({
      offerteRegelId: r.regelId, naam: 'x', qty: r.qty, eenheid: 'st',
      verkoopprijs: r.prijs, totaal: r.qty * r.prijs,
    })),
    btwPct: 21, subtotaal: sub, btwBedrag: sub * 0.21, totaalInclBtw: sub * 1.21,
    notities: '', vervaldatum: null, verzondenOp: NU, createdAt: NU,
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'PRJ-1', naam: 'Test', relatieId: null, contactId: null, klantRef: null,
    status: 'productie', statusReden: null, statusVorige: null, levertijdDatum: null,
    notities: '', offertes: [], opdrachtbevestiging: null, productieOrders: [],
    paklijsten: [], facturen: [], createdAt: NU, updatedAt: NU, ...over,
  }
}

function offerte(
  id: string, versie: number, status: Project['offertes'][number]['status'], regels: OfferteRegel[],
) {
  return {
    id, documentNr: 'OFF-2026-014', projectId: 'PRJ-1', versie, status, regels,
    notities: '', geldigTot: null, verzondenOp: null, geaccepteerdOp: null,
    createdAt: NU, updatedAt: NU,
  }
}

describe('berekenVoortgang', () => {
  const r = regel('R1', 40, 113.42)
  const p = project({
    offertes: [offerte('OFF-1', 1, 'geaccepteerd', [r])],
    productieOrders: [order('PROD-1', 'R1', 40, 34)],
    paklijsten: [
      pakbon('PL-004', [{ regelId: 'R1', orderId: 'PROD-1', qty: 10 }]),
      pakbon('PL-005', [{ regelId: 'R1', orderId: 'PROD-1', qty: 12 }]),
    ],
    facturen: [
      factuur('FACT-1', 'factuur', [{ regelId: 'R1', qty: 20, prijs: 113.42 }]),
      factuur('CRED-1', 'credit', [{ regelId: 'R1', qty: 2, prijs: 113.42 }], 'FACT-1'),
    ],
  })

  it('splitst het bestelde aantal in vier toestanden die optellen tot besteld', () => {
    const v = berekenVoortgang(p)
    const s = v.regels[0]
    expect(s.besteld).toBe(40)
    expect(s.gemaakt).toBe(34)
    expect(s.geleverd).toBe(22)
    expect(s.gefactureerd).toBe(20)
    expect(s.gecrediteerd).toBe(2)
    expect(s.klaar).toBe(12)      // 34 gemaakt − 22 geleverd
    expect(s.teMaken).toBe(6)     // 40 besteld − 34 gemaakt
    const som = balkSegmenten(s).reduce((t, x) => t + x.aantal, 0)
    expect(som).toBe(40)
  })

  it('rekent nog te factureren als geleverd min gefactureerd', () => {
    const v = berekenVoortgang(p).regels[0]
    // 22 geleverd, 20 gefactureerd → 2 staan nog open. Dat er ook 2 stuks
    // gecrediteerd zijn verandert daar niets aan: crediteren gaat over een
    // fáctuur, dus die 2 zaten al in de 20. Ze er nóg een keer van aftrekken
    // maakte hier eerst 0 van, en dan bleef er stilletjes een levering
    // onbetaald.
    expect(v.teFactureren).toBe(2)
    expect(v.teFacturerenBedrag).toBeCloseTo(2 * 113.42, 2)
  })

  it('houdt per pakbon vast wat die bon droeg', () => {
    const v = berekenVoortgang(p).regels[0]
    expect(v.leveringen).toEqual([
      { paklijstId: 'PL-004', qty: 10 },
      { paklijstId: 'PL-005', qty: 12 },
    ])
    expect(berekenVoortgang(p).aantalPakbonnen).toBe(2)
  })

  it('telt een order zonder ingevuld aantal die gereed staat voor zijn volle qty', () => {
    // Orders van vóór de kolom aantalGereed staan op 0. Zonder deze terugval
    // zou elk bestaand afgerond project ineens leeg lijken.
    const oud = project({
      offertes: [offerte('OFF-1', 1, 'geaccepteerd', [regel('R1', 12, 10)])],
      productieOrders: [{ ...order('PROD-1', 'R1', 12, 0), status: 'gereed' }],
    })
    expect(berekenVoortgang(oud).regels[0].gemaakt).toBe(12)
  })

  it('laat geleverd nooit hoger zijn dan gemaakt', () => {
    // Wat de deur uit is, is gemaakt — ook als niemand het aantal invulde.
    const scheef = project({
      offertes: [offerte('OFF-1', 1, 'geaccepteerd', [regel('R1', 20, 10)])],
      productieOrders: [order('PROD-1', 'R1', 20, 0)],
      paklijsten: [pakbon('PL-1', [{ regelId: 'R1', orderId: 'PROD-1', qty: 8 }])],
    })
    const v = berekenVoortgang(scheef).regels[0]
    expect(v.gemaakt).toBe(8)
    expect(v.klaar).toBe(0)
    expect(v.teMaken).toBe(12)
  })

  it('leidt de orderregel af via de productieorder als de pakbon hem niet vastlegde', () => {
    const oud = project({
      offertes: [offerte('OFF-1', 1, 'geaccepteerd', [regel('R1', 10, 5)])],
      productieOrders: [order('PROD-1', 'R1', 10, 10)],
      paklijsten: [{
        id: 'PL-1', projectId: 'PRJ-1', notities: '', verzondenOp: NU, createdAt: NU,
        regels: [{ productieOrderId: 'PROD-1', offerteRegelId: null, artikelNaam: 'x', qty: 4, eenheid: 'st' }],
      }],
    })
    expect(berekenVoortgang(oud).regels[0].geleverd).toBe(4)
  })
})

describe('basisRegels', () => {
  it('neemt de opdrachtbevestiging als die er is', () => {
    const obRegel = regel('OB-R', 5, 1)
    const p = project({
      offertes: [offerte('OFF-1', 1, 'geaccepteerd', [regel('R1', 99, 1)])],
      opdrachtbevestiging: {
        id: 'OB-1', projectId: 'PRJ-1', offerteId: 'OFF-1', regels: [obRegel],
        levertijdDatum: null, notities: '', status: 'verzonden', verzondenOp: NU,
        createdAt: NU, updatedAt: NU,
      },
    })
    expect(basisRegels(p).map(r => r.id)).toEqual(['OB-R'])
  })

  it('slaat vervallen offerteversies over', () => {
    const p = project({
      offertes: [
        offerte('OFF-1', 1, 'vervallen', [regel('OUD', 99, 1)]),
        offerte('OFF-2', 2, 'concept', [regel('NIEUW', 5, 1)]),
      ],
    })
    expect(basisRegels(p).map(r => r.id)).toEqual(['NIEUW'])
  })
})

describe('stapStanden', () => {
  const r = regel('R1', 40, 100)

  it('zet precies één stap op "nu"', () => {
    const gevallen: Project[] = [
      project({ offertes: [offerte('OFF-1', 1, 'concept', [r])] }),
      project({
        offertes: [offerte('OFF-1', 1, 'geaccepteerd', [r])],
        productieOrders: [order('PROD-1', 'R1', 40, 0)],
      }),
      project({
        offertes: [offerte('OFF-1', 1, 'geaccepteerd', [r])],
        productieOrders: [order('PROD-1', 'R1', 40, 40)],
      }),
    ]
    for (const p of gevallen) {
      const standen = stapStanden(p, berekenVoortgang(p))
      expect(Object.values(standen).filter(s => s === 'nu')).toHaveLength(1)
    }
  })

  it('wijst de beurt aan leveren zodra er iets klaarligt', () => {
    const p = project({
      offertes: [offerte('OFF-1', 1, 'geaccepteerd', [r])],
      productieOrders: [order('PROD-1', 'R1', 40, 34)],
    })
    const standen = stapStanden(p, berekenVoortgang(p))
    expect(standen.offerte).toBe('klaar')
    expect(standen.levering).toBe('nu')
    // Er valt nog 6 te maken, maar dat wachten is niet de eerste zorg: 34
    // stuks liggen in de hal en die brengen pas geld op als ze weggaan.
    expect(standen.productie).toBe('rust')
  })

  it('wijst de beurt aan factureren als alles geleverd is maar niet gefactureerd', () => {
    const p = project({
      offertes: [offerte('OFF-1', 1, 'geaccepteerd', [r])],
      productieOrders: [order('PROD-1', 'R1', 40, 40)],
      paklijsten: [pakbon('PL-1', [{ regelId: 'R1', orderId: 'PROD-1', qty: 40 }])],
    })
    const standen = stapStanden(p, berekenVoortgang(p))
    expect(standen.factuur).toBe('nu')
    expect(standen.levering).toBe('klaar')
  })

  it('zet alles behalve de offerte uit zolang er niets bevestigd is', () => {
    const p = project({ offertes: [offerte('OFF-1', 1, 'verzonden', [r])] })
    const standen = stapStanden(p, berekenVoortgang(p))
    expect(standen).toEqual({ offerte: 'nu', productie: 'uit', levering: 'uit', factuur: 'uit' })
  })
})

describe('een gecrediteerd stuk telt maar één keer', () => {
  // Dit ging eerst mis: `afgehandeld` was gefactureerd + gecrediteerd, terwijl
  // je een factuur crediteert en niet een levering. Die 2 stuks zaten dus al in
  // gefactureerd, en de balk telde 42 van de 40.
  const p = project({
    offertes: [offerte('OFF-1', 1, 'geaccepteerd', [regel('R1', 40, 113.42)])],
    productieOrders: [order('PROD-1', 'R1', 40, 34)],
    paklijsten: [pakbon('PL-1', [{ regelId: 'R1', orderId: 'PROD-1', qty: 22 }])],
    facturen: [
      factuur('FACT-1', 'factuur', [{ regelId: 'R1', qty: 22, prijs: 113.42 }]),
      factuur('CRED-1', 'credit', [{ regelId: 'R1', qty: 2, prijs: 113.42 }], 'FACT-1'),
    ],
  })

  it('laat de segmenten optellen tot precies het bestelde aantal', () => {
    const v = berekenVoortgang(p).regels[0]
    const segmenten = balkSegmenten(v)
    expect(segmenten.reduce((t, s) => t + s.aantal, 0)).toBe(40)
    expect(segmenten.map(s => [s.soort, s.aantal])).toEqual([
      ['afgehandeld', 22], ['teFactureren', 0], ['klaar', 12], ['teMaken', 6],
    ])
  })

  it('houdt het gecrediteerde aantal wel apart zichtbaar', () => {
    // Het verdwijnt niet: de regel moet kunnen zeggen dat er 2 retour kwamen.
    expect(berekenVoortgang(p).regels[0].gecrediteerd).toBe(2)
  })

  it('kan nooit meer crediteren dan er gefactureerd is', () => {
    const scheef = project({
      offertes: [offerte('OFF-1', 1, 'geaccepteerd', [regel('R1', 10, 5)])],
      productieOrders: [order('PROD-1', 'R1', 10, 10)],
      paklijsten: [pakbon('PL-1', [{ regelId: 'R1', orderId: 'PROD-1', qty: 10 }])],
      facturen: [
        factuur('FACT-1', 'factuur', [{ regelId: 'R1', qty: 4, prijs: 5 }]),
        factuur('CRED-1', 'credit', [{ regelId: 'R1', qty: 9, prijs: 5 }], 'FACT-1'),
      ],
    })
    expect(berekenVoortgang(scheef).regels[0].gecrediteerd).toBe(4)
  })
})
