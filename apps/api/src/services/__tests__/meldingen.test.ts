import { describe, it, expect } from 'vitest'
import { prijsaanvraagMelding, productieMeldingen, sorteerMeldingen, type OrderVoorMelding } from '@stockmanager/shared'

const order = (p: Partial<OrderVoorMelding> = {}): OrderVoorMelding => ({
  projectId: 'PRJ-1', orderId: 'PROD-1', artikelNaam: 'Bolt', inDeHal: true, materiaalOntbreekt: false,
  bestelRegels: [], materiaalVerwacht: null, materiaalOnbekend: false, start: '2026-10-14', netBinnen: false, ...p,
})
const regel = (status: string) => ({ id: `r-${status}`, status, materiaal: 'Ø30', stuks: 3, lengteMm: 3000 })

describe('productieMeldingen', () => {
  it('een tekort dat nog niet besteld is: rood, tot het besteld is', () => {
    const m = productieMeldingen(order({ bestelRegels: [regel('te_bestellen')] }))
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ ernst: 'rood', titel: 'Tekort, nog niet besteld', link: '/bestellingen?regel=r-te_bestellen' })
    expect(productieMeldingen(order({ bestelRegels: [regel('besteld')], materiaalVerwacht: '2026-10-13' }))).toEqual([])
  })

  it('besteld maar komt na de start: rood', () => {
    const m = productieMeldingen(order({ bestelRegels: [regel('besteld')], materiaalVerwacht: '2026-10-16' }))
    expect(m[0]).toMatchObject({ ernst: 'rood', titel: 'Materiaal komt na de start' })
  })

  it('besteld zonder leverdatum: oranje', () => {
    expect(productieMeldingen(order({ bestelRegels: [regel('besteld')], materiaalOnbekend: true }))[0].ernst).toBe('oranje')
  })

  it('in de hal zonder vastgelegd materiaal: rood', () => {
    expect(productieMeldingen(order({ materiaalOntbreekt: true }))[0].titel).toBe('Materiaal ligt niet vast')
  })

  it('orders in voorbereiding geven geen meldingen', () => {
    expect(productieMeldingen(order({ inDeHal: false, materiaalOntbreekt: true }))).toEqual([])
  })

  it('net binnen en niets meer open: groen', () => {
    expect(productieMeldingen(order({ netBinnen: true, bestelRegels: [regel('ontvangen')] }))[0].ernst).toBe('groen')
  })
})

describe('prijsaanvraagMelding', () => {
  const a = { aanvraagId: 'PA-2026-004', leverancierNaam: 'Van den Berg', verzondenOp: '2026-10-05', heeftAntwoord: false, nogOpen: true }
  it('na 4 werkdagen zonder antwoord', () => {
    expect(prijsaanvraagMelding(a, '2026-10-08')).toBeNull()
    expect(prijsaanvraagMelding(a, '2026-10-09')).toMatchObject({ ernst: 'oranje', titel: 'Geen antwoord op PA-2026-004' })
  })
  it('niet als er een antwoord is, of niets meer open staat', () => {
    expect(prijsaanvraagMelding({ ...a, heeftAntwoord: true }, '2026-10-20')).toBeNull()
    expect(prijsaanvraagMelding({ ...a, nogOpen: false }, '2026-10-20')).toBeNull()
  })
})

describe('sorteerMeldingen', () => {
  it('rood eerst', () => {
    const m = [...productieMeldingen(order({ netBinnen: true })), ...productieMeldingen(order({ materiaalOntbreekt: true }))]
    expect(sorteerMeldingen(m).map((x) => x.ernst)).toEqual(['rood', 'groen'])
  })
})
