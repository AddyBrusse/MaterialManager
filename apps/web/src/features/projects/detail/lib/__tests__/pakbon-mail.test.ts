import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@stockmanager/shared'

vi.mock('../../../../../api/relaties', () => ({
  relatiesApi: {
    listSync: () => [
      { id: 'R1', naam: 'VL Machinebouw', contacten: [
        { id: 'c-prins', naam: 'J. Prins', email: 'j.prins@vl.nl' },
        { id: 'c-bos', naam: 'K. Bos', email: null },
      ] },
    ],
  },
}))
import { pakbonMailadres, waaromGeenPakbonMail } from '../pakbon-document'

const project = (deel: Partial<Project>) => ({ id: 'P', naam: 'Test', relatieId: 'R1', contactId: null, ...deel }) as Project

describe('pakbon mailen naar de contactpersoon van de order', () => {
  it('gaat naar de contactpersoon', () => {
    expect(pakbonMailadres(project({ contactId: 'c-prins' }))).toBe('j.prins@vl.nl')
    expect(waaromGeenPakbonMail(project({ contactId: 'c-prins' }))).toBeNull()
  })

  it('zegt wat er eerst moet als er geen contact of geen adres is', () => {
    expect(waaromGeenPakbonMail(project({ relatieId: null }))).toContain('nog geen klant')
    expect(waaromGeenPakbonMail(project({}))).toContain('geen contactpersoon op dit project')
    expect(waaromGeenPakbonMail(project({ contactId: 'c-bos' }))).toBe('K. Bos heeft geen mailadres. Vul het in bij de relatie VL Machinebouw.')
  })
})
