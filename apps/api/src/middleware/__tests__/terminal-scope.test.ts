import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { terminalScope } from '../terminal-scope'

/**
 * De rolafscherming van het machinescherm.
 *
 * Dit is een grens, geen opsmuk: de app toont kostprijzen, marges en
 * klantgegevens, en een pc in de hal waar iedereen langsloopt hoort daar niet
 * bij te kunnen. De toelaatlijst is bewust een toelaatlijst — een nieuwe route
 * is dan standaard dicht voor de terminal, niet standaard open.
 */
function doe(rol: string, method: string, path: string) {
  const req = { user: { id: 'u', name: 'n', role: rol }, method, path } as unknown as Request
  const next = vi.fn() as unknown as NextFunction
  terminalScope(req, {} as Response, next)
  const arg = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]
  return arg as { status?: number; code?: string } | undefined
}

describe('terminalScope', () => {
  it('laat gewone gebruikers en admins volledig door', () => {
    expect(doe('user', 'GET', '/grades')).toBeUndefined()
    expect(doe('admin', 'POST', '/articles')).toBeUndefined()
    expect(doe('admin', 'GET', '/nacalculatie/project/PRJ-1')).toBeUndefined()
  })

  it('laat een terminal bij de klok — het enige waar hij voor bestaat', () => {
    expect(doe('terminal', 'GET', '/tijdregistratie/lopend')).toBeUndefined()
    expect(doe('terminal', 'POST', '/tijdregistratie/start')).toBeUndefined()
    expect(doe('terminal', 'POST', '/tijdregistratie/abc/stop')).toBeUndefined()
  })

  it('laat een terminal lezen wat hij aan de machine nodig heeft', () => {
    expect(doe('terminal', 'GET', '/users')).toBeUndefined()
    expect(doe('terminal', 'GET', '/projects')).toBeUndefined()
    expect(doe('terminal', 'GET', '/machines')).toBeUndefined()
    expect(doe('terminal', 'GET', '/articles/ART-0001')).toBeUndefined()
    expect(doe('terminal', 'GET', '/reservations')).toBeUndefined()
  })

  it('houdt prijzen en klantgegevens weg bij het scherm in de hal', () => {
    for (const pad of ['/grades', '/relaties', '/settings', '/nacalculatie/artikelen', '/articles', '/movements']) {
      const fout = doe('terminal', 'GET', pad)
      expect(fout, `${pad} hoort dicht te zijn`).toBeDefined()
      expect((fout as { status: number }).status).toBe(403)
    }
  })

  it('laat een terminal nergens anders schrijven dan op de klok', () => {
    const fout = doe('terminal', 'POST', '/articles')
    expect((fout as { status: number }).status).toBe(403)
    // Ook op een route die hij wél mag lézen.
    const fout2 = doe('terminal', 'POST', '/projects/PRJ-1/offertes')
    expect((fout2 as { status: number }).status).toBe(403)
  })

  it('geeft een lijst van artikelen niet vrij, alleen één artikel', () => {
    // /articles is de lijst mét prijzen; /articles/:id is de tekening erbij.
    expect((doe('terminal', 'GET', '/articles') as { status: number }).status).toBe(403)
    expect(doe('terminal', 'GET', '/articles/ART-0001')).toBeUndefined()
  })
})
