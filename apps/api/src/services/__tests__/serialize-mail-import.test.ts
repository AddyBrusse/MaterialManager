import { describe, expect, it } from 'vitest'
import { serializeMailImport } from '../mail-import'

/**
 * Een rij die door een oudere versie is weggeschreven mist de velden die er
 * later bij kwamen. Die staan als JSON in de database, dus een cast levert
 * `undefined` op in plaats van de default uit het schema — en het reviewscherm
 * deed `line.bestanden.map(...)` en werd wit (waargenomen 2026-09-10).
 */

function rij(over: Record<string, unknown> = {}) {
  return {
    id: 'mi-1',
    source: 'drop',
    messageId: null,
    dedupeKey: 'k',
    afzenderNaam: null,
    afzenderEmail: null,
    onderwerp: 'Bestelling',
    ontvangenOp: null,
    bodyText: null,
    bodyHtmlPath: null,
    rawPath: null,
    bijlagen: [],
    resolutie: null,
    kandidaten: [],
    extractie: null,
    relatieId: null,
    contactId: null,
    projectId: null,
    klantRef: null,
    leverdatum: null,
    intent: 'onbekend',
    status: 'nieuw',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    ...over,
  } as unknown as Parameters<typeof serializeMailImport>[0]
}

/** Zoals een regel eruitzag vóór bestanden, materiaal en certificaat bestonden. */
const OUDE_REGEL = {
  id: 'ai-1',
  ruweTekst: '2615-0090-0530 aantal 10',
  tekening: '2615-0090-0530',
  rev: null,
  positie: 1,
  qty: 10,
  bron: 'pdf',
  matches: [],
  status: 'nieuw',
  artikelId: null,
  handmatig: false,
  extractor: 'ai',
  bronTekst: '2615-0090-0530 aantal 10',
  gegrond: true,
  zekerheid: 0.8,
  zekerheidRedenen: [],
  attachmentFilename: null,
}

describe('serializeMailImport', () => {
  it('vult ontbrekende velden van een oude regel aan met hun default', () => {
    const uit = serializeMailImport(rij({ kandidaten: [OUDE_REGEL] }))
    const regel = uit.kandidaten[0]

    // Hier ging het scherm op stuk: undefined in plaats van een lege lijst.
    expect(regel.bestanden).toEqual([])
    expect(regel.materiaal).toBeNull()
    expect(regel.certificaat).toBeNull()
    expect(regel.klantPrijs).toBeNull()
    // En wat er wél in stond blijft staan.
    expect(regel.tekening).toBe('2615-0090-0530')
    expect(regel.qty).toBe(10)
  })

  it('vult ontbrekende velden van een oud rapport aan', () => {
    const uit = serializeMailImport(
      rij({
        extractie: {
          aiGebruikt: true,
          model: 'claude-opus-5',
          zekerheid: 0.8,
          laagsteZekerheid: 0.7,
          ongegrondeRegels: 0,
          foutmelding: null,
        },
      })
    )
    expect(uit.extractie?.titelblokGelezen).toEqual([])
    expect(uit.extractie?.volledigMeegestuurd).toEqual([])
    expect(uit.extractie?.gescandeBijlagen).toEqual([])
    expect(uit.extractie?.model).toBe('claude-opus-5')
  })

  it('laat een onleesbare regel weg in plaats van het scherm om te leggen', () => {
    const uit = serializeMailImport(rij({ kandidaten: [OUDE_REGEL, { id: 'kapot' }] }))
    expect(uit.kandidaten).toHaveLength(1)
    expect(uit.kandidaten[0].id).toBe('ai-1')
  })

  it('geeft null terug bij een rapport dat niet te lezen is', () => {
    expect(serializeMailImport(rij({ extractie: { onzin: true } })).extractie).toBeNull()
  })

  it('laat een lege import met rust', () => {
    const uit = serializeMailImport(rij())
    expect(uit.kandidaten).toEqual([])
    expect(uit.extractie).toBeNull()
  })
})
