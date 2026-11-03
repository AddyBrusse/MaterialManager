import { describe, it, expect } from 'vitest'
import type { Company } from '@stockmanager/shared'
import { maakDocument, TEST_WATERMERK, type DocumentSpec } from '../document/opmaak'

// Testomgeving (2026-11-03): elke pagina van een testdocument draagt het watermerk.
const spec: DocumentSpec = {
  titel: 'Offerte',
  meta: [['Nummer', 'OFF-2026-001']],
  partij: { label: 'Klant', naam: 'Klant BV', regels: [] },
  kenmerken: [],
  kolommen: [{ kop: 'Omschrijving', stijl: 'omschrijving' }],
  regels: Array.from({ length: 80 }, (_, i) => ({ cellen: [`Regel ${i + 1}`] })),
  voetregel: 'Offerte OFF-2026-001',
}
const co = { naam: 'Boers Metaal' } as unknown as Company
const assets = { fonts: [], logo: null }

/** De tekst-opdrachten van een pagina, zoals jsPDF ze vóór het comprimeren bewaart. */
function pagina(doc: ReturnType<typeof maakDocument>, i: number): string {
  return (doc.internal as unknown as { pages: string[][] }).pages[i].join('\n')
}

describe('watermerk in de testomgeving', () => {
  it('staat op elke pagina van een testdocument', () => {
    const doc = maakDocument(spec, co, assets, { test: true })
    const n = doc.getNumberOfPages()
    expect(n).toBeGreaterThan(1)
    for (let i = 1; i <= n; i++) {
      const p = pagina(doc, i)
      expect(p).toContain('TEST')
      expect(p).toContain('NIET GELDIG')
    }
    expect(TEST_WATERMERK).toBe('TEST — NIET GELDIG')
  })

  it('staat niet op een echt document', () => {
    const doc = maakDocument(spec, co, assets, { test: false })
    for (let i = 1; i <= doc.getNumberOfPages(); i++) expect(pagina(doc, i)).not.toContain('NIET GELDIG')
  })
})
