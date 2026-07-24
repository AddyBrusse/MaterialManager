// Financial card for the Article detail header (Col 2 in the design spec).
// Baseline stat row (Verkoopprijs / Kostprijs / Winst / editable Marge) over a
// "Prijsopbouw" section with a 5-item legend and the price-buildup Sankey.

import './article-financial.css'
import type { ArticleEstimate } from '../../api/articles'
import type { EstimateCtx, EstimateTotals } from '../../api/estimate'
import { Ic, Icon } from './calc-icons'
import { ArticleSankey, buildLegend } from './ArticleSankey'

const euro = (n: number): string =>
  `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export interface ArticleFinancialCardProps {
  est: ArticleEstimate
  ctx: EstimateCtx
  totals: EstimateTotals
  onMarginChange: (pct: number) => void
}

export function ArticleFinancialCard({ est, ctx, totals, onMarginChange }: ArticleFinancialCardProps) {
  const winst = totals.sell - totals.cost
  const legend = buildLegend(totals)

  return (
    <div className="afc-card">
      {/* ── Top stat row: Kostprijs · Marge · Winst · Verkoopprijs ────── */}
      <div className="afc-statrow">
        <div className="afc-stat">
          <div className="afc-eyebrow">Kostprijs</div>
          <div className="afc-stat-val">{euro(totals.cost)}</div>
        </div>

        <div className="afc-stat afc-stat--marge">
          <div className="afc-eyebrow">Marge</div>
          <div className="afc-marge-box">
            <input
              className="afc-marge-inp"
              type="number"
              min={0}
              value={totals.marginPct}
              onChange={e => onMarginChange(Math.max(0, Number(e.target.value) || 0))}
              aria-label="Marge percentage"
            />
            <span className="afc-marge-pct">%</span>
          </div>
        </div>

        <div className="afc-stat">
          <div className="afc-eyebrow">Winst / stuk</div>
          <div className="afc-stat-val afc-profit">{euro(winst)}</div>
        </div>

        <div className="afc-stat afc-stat--sell">
          <div className="afc-eyebrow">
            <Ic d={Icon.euro} size={12} />
            Verkoopprijs
          </div>
          <div className="afc-sell-baseline">
            <span className="afc-sell-val">{euro(totals.sell)}</span>
            <span className="afc-per">per stuk</span>
          </div>
        </div>
      </div>

      {/* ── Prijsopbouw ──────────────────────────────────────────────── */}
      <div className="afc-buildup">
        <div className="afc-eyebrow">Prijsopbouw</div>

        <div className="afc-legend">
          {legend.map((it, i) => (
            <div key={i} className="afc-leg-item">
              <div className="afc-leg-top">
                <span className="afc-leg-swatch" style={{ background: it.color }} />
                <span className="afc-leg-label">{it.label}</span>
              </div>
              <div className="afc-leg-val">
                {euro(it.value)} <span className="afc-leg-pct">{it.pct}%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="afc-sankey-head">
          <span>Onderdelen</span>
          <span>Kostengroep</span>
          <span>Kostprijs</span>
          <span>Verkoopprijs</span>
        </div>

        <ArticleSankey est={est} ctx={ctx} sell={totals.sell} />
      </div>
    </div>
  )
}
