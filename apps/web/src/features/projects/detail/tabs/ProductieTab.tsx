import { IconPrinter } from '@tabler/icons-react'
import type { Project } from '@stockmanager/shared'
import { Card } from '../components/Card'
import { OrderBlok } from './productie/OrderBlok'

const BRON =
  'Volgorde en machine komen uit de opdracht; "wacht op materiaal" uit Bestellingen; geplande datum en ' +
  'wachtrijpositie komen uit de planner. Hier meld je stappen gereed en vul je in hoeveel ' +
  'stuks eraf kwamen — dat aantal bepaalt wat er op de volgende pakbon kan.'

interface Props {
  project: Project
  geblokkeerd: boolean
  onPlanner: () => void
  /** Zaagbon van het vastgelegde materiaal (2026-10-07). */
  onZaagbon: () => void
  /** De aangevinkte orders in voorbereiding; de pagina houdt ze bij voor de footer. */
  gekozen: string[]
  onKies: (orderId: string, aan: boolean) => void
  onTerug: (orderId: string) => void
  onStap: (orderId: string, stapId: string, gereed: boolean) => void
  onStuks: (orderId: string) => void
}

/**
 * §5.4. Planning gebeurt niet op dit scherm: `geplandDatum`, `geplandMachine`
 * en `queuePosition` zijn hier alleen-lezen. Hier geef je orders vrij voor de
 * hal (vinkje per order, de knop in de footer) en meld je ze gereed.
 */
export function ProductieTab({ project, geblokkeerd, gekozen, onKies, onTerug, onPlanner, onZaagbon, onStap, onStuks }: Props) {
  const orders = project.productieOrders
  const gereed = orders.reduce((n, o) => n + o.stappen.filter((s) => s.gereedOp).length, 0)
  const totaal = orders.reduce((n, o) => n + o.stappen.length, 0)
  const stuksGereed = orders.reduce((n, o) => n + (o.aantalGereed ?? 0), 0)
  const stuksTotaal = orders.reduce((n, o) => n + o.qty, 0)

  const zaagbonKnop = (
    <button type="button" className="pdv2-btn s" onClick={onZaagbon}>
      <IconPrinter size={13} /> Zaagbon
    </button>
  )

  if (orders.length === 0) {
    return (
      <Card titel="Productie" acties={zaagbonKnop}>
        <div className="pdv2-empty">
          Ontstaat uit de regels van de geaccepteerde offerte. Per regel komt er één
          productieorder; de bewerkingen van die regel worden de stappen.
        </div>
      </Card>
    )
  }

  return (
    <Card
      titel="Productie"
      teller={`${orders.length} orders · ${stuksGereed} van ${stuksTotaal} stuks · ${gereed} van ${totaal} stappen`}
      plat
      bron={BRON}
      acties={
        <>
          <span className="pdv2-pill">planning uit planner</span>
          {zaagbonKnop}
          <button type="button" className="pdv2-btn s" onClick={onPlanner}>
            Openen in planner
          </button>

        </>
      }
    >
      {orders.map((o) => (
        <OrderBlok
          order={o}
          key={o.id}
          geblokkeerd={geblokkeerd}
          gekozen={gekozen.includes(o.id)}
          onKies={onKies}
          onTerug={onTerug}
          onStap={onStap}
          onStuks={onStuks}
        />
      ))}
    </Card>
  )
}
