import { describe, it, expect } from 'vitest'
import { assertSharedGebouwd } from '../shared-check'
import { MAIL_IMPORT_STATUSES, MAIL_INTENTS } from '@stockmanager/shared'

describe('assertSharedGebouwd', () => {
  it('laat een verse build gewoon door', () => {
    expect(() => assertSharedGebouwd()).not.toThrow()
  })

  it('de constanten waarop de routes bouwen zijn echte, gevulde lijsten', () => {
    // Precies wat er misging: een verouderde dist gaf `undefined`, waarna
    // z.enum(undefined) een enum zonder waarden opleverde die pas bij het
    // eerste verzoek klapte — met een melding die niets over de oorzaak zei.
    for (const lijst of [MAIL_IMPORT_STATUSES, MAIL_INTENTS]) {
      expect(Array.isArray(lijst)).toBe(true)
      expect(lijst.length).toBeGreaterThan(0)
    }
  })
})
