import { describe, it, expect } from 'vitest'
import { classifyAttachment, hoortBij, hangBestandenAan } from '../attachment-kind'
import type { CandidateLine, MailAttachment } from '@stockmanager/shared'

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

  it('ziet een meegestuurde mail nooit als handelsdocument', () => {
    // Waargenomen bij Global Factories: naast de inkooporder zat "Offerte
    // 2634-00014.msg", die op zijn naam als document werd geclassificeerd. Zou
    // die als leidend document gekozen worden, dan komen de regels uit de
    // verkeerde bron en staat de echte inkooporder buitenspel.
    expect(classifyAttachment('Offerte 2634-00014.msg')).toBe('overig')
    expect(classifyAttachment('Inkooporder 123.eml')).toBe('overig')
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

describe('een tekening zonder nummer in de naam', () => {
  // Kwam boven water op een bestelling van Veratio (21-05-2026): die klant noemt
  // zijn tekeningen bij naam in plaats van bij nummer. De oude regel eiste
  // minstens drie cijfers in de bestandsnaam, dus alle zeven tekeningen vielen
  // buiten de boot en werden nergens aan gehangen.
  it('herkent een tekenpakket-formaat ongeacht de naam', () => {
    expect(classifyAttachment('Motor Housing.step')).toBe('tekening')
    expect(classifyAttachment('Guide base 5_8.dwg')).toBe('tekening')
    expect(classifyAttachment('Lower foam pin.stp')).toBe('tekening')
  })

  it('herkent een pdf met een onderdeelnaam', () => {
    expect(classifyAttachment('Motor Housing_v2.pdf')).toBe('tekening')
    expect(classifyAttachment('Foam axle_upper roll.pdf')).toBe('tekening')
  })

  it('laat een pdf die alleen zegt wát het is met rust', () => {
    expect(classifyAttachment('scan.pdf')).toBe('overig')
    expect(classifyAttachment('tekeningen.pdf')).toBe('overig')
    expect(classifyAttachment('Bijlage 2.pdf')).toBe('overig')
  })

  it('koppelt op de naam, ook met andere scheidingstekens', () => {
    // De order schrijft "Guide Base 5/8", het bestand heet "Guide base 5_8".
    expect(hoortBij('Guide base 5_8.pdf', 'Guide Base 5/8')).toBe(true)
    expect(hoortBij('Motor Housing.step', 'Motor housing_v2')).toBe(true)
  })
})

describe('hangBestandenAan', () => {
  const att = (filename: string): MailAttachment => ({
    filename, contentType: 'application/octet-stream', sizeBytes: 1,
    path: `/x/${filename}`, tekst: null, isEmbeddedMessage: false,
  })
  const regel = (over: Partial<CandidateLine> = {}): CandidateLine => ({
    id: 'r1', ruweTekst: 'x', tekening: null, rev: null, positie: null, qty: 1,
    bron: 'pdf', klantArtikel: null, klantPrijs: null, omschrijving: null,
    attachmentFilename: null, bestanden: [], artikelId: null, artikelNaam: null,
    matchStatus: 'geen', matchScore: 0, matchReden: '', zekerheid: 0,
    gegrond: null, tekeningGegrond: null, bevestigd: null, vanAndereKlant: false,
    ...over,
  } as CandidateLine)

  it('koppelt op het tekeningnummer in de bestandsnaam', () => {
    const r = regel({ tekening: '2615-0091-0530' })
    hangBestandenAan([r], [att('2604307-1-2615-0091-0530-1.dwg'), att('iets-anders-123456.stp')])
    expect(r.bestanden).toEqual(['2604307-1-2615-0091-0530-1.dwg'])
  })

  it('koppelt de bijlage waar het model zegt dat de regel uit komt', () => {
    // De klant noemt zijn bestand anders dan zijn tekeningnummer; het model weet
    // wél uit welke bijlage het de regel haalde. Dat is geen gok.
    const r = regel({ tekening: 'ABC-999', attachmentFilename: 'onderdeel-778899.dwg' })
    hangBestandenAan([r], [att('onderdeel-778899.dwg')])
    expect(r.bestanden).toEqual(['onderdeel-778899.dwg'])
  })

  it('geeft een enkele regel zonder treffer alsnog de tekeningen uit de mail', () => {
    // Anders wordt er een nieuw artikel aangemaakt terwijl de tekening in de
    // mailmap blijft liggen — precies waarvoor de klant hem meestuurde.
    const r = regel({ tekening: null })
    hangBestandenAan([r], [att('losse-tekening-4455.pdf'), att('model-4455.stp')])
    expect(r.bestanden).toEqual(['losse-tekening-4455.pdf', 'model-4455.stp'])
  })

  it('laat een overgebleven tekening liggen als de regel er al een heeft', () => {
    // Heeft stap 1 op het nummer gematcht, dan is een overgebleven tekening
    // juist een aanwijzing dat die ergens anders bij hoort.
    const r = regel({ tekening: '2615-0091-0530' })
    hangBestandenAan([r], [att('2604307-1-2615-0091-0530-1.dwg'), att('iets-anders-123456.stp')])
    expect(r.bestanden).not.toContain('iets-anders-123456.stp')
  })

  it('hangt het leidende document nooit aan een regel', () => {
    // Een inkooporder met een cryptische naam en zonder tekstlaag is van buiten
    // niet van een tekening te onderscheiden; dat hij leidend is, is genoeg.
    const r = regel({ tekening: 'PO-2615-0091' })
    hangBestandenAan([r], [att('PO-2615-0091.pdf')], 'PO-2615-0091.pdf')
    expect(r.bestanden).toEqual([])
  })

  it('gokt niet bij meerdere regels', () => {
    const a = regel({ id: 'a', tekening: 'AAA-111111' })
    const b = regel({ id: 'b', tekening: 'BBB-222222' })
    hangBestandenAan([a, b], [att('naamloze-tekening-9988.pdf')])
    expect(a.bestanden).toEqual([])
    expect(b.bestanden).toEqual([])
  })
})
