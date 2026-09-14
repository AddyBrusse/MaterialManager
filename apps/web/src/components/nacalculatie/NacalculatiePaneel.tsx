import { IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import type { Nacalculatie, NacalculatieRegel } from '@stockmanager/shared'

export function euro(v: number): string {
  return (v < 0 ? '−' : '') + '€ ' + Math.abs(v).toLocaleString('nl-NL', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

/**
 * Het verschil als tekst.
 *
 * Kleur draagt nooit alleen de boodschap: het percentage staat er altijd bij, en
 * een post die precies uitkwam zegt "gelijk" in plaats van "−0%" — dat laatste
 * leest als een afrondingsfout.
 */
export function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="cell-muted">—</span>
  if (Math.abs(pct) < 0.5) return <span className="tr-delta cell-muted">gelijk</span>
  const over = pct > 0
  return (
    <span className={`tr-delta ${over ? 'is-over' : 'is-onder'}`}>
      {over ? '+' : '−'}{Math.abs(pct).toFixed(0)}%
    </span>
  )
}

/**
 * Staaf = werkelijk, streepje = gecalculeerd, één gedeelde schaal per tabel.
 *
 * De schaal komt van buiten en is voor alle rijen dezelfde; twee schalen onder
 * elkaar in dezelfde kolom lezen als vergelijkbaar terwijl ze dat niet zijn.
 */
function Bullet({ werkelijk, gecalculeerd, schaal }: {
  werkelijk: number; gecalculeerd: number; schaal: number
}) {
  if (schaal <= 0) return null
  const breedte = 160
  const bar = Math.min(breedte, Math.round((werkelijk / schaal) * breedte))
  const tick = Math.min(breedte, Math.round((gecalculeerd / schaal) * breedte))
  const gelijk = Math.abs(werkelijk - gecalculeerd) < 0.005
  const klasse = gelijk ? '' : werkelijk > gecalculeerd ? 'is-over' : 'is-onder'
  return (
    <div className="tr-bul" style={{ width: breedte }}>
      <div className={`tr-bul-bar ${klasse}`} style={{ width: bar }} />
      <div className="tr-bul-tick" style={{ left: tick }} />
    </div>
  )
}

/**
 * De vier posten van een nacalculatie.
 *
 * Dezelfde indeling als `computeEstimateTotals` — materiaal, instellen, draaien,
 * uitbesteed — zodat geschat en werkelijk per definitie op elkaar passen. Een
 * eigen indeling zou nooit optellen en elk verschil onverklaarbaar maken.
 */
export function PostenTabel({ n, titel }: { n: Nacalculatie; titel?: string }) {
  const schaal = Math.max(
    ...n.regels.flatMap((r: NacalculatieRegel) => [r.gecalculeerd, r.werkelijk]), 1,
  )
  return (
    <div className="st-card">
      <div className="st-card-hd">
        {titel ?? 'Waar het geld in ging'}
        <span className="cell-muted" style={{ fontSize: 11.5, fontWeight: 400, marginLeft: 8 }}>
          zelfde indeling als de calculatie · staaf = werkelijk, streepje = gecalculeerd
        </span>
      </div>
      <div className="st-table-wrap">
        <table className="st-tbl">
          <thead>
            <tr>
              <th style={{ width: 230 }}>Post</th>
              <th style={{ width: 110 }}>Gecalculeerd</th>
              <th style={{ width: 110 }}>Werkelijk</th>
              <th>Vergelijking</th>
              <th style={{ width: 80, textAlign: 'right' }}>Verschil</th>
            </tr>
          </thead>
          <tbody>
            {n.regels.map((r) => (
              <tr key={r.post}>
                <td>
                  <div className="cell-strong">{r.label}</div>
                  <div className="cell-muted" style={{ fontSize: 11.5 }}>{r.toelichting}</div>
                </td>
                <td className="cell-mono cell-muted">{euro(r.gecalculeerd)}</td>
                <td className="cell-mono cell-strong">{euro(r.werkelijk)}</td>
                <td><Bullet werkelijk={r.werkelijk} gecalculeerd={r.gecalculeerd} schaal={schaal} /></td>
                <td style={{ textAlign: 'right' }}><Delta pct={r.verschilPct} /></td>
              </tr>
            ))}
            <tr style={{ background: 'var(--bg-sidebar)' }}>
              <td className="cell-strong">Totaal kostprijs</td>
              <td className="cell-mono cell-muted">{euro(n.gecalculeerdTotaal)}</td>
              <td className="cell-mono cell-strong">{euro(n.werkelijkTotaal)}</td>
              {/* Geen staaf: de totaalrij heeft een andere schaal dan de posten,
                  en twee schalen in één kolom lezen als vergelijkbaar. */}
              <td />
              <td style={{ textAlign: 'right' }}><Delta pct={n.verschilPct} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** De vier tegels bovenaan: verkoop, gecalculeerd, werkelijk, marge. */
export function NacalculatieTegels({ n }: { n: Nacalculatie }) {
  const onder = n.werkelijkTotaal < n.gecalculeerdTotaal
  const gelijk = Math.abs(n.verschilTotaal) < 0.005
  return (
    <div className="st-stats">
      <div className="st-stat">
        <span className="st-stat-lbl">Verkocht voor</span>
        <span className="st-stat-val">{n.verkoopTotaal == null ? '—' : euro(n.verkoopTotaal)}</span>
        <span className="st-stat-foot">vastgelegd bij accepteren offerte</span>
      </div>
      <div className="st-stat">
        <span className="st-stat-lbl">Kostprijs gecalculeerd</span>
        <span className="st-stat-val cell-muted">{euro(n.gecalculeerdTotaal)}</span>
        <span className="st-stat-foot">uit de calculatie</span>
      </div>
      <div
        className="st-stat"
        style={gelijk ? undefined : {
          borderColor: onder ? 'var(--success)' : 'var(--warning)',
          background: onder ? 'var(--success-soft)' : 'var(--warning-soft)',
        }}
      >
        <span className="st-stat-lbl" style={gelijk ? undefined : { color: onder ? 'var(--success)' : 'var(--warning)' }}>
          Kostprijs werkelijk
        </span>
        <span className="st-stat-val">{euro(n.werkelijkTotaal)}</span>
        <span className="st-stat-foot" style={gelijk ? undefined : { color: onder ? 'var(--success)' : 'var(--warning)' }}>
          {gelijk ? 'gelijk aan de calculatie' : (
            <>
              {onder ? <IconCheck size={12} stroke={2.2} /> : <IconAlertTriangle size={12} stroke={2} />}
              {' '}{Math.abs(n.verschilPct ?? 0).toFixed(0)}% {onder ? 'onder' : 'boven'} de calculatie
            </>
          )}
        </span>
      </div>
      <div className="st-stat">
        <span className="st-stat-lbl">Marge werkelijk</span>
        <span className="st-stat-val">
          {n.margeWerkelijkPct == null ? '—' : `${n.margeWerkelijkPct.toFixed(0)}%`}
        </span>
        <span className="st-stat-foot">
          {n.margeWerkelijkEuro != null && <>{euro(n.margeWerkelijkEuro)} · </>}
          {n.margeGecalculeerdPct != null && <>gecalculeerd was {n.margeGecalculeerdPct.toFixed(0)}%</>}
        </span>
      </div>
    </div>
  )
}

/** Staat er nog niets gemeten, dan is dit geen nacalculatie maar een voorspelling. */
export function NietGemeten() {
  return (
    <div className="st-empty">
      Er is nog geen tijd geregistreerd op dit werk. Tot die tijd toont de nacalculatie
      de calculatie zelf — dat is eerlijker dan een besparing die alleen bestaat
      omdat er niets geklokt is.
    </div>
  )
}
