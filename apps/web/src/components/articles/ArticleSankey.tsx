// Price-buildup Sankey for the Article detail financial card.
// 4-stage left→right flow: col0 line items (each material / machine / external)
// → col1 cost groups (Materiaalkosten, Setuptijd, Bewerkingskosten, Uitbesteed)
// → col2 (Kostprijs + Marge) → col3 Verkoopprijs. Ribbon thickness ∝ € share.
// Layout algorithm ported from the design prototype; cost math reused from estimate.ts.

import type { ArticleEstimate, EstimateNode } from '../../api/articles'
import type { EstimateCtx, EstimateTotals } from '../../api/estimate'
import { materialCostPerPiece, machineRatePerHour } from '../../api/estimate'

export const sankeyColors = {
  mat: '#2d6df6',
  setup: '#8b5cf6',
  bew: '#0e9c8e',
  uit: '#d97706',
  marge: '#117a45',
  kost: '#64748b',
  sell: '#1f2937',
} as const

export interface SankeyFlow {
  color: string
  d: string
  label: string
  value: number
}

const euro = (n: number): string =>
  `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export interface SankeyRect {
  x: number
  y: number
  w: number
  h: number
  color: string
}
export interface SankeyTitle {
  label: string
  cy: number
}
export interface SankeyResult {
  viewBox: string
  flows: SankeyFlow[]
  rects: SankeyRect[]
  titles: SankeyTitle[]
  gutterX: number
}

interface SNode {
  id: string
  col: number
  value: number
  label: string
  color: string
  h?: number
  x?: number
  top?: number
  outY?: number
  inY?: number
}
interface SLink {
  s: string
  t: string
  value: number
  color: string
}

/** Per-piece € value of a material node (qty × weight/override price). */
function matVal(n: EstimateNode, ctx: EstimateCtx): number {
  return (n.qty ?? 1) * materialCostPerPiece(n, ctx)
}
/** Machine setup cost = (setupMin/60) × rate. */
function setupCostOf(n: EstimateNode, ctx: EstimateCtx): number {
  return ((n.setupMin ?? 0) / 60) * machineRatePerHour(n, ctx)
}
/** Machine cycle cost = (Σ steps.cycleMin / 60) × rate. */
function cycleCostOf(n: EstimateNode, ctx: EstimateCtx): number {
  const cycleMin = (n.steps ?? []).reduce((s, st) => s + (st.cycleMin || 0), 0)
  return (cycleMin / 60) * machineRatePerHour(n, ctx)
}
/** External/outsourcing € value (qty × cost). */
function extVal(n: EstimateNode): number {
  return (n.qty ?? 1) * (n.externalCost ?? 0)
}

/** Pure layout: build node rects, ribbon paths and col-0 flow titles. */
export function buildSankey(est: ArticleEstimate, ctx: EstimateCtx, sell: number): SankeyResult {
  const C = sankeyColors
  const nodes: Record<string, SNode> = {}
  const order: string[] = []
  const links: SLink[] = []
  const add = (id: string, col: number, value: number, label: string, color: string): void => {
    nodes[id] = { id, col, value, label, color }
    order.push(id)
  }
  const link = (s: string, t: string, value: number, color: string): void => {
    if (value > 0) links.push({ s, t, value, color })
  }

  const materials = est.nodes.filter(n => n.type === 'material')
  const machines = est.nodes.filter(n => n.type === 'machine')
  const external = est.nodes.filter(n => n.type === 'external')

  // col1 group sums + margin computed up front so the marge band can start at
  // the chart's left edge (col0), aligned with the material/machine flows.
  const gMat = materials.reduce((a, m) => a + matVal(m, ctx), 0)
  const gSetup = machines.reduce((a, m) => a + setupCostOf(m, ctx), 0)
  const gBew = machines.reduce((a, m) => a + cycleCostOf(m, ctx), 0)
  const gUit = external.reduce((a, e) => a + extVal(e), 0)
  const cost = gMat + gSetup + gBew + gUit
  const profit = Math.max(0, sell - cost)

  // col0 — line items (+ marge as its own band from the left edge)
  materials.forEach(m => add('m_' + m.id, 0, matVal(m, ctx), 'Materiaal', C.mat))
  machines.forEach(m => add('c_' + m.id, 0, setupCostOf(m, ctx) + cycleCostOf(m, ctx), m.name, C.bew))
  external.forEach(e => add('e_' + e.id, 0, extVal(e), 'Uitbestedingen', C.uit))
  if (profit > 0) add('mrg0', 0, profit, 'Marge', C.marge)

  // col1 — cost groups (+ marge passes through its own col1 stop so it spans
  // all 4 columns, aligned with the material/machine flows)
  add('gMat', 1, gMat, 'Materiaalkosten', C.mat)
  add('gSetup', 1, gSetup, 'Setuptijd', C.setup)
  add('gBew', 1, gBew, 'Bewerkingskosten', C.bew)
  add('gUit', 1, gUit, 'Uitbesteed', C.uit)
  if (profit > 0) add('gMarge', 1, profit, 'Marge', C.marge)

  // col2 — kostprijs + marge
  add('kost', 2, cost, 'Kostprijs', C.kost)
  add('marge', 2, profit, 'Marge', C.marge)

  // col3 — verkoopprijs
  add('sell', 3, sell, 'Verkoopprijs', C.sell)

  // links
  materials.forEach(m => link('m_' + m.id, 'gMat', matVal(m, ctx), C.mat))
  machines.forEach(m => {
    link('c_' + m.id, 'gSetup', setupCostOf(m, ctx), C.setup)
    link('c_' + m.id, 'gBew', cycleCostOf(m, ctx), C.bew)
  })
  external.forEach(e => link('e_' + e.id, 'gUit', extVal(e), C.uit))
  link('gMat', 'kost', gMat, C.mat)
  link('gSetup', 'kost', gSetup, C.setup)
  link('gBew', 'kost', gBew, C.bew)
  link('gUit', 'kost', gUit, C.uit)
  link('kost', 'sell', cost, C.kost)
  // marge: col0 → col1 → col2 → col3, same 4 stops as the other flows
  link('mrg0', 'gMarge', profit, C.marge)
  link('gMarge', 'marge', profit, C.marge)
  link('marge', 'sell', profit, C.marge)

  // layout
  const W = 520, H = 236, pad = 12, nodeW = 10, gap = 9
  const availH = H - pad * 2, nCols = 4, leftX = 150, rightX = W - nodeW - 8
  const colX = (c: number): number => leftX + (rightX - leftX) * (c / (nCols - 1))

  const cols: Record<number, string[]> = {}
  order.forEach(id => {
    const c = nodes[id].col
    ;(cols[c] = cols[c] ?? []).push(id)
  })

  // single global value→px scale so a €-value has the same thickness everywhere
  let scale = Infinity
  Object.keys(cols).forEach(ck => {
    const list = cols[Number(ck)].filter(id => nodes[id].value > 0)
    const tot = list.reduce((a, id) => a + nodes[id].value, 0) || 1
    const sc = (availH - gap * (list.length - 1)) / tot
    if (sc < scale) scale = sc
  })
  if (!isFinite(scale)) scale = 1

  Object.keys(cols).forEach(ck => {
    const c = Number(ck)
    const list = cols[c].filter(id => nodes[id].value > 0)
    const stackH = list.reduce((a, id) => a + nodes[id].value * scale, 0) + gap * (list.length - 1)
    let y = pad + (availH - stackH) / 2
    list.forEach(id => {
      const nd = nodes[id]
      nd.h = Math.max(nd.value * scale, 1.5)
      nd.x = colX(c)
      nd.top = y
      nd.outY = y
      nd.inY = y
      y += nd.h + gap
    })
  })

  const drawn = links.filter(l => nodes[l.s].h != null && nodes[l.t].h != null)
  drawn.sort((a, b) =>
    nodes[a.s].col - nodes[b.s].col ||
    (nodes[a.s].top ?? 0) - (nodes[b.s].top ?? 0) ||
    (nodes[a.t].top ?? 0) - (nodes[b.t].top ?? 0),
  )

  const flows: SankeyFlow[] = []
  drawn.forEach(l => {
    const sn = nodes[l.s], tn = nodes[l.t]
    const h = l.value * scale
    const sy = sn.outY ?? 0
    sn.outY = sy + h
    const ty = tn.inY ?? 0
    tn.inY = ty + h
    const x0 = (sn.x ?? 0) + nodeW, x1 = tn.x ?? 0, mx = (x0 + x1) / 2
    flows.push({
      color: l.color,
      d: `M${x0},${sy} C${mx},${sy} ${mx},${ty} ${x1},${ty} L${x1},${ty + h} C${mx},${ty + h} ${mx},${sy + h} ${x0},${sy + h} Z`,
      label: sn.label,
      value: l.value,
    })
  })

  const rects: SankeyRect[] = []
  const titles: SankeyTitle[] = []
  order.forEach(id => {
    const nd = nodes[id]
    if (nd.h == null) return
    rects.push({ x: nd.x ?? 0, y: nd.top ?? 0, w: nodeW, h: nd.h, color: nd.color })
    if (nd.col === 0) titles.push({ label: nd.label, cy: (nd.top ?? 0) + nd.h / 2 })
  })

  return { viewBox: `0 0 ${W} ${H}`, flows, rects, titles, gutterX: leftX }
}

export interface LegendItem {
  color: string
  label: string
  value: number
  pct: number
}

/** 5-item price-buildup legend, filtered to value>0 with % of sell. */
export function buildLegend(totals: EstimateTotals): LegendItem[] {
  const sell = totals.sell || 0
  const profit = Math.max(0, totals.sell - totals.cost)
  const raw: Omit<LegendItem, 'pct'>[] = [
    { color: sankeyColors.mat, label: 'Materiaalkosten', value: totals.materialTotal },
    { color: sankeyColors.setup, label: 'Setuptijd (alle machines)', value: totals.setupTotal },
    { color: sankeyColors.bew, label: 'Bewerkingskosten', value: totals.cycleTotal },
    { color: sankeyColors.uit, label: 'Uitbestedingskosten', value: totals.externalTotal },
    { color: sankeyColors.marge, label: 'Marge / winst', value: profit },
  ]
  return raw
    .filter(it => it.value > 0)
    .map(it => ({ ...it, pct: sell > 0 ? Math.round((it.value / sell) * 100) : 0 }))
}

/** Truncate long machine names so col-0 flow titles fit the left gutter. */
function truncateLabel(label: string, max = 22): string {
  return label.length > max ? label.slice(0, max - 1) + '…' : label
}

export interface ArticleSankeyProps {
  est: ArticleEstimate
  ctx: EstimateCtx
  sell: number
}

export function ArticleSankey({ est, ctx, sell }: ArticleSankeyProps) {
  const { viewBox, flows, rects, titles, gutterX } = buildSankey(est, ctx, sell)
  return (
    <svg className="afc-sankey-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Prijsopbouw diagram">
      {flows.map((f, i) => (
        <path key={`f${i}`} className="afc-sankey-flow" d={f.d} fill={f.color} fillOpacity={0.36}>
          <title>{`${f.label}: ${euro(f.value)}`}</title>
        </path>
      ))}
      {rects.map((r, i) => (
        <rect key={`r${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx={1.5} fill={r.color} />
      ))}
      {titles.map((t, i) => (
        <text
          key={`t${i}`}
          className="afc-sankey-title"
          x={gutterX - 8}
          y={t.cy}
          textAnchor="end"
          dominantBaseline="middle"
        >
          {truncateLabel(t.label)}
        </text>
      ))}
    </svg>
  )
}
