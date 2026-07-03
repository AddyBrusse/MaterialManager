import type { Project } from '@stockmanager/shared'
import type { RawMaterialRow } from '../api/raw-materials'
import type { FinishedGoodRow } from '../api/finished-goods'
import type { Article } from '../api/articles'
import { formatDate } from '../api/projects'
import { formatDimensions } from '../api/raw-materials'
import { buildEstimateCtx, computeEstimateTotals } from '../api/estimate'

interface OverrunLookups {
  grades: { id: string; densityKgM3: number; pricePerKg?: number }[]
  profiles: { id: string; volumeFormula: string }[]
  machines: { id: string; machineRatePerHour: number; operatorRatePerHour: number }[]
}

export interface TodoAlert {
  key: string
  kind: 'low-stock' | 'due-risk' | 'production-overrun'
  title: string
  severity: 'normal' | 'high'
  dueDate?: string | null
  linkTo?: string
}

/** Signed workdays between today and dateStr (skip Sat/Sun); negative = already passed. */
function workdaysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const step = target >= today ? 1 : -1
  const cursor = new Date(today)
  let count = 0
  while (cursor.getTime() !== target.getTime()) {
    cursor.setDate(cursor.getDate() + step)
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6) count += step
  }
  return count
}

const DUE_RISK_STATUSES: Project['status'][] = ['bevestigd', 'productie']
const DUE_RISK_WORKDAYS_THRESHOLD = 2
const PRODUCTION_OVERRUN_FACTOR = 1.5

export function getLowStockAlerts(rawMaterials: RawMaterialRow[], finishedGoods: FinishedGoodRow[]): TodoAlert[] {
  const alerts: TodoAlert[] = []

  for (const r of rawMaterials) {
    const min = r.minStock != null ? Number(r.minStock) : null
    const current = Number(r.currentStock)
    if (min == null || current >= min) continue
    const label = `${r.profile.name} ${formatDimensions(r.profile, r.dimensions)} · ${r.grade.name}`
    alerts.push({
      key: `stock:raw:${r.id}`,
      kind: 'low-stock',
      title: `Lage voorraad: ${label} (${current}/${min})`,
      severity: current <= 0 ? 'high' : 'normal',
      linkTo: '/voorraad',
    })
  }

  for (const fg of finishedGoods) {
    const min = fg.minStock != null ? Number(fg.minStock) : null
    const current = Number(fg.currentStock)
    if (min == null || current >= min) continue
    alerts.push({
      key: `stock:finished:${fg.id}`,
      kind: 'low-stock',
      title: `Lage voorraad: ${fg.name} (${fg.artNo}) — ${current}/${min}`,
      severity: current <= 0 ? 'high' : 'normal',
      linkTo: '/artikelen',
    })
  }

  return alerts
}

export function getDueRiskAlerts(projects: Project[]): TodoAlert[] {
  const alerts: TodoAlert[] = []

  for (const p of projects) {
    if (!p.levertijdDatum) continue
    if (!DUE_RISK_STATUSES.includes(p.status)) continue
    const workdaysLeft = workdaysUntil(p.levertijdDatum)
    if (workdaysLeft > DUE_RISK_WORKDAYS_THRESHOLD) continue
    const overdue = workdaysLeft < 0
    alerts.push({
      key: `due:${p.id}`,
      kind: 'due-risk',
      title: overdue
        ? `Order te laat: ${p.naam} (levertijd was ${formatDate(p.levertijdDatum)})`
        : `Order dreigt te laat: ${p.naam} (levertijd ${formatDate(p.levertijdDatum)})`,
      severity: overdue ? 'high' : 'normal',
      dueDate: p.levertijdDatum,
      linkTo: `/projecten/${p.id}`,
    })
  }

  return alerts
}

export function getProductionOverrunAlerts(projects: Project[], articles: Article[], lookups: OverrunLookups): TodoAlert[] {
  const alerts: TodoAlert[] = []
  const now = Date.now()

  for (const p of projects) {
    for (const order of p.productieOrders) {
      if (order.status !== 'in_productie') continue
      const article = order.artikelId ? articles.find(a => a.id === order.artikelId) : null
      if (!article?.estimate) continue

      let totals
      try {
        const ctx = buildEstimateCtx(article, lookups.grades, lookups.profiles, lookups.machines)
        totals = computeEstimateTotals(article.estimate, ctx)
      } catch {
        continue
      }
      const expectedMin = totals.timeMin * order.qty
      if (expectedMin <= 0) continue
      const elapsedMin = (now - new Date(order.createdAt).getTime()) / 60000
      if (elapsedMin <= expectedMin * PRODUCTION_OVERRUN_FACTOR) continue

      alerts.push({
        key: `overrun:${order.id}`,
        kind: 'production-overrun',
        title: `Productie loopt uit: ${order.artikelNaam} (${p.naam})`,
        severity: 'high',
        linkTo: `/projecten/${p.id}`,
      })
    }
  }

  return alerts
}
