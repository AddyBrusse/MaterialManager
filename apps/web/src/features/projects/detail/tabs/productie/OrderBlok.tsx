import type { ProductieOrder } from '@stockmanager/shared'
import { articlesApi } from '../../../../../api/articles'
import { ArtikelPreviewThumb } from '../../../../../components/projecten/ArtikelPreviewThumb'
import { datum, dagenTot } from '../../lib/format'
import { StappenTabel } from './StappenTabel'

function orderPill(o: ProductieOrder) {
  if (o.status === 'gereed') return { tekst: 'Gereed', kleur: 'ok' }
  // Nog niet vrijgegeven: niet in de wachtrij, de planning of op de terminal.
  if (o.status === 'voorbereiding') return { tekst: 'Voorbereiding', kleur: 'warn' }
  // Van de opdracht gehaald terwijl er al aan gewerkt was: zichtbaar, niet meer in de wachtrij.
  if (o.status === 'gestopt') return { tekst: 'Gestopt', kleur: 'dgr' }
  if (o.status === 'in_productie') return { tekst: 'In productie', kleur: 'accent' }
  return { tekst: 'Gepland', kleur: '' }
}

/** De wachtreden op de orderkop: de eerste stap die nog op materiaal wacht. */
function wachtReden(o: ProductieOrder): string | null {
  for (const s of o.stappen) {
    if (s.gereedOp || !s.notBefore) continue
    const n = dagenTot(s.notBefore)
    if (n !== null && n > 0) return `niet eerder dan ${datum(s.notBefore)} — materiaal onderweg`
  }
  return null
}

export function OrderBlok({
  order,
  geblokkeerd,
  gekozen,
  onKies,
  onTerug,
  onStap,
  onStuks,
}: {
  order: ProductieOrder
  geblokkeerd: boolean
  /** Aangevinkt om vrij te geven; alleen bij een order in voorbereiding. */
  gekozen: boolean
  onKies: (orderId: string, aan: boolean) => void
  /** Terug naar voorbereiding; alleen aangeboden als er nog niet aan gewerkt is. */
  onTerug: (orderId: string) => void
  onStap: (orderId: string, stapId: string, gereed: boolean) => void
  onStuks: (orderId: string) => void
}) {
  const gereed = order.stappen.filter((s) => s.gereedOp).length
  // Sinds de deelleveringen telt een order in stuks, niet alleen in stappen:
  // "34 van de 40" is het getal waar een pakbon op wacht. De stappen zeggen
  // wélk werk gedaan is, het aantal zegt hoevéél eraf komt.
  const stuks = order.aantalGereed ?? 0
  const pill = orderPill(order)
  const wacht = wachtReden(order)
  const inVoorbereiding = order.status === 'voorbereiding'
  // Zoals op de Opdracht-tab: het onderdeel herkennen zonder door te klikken.
  const artikel = order.artikelId ? articlesApi.get(order.artikelId) : null
  const terugKan =
    (order.status === 'gepland' || order.status === 'in_productie') && gereed === 0 && stuks === 0

  return (
    <div>
      <div
        className="pdv2-card-head"
        style={{ background: 'var(--alt)', borderTop: '1px solid var(--border)' }}
      >
        {inVoorbereiding && (
          <input
            type="checkbox"
            checked={gekozen}
            disabled={geblokkeerd}
            aria-label={`${order.id} vrijgeven`}
            onChange={(e) => onKies(order.id, e.currentTarget.checked)}
          />
        )}
        <ArtikelPreviewThumb article={artikel} size={48} />
        <span className="mono" style={{ fontWeight: 600 }}>
          {order.id}
        </span>
        <span style={{ fontWeight: 600 }}>{order.artikelNaam}</span>
        {artikel?.tekening && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>
            {artikel.tekening}
            {artikel.rev && ` rev ${artikel.rev}`}
          </span>
        )}
        <span className="pdv2-count">
          <span className="mono">
            {stuks} / {order.qty}
          </span>{' '}
          {order.eenheid} gereed
        </span>
        <span className={`pdv2-pill ${pill.kleur}`}>{pill.tekst}</span>
        {wacht && (
          <span style={{ fontSize: 10.5, color: 'var(--warn)' }}>⏱ {wacht}</span>
        )}
        <span className="pdv2-spacer" />
        <span className="mono" style={{ fontSize: 11 }} title="Stappen gereed">
          {gereed}/{order.stappen.length} stappen
        </span>
        <span className="pdv2-meter" style={{ width: 96, marginTop: 0 }} title="Stuks gereed">
          <i
            className={order.qty > 0 && stuks >= order.qty ? 'ok' : ''}
            style={{ width: order.qty > 0 ? `${Math.min(stuks / order.qty, 1) * 100}%` : '0%' }}
          />
        </span>
        {terugKan && (
          <button
            type="button"
            className="pdv2-btn s stil"
            disabled={geblokkeerd}
            title="Haalt de order uit de wachtrij, de planning en de terminal"
            onClick={() => onTerug(order.id)}
          >
            Terug naar voorbereiding
          </button>
        )}
        <button
          type="button"
          className="pdv2-btn s"
          disabled={geblokkeerd}
          onClick={() => onStuks(order.id)}
        >
          Stuks melden
        </button>
      </div>

      <StappenTabel order={order} geblokkeerd={geblokkeerd} onStap={onStap} />
    </div>
  )
}
