import { describe, it, expect } from 'vitest'
import { classifyAttachment, hoortBij } from '../attachment-kind'

describe('classifyAttachment', () => {
  it('herkent het handelsdocument aan zijn naam', () => {
    expect(classifyAttachment('Purchase order_2604307_20260904_09-42.pdf')).toBe('document')
    expect(classifyAttachment('Inkooporder 12345.pdf')).toBe('document')
    expect(classifyAttachment('Offerteaanvraag RFQ-887.pdf')).toBe('document')
    expect(classifyAttachment('Algemene voorwaarden.pdf')).toBe('document')
  })

  it('herkent een tekening aan nummer en extensie', () => {
    expect(classifyAttachment('2604307-1-2615-0091-0530-1_20260904-0942.dwg')).toBe('tekening')
    expect(classifyAttachment('2026077-001.STEP')).toBe('tekening')
    expect(classifyAttachment('123456_rev B.pdf')).toBe('tekening')
  })

  it('herkent een offerteaanvraag, ook met een underscore ervoor', () => {
    // Gemeten op echte mail: dit werd als tekening gezien, waardoor de aanvraag
    // niet leidend was en elke tekening een eigen regel werd. `\brfq\b` matcht
    // niet tussen `_` en `R` — dezelfde val als in findRev.
    expect(classifyAttachment('Purchase offer_RFQ2600241_20260902_07-17.pdf')).toBe('document')
    expect(classifyAttachment('RFQ 2600241.pdf')).toBe('document')
  })

  it('ziet het aanvraagnummer in een tekeningnaam niet aan voor een document', () => {
    expect(classifyAttachment('RFQ2600241-1-2611-1456-0234-1_20260902-0717.dwg')).toBe('tekening')
    expect(classifyAttachment('RFQ2600241-1-2611-1456-0234-2_20260902-0717.pdf')).toBe('tekening')
  })

  it('gelooft de inhoud eerder dan de naam', () => {
    const tekst = 'BOERS METAALBEWERKING\nOfferteaanvraag RFQ2600241\nRegel Artikel Omschrijving Aantal'
    // Een naam die op een tekening lijkt, maar de tekst zegt wat het is.
    expect(classifyAttachment('2600241_20260902.pdf', tekst)).toBe('document')
    expect(classifyAttachment('2600241_20260902.pdf', null)).toBe('tekening')
  })

  it('houdt de rest erbuiten', () => {
    expect(classifyAttachment('image001.png')).toBe('overig')
    expect(classifyAttachment('smime.p7s')).toBe('overig')
    // Geen nummer erin: een document zonder herkenbare naam, geen tekening.
    expect(classifyAttachment('scan.pdf')).toBe('overig')
    // Wel een nummer, maar een bestandstype dat hier geen onderdeel aanduidt.
    expect(classifyAttachment('order 12345.xlsx')).toBe('overig')
  })
})

describe('hoortBij', () => {
  it('herkent ons tekeningnummer in de aanduiding van de klant', () => {
    expect(hoortBij('2604307-1-2615-0091-0530-1_20260904-0942.dwg', '2615-0091-0530')).toBe(true)
  })

  it('trekt zich niets aan van punten, streepjes en underscores', () => {
    expect(hoortBij('123.456.stp', '123-456')).toBe(true)
  })

  it('haalt geen ander onderdeel erbij dat één cijfer verschilt', () => {
    expect(hoortBij('2604307-1-2615-0091-0530-1.dwg', '2615-0090-0530')).toBe(false)
  })

  it('koppelt niet op een paar tekens', () => {
    expect(hoortBij('123.stp', '123')).toBe(false)
  })

  it('is onwaar zonder tekeningnummer', () => {
    expect(hoortBij('van-alles.stp', null)).toBe(false)
  })
})
