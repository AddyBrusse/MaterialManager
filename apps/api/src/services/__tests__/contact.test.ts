import { describe, it, expect } from 'vitest'
import { suggestContact } from '../mail-import'

const contacten = [
  { id: 'c1', naam: 'Dick Boer', email: 'DickBoer@stinis.com' },
  { id: 'c2', naam: 'Inkoop', email: 'inkoop@stinis.com' },
]

describe('suggestContact', () => {
  it('vindt het contact op e-mailadres, hoofdletters maken niet uit', () => {
    expect(suggestContact('dickboer@stinis.com', contacten)).toBe('c1')
  })

  it('gokt niet op een naam of een domein', () => {
    expect(suggestContact('iemandanders@stinis.com', contacten)).toBeNull()
  })

  it('kiest niets bij twee contacten met hetzelfde adres', () => {
    const dubbel = [...contacten, { id: 'c3', naam: 'Dick B.', email: 'DickBoer@stinis.com' }]
    expect(suggestContact('dickboer@stinis.com', dubbel)).toBeNull()
  })

  it('overleeft een contactenlijst die als string is weggeschreven', () => {
    expect(suggestContact('inkoop@stinis.com', JSON.stringify(contacten))).toBe('c2')
  })

  it('geeft null zonder adres', () => {
    expect(suggestContact(null, contacten)).toBeNull()
  })
})
