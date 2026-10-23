import { describe, it, expect } from 'vitest'
import type { ArticleEstimate, EstimateNode } from '../../../api/articles'
import { buildEstimateCtx } from '../../../api/estimate'
import { duurTekst, leesGetal, receptUitCalculatie, staffelPrijzen, toonGetal } from '../calc-helpers'

const est = (nodes: EstimateNode[]): ArticleEstimate => ({ marginPct: 0, nodes, updatedAt: '' })
const staf: EstimateNode = { id: 'm', type: 'material', name: 'C45', gradeId: 'g', profileId: 'p', dimensions: { diameter: 50 }, lengthMm: 120 }
const exoot: EstimateNode = { ...staf, id: 'e', exoot: true }

describe('leesGetal', () => {
  it('komma en punt als decimaalteken', () => {
    expect(leesGetal('3,71')).toBe(3.71)
    expect(leesGetal('3.71')).toBe(3.71)
  })
  it('met duizendtalscheiding: de laatste scheiding is de decimaal', () => {
    expect(leesGetal('1.250,5')).toBe(1250.5)
    expect(leesGetal('1,250.5')).toBe(1250.5)
  })
  it('leeg of onzin is null', () => {
    expect(leesGetal('')).toBeNull()
    expect(leesGetal('  ')).toBeNull()
    expect(leesGetal('abc')).toBeNull()
  })
})

describe('toonGetal en duurTekst', () => {
  it('Nederlandse komma, geen duizendtalpunt in een invulveld', () => {
    expect(toonGetal(3.71)).toBe('3,71')
    expect(toonGetal(1250)).toBe('1250')
  })
  it('één tijd per machineregel: minuten onder het uur, uren erboven', () => {
    expect(duurTekst(32.5)).toBe('32,5 min')
    expect(duurTekst(52)).toBe('52 min')
    expect(duurTekst(135)).toBe('2:15 u')
    expect(duurTekst(119.8)).toBe('2:00 u')
  })
})

describe('receptUitCalculatie', () => {
  it('het eerste materiaal uit voorraad is het recept, een exoot niet', () => {
    expect(receptUitCalculatie(est([exoot, staf]), null)).toEqual({
      gradeId: 'g', profileId: 'p', dimensions: { diameter: 50 }, lengthPerPieceMm: 120,
    })
  })
  it('laatste materiaal weggehaald: recept leegmaken', () => {
    expect(receptUitCalculatie(est([]), est([staf]))).toBeNull()
    expect(receptUitCalculatie(est([exoot]), est([staf, exoot]))).toBeNull()
  })
  it('er was al geen materiaalregel (oud artikel): recept niet aanraken', () => {
    expect(receptUitCalculatie(est([]), est([]))).toBeUndefined()
    expect(receptUitCalculatie(est([]), null)).toBeUndefined()
  })
})

describe('staffelPrijzen', () => {
  it('insteltijd en uitbesteding verdeeld over de serie, cyclustijd per stuk', () => {
    const ctx = buildEstimateCtx({ recipe: null }, [], [], [{ id: 'd', machineRatePerHour: 60, operatorRatePerHour: 0 }])
    const e = est([
      { id: 'mac', type: 'machine', name: 'Draaibank', machineId: 'd', setupMin: 60, steps: [{ id: 's', name: 'draaien', cycleMin: 6 }] },
      { id: 'uit', type: 'external', name: 'Verzinken', qty: 1, externalCost: 100 },
    ])
    // 1 st: 60 + 6 + 100 = 166; 10 st: 6 + 6 + 10 = 22 per stuk.
    expect(staffelPrijzen(e, ctx, [1, 10])).toEqual([
      { aantal: 1, perStuk: 166 },
      { aantal: 10, perStuk: 22 },
    ])
  })
})
