import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { IconPlus } from '@tabler/icons-react'
import { vraagtVandaag, type BestelRegel, type InkoopOverzicht, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { inkoopApi } from '../../api/inkoop'
import { bestelRegelsApi } from '../../api/bestellingen'
import { inkoopordersApi } from '../../api/inkooporders'
import { TeBestellenTab } from '../../components/inkoop/tabs/TeBestellenTab'
import { AanvragenTab } from '../../components/inkoop/tabs/AanvragenTab'
import { BufferTab } from '../../components/inkoop/tabs/BufferTab'
import { BesteldTab } from '../../components/inkoop/tabs/BesteldTab'
import { RegelPaneel } from '../../components/inkoop/overzicht/RegelPaneel'
import { OntvangstVenster } from '../../components/inkoop/bestellingen/OntvangstVenster'
import { BestelRegelVenster } from '../../components/inkoop/bestellingen/BestelRegelVenster'
import '../../components/inkoop/bestellingen/bestellingen.css'
import '../../components/inkoop/overzicht/overzicht.css'
import '../../components/inkoop/tabs/tabs.css'

type Tab = 'te_bestellen' | 'aanvragen' | 'buffer' | 'besteld'
const TABS: { id: Tab; label: string }[] = [
  { id: 'te_bestellen', label: 'Te bestellen' },
  { id: 'aanvragen', label: 'Open prijsaanvragen' },
  { id: 'buffer', label: 'Inkoopbuffer' },
  { id: 'besteld', label: 'Besteld' },
]

/** Hoeveel er in een tab staat, en of daar vandaag iets moet (oranje) of te laat is (rood). */
function teller(ov: InkoopOverzicht | undefined, tab: Tab): { n: number; toon: '' | 'warn' | 'dgr' } {
  if (!ov) return { n: 0, toon: '' }
  const status = { te_bestellen: 'te_bestellen', aanvragen: 'aangevraagd', buffer: 'buffer', besteld: 'besteld' }[tab]
  const rs = ov.regels.filter((r) => r.status === status && (tab !== 'besteld' || r.order?.status === 'verzonden'))
  const rood = rs.some((r) => r.plan.stand === 'te_laat_besteld' || r.plan.stand === 'komt_te_laat')
  const oranje = rs.some((r) => vraagtVandaag(r.plan.stand))
  return { n: rs.length, toon: rood ? 'dgr' : oranje ? 'warn' : '' }
}

/**
 * Bestellingen (2026-10-07) in vier tabbladen, in de volgorde van het werk:
 * te bestellen → prijs gevraagd → gekozen en gebundeld → besteld. Wat binnen
 * is, staat in de voorraad en niet meer hier.
 */
export function BestellingenPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = (TABS.find((t) => t.id === params.get('tab'))?.id) ?? 'te_bestellen'
  const ovQ = useQuery({ queryKey: ['inkoop', 'overzicht'], queryFn: () => inkoopApi.overzicht(), refetchInterval: 20000 })
  const regelsQ = useQuery({ queryKey: ['bestel-regels'], queryFn: () => bestelRegelsApi.list() })
  const ordersQ = useQuery({ queryKey: ['inkooporders'], queryFn: inkoopordersApi.list })
  const ov = ovQ.data
  const [paneel, setPaneel] = useState<string | null>(null)
  const [binnen, setBinnen] = useState<InkoopOverzichtRegel | null>(null)
  const [bewerk, setBewerk] = useState<BestelRegel | null>(null)
  const [nieuw, setNieuw] = useState(false)

  const zetTab = (t: Tab) => setParams(t === 'te_bestellen' ? {} : { tab: t }, { replace: true })
  // Vanuit het belletje: ?regel=… opent die regel, in de tab waar hij staat.
  const vanBel = params.get('regel')
  useEffect(() => {
    if (!vanBel || !ov) return
    const r = ov.regels.find((x) => x.id === vanBel)
    const t: Tab = !r ? 'te_bestellen' : r.status === 'aangevraagd' ? 'aanvragen' : r.status === 'buffer' ? 'buffer' : r.status === 'besteld' ? 'besteld' : 'te_bestellen'
    setPaneel(vanBel)
    setParams(t === 'te_bestellen' ? {} : { tab: t }, { replace: true })
  }, [vanBel, ov, setParams])

  const binnenOrder = binnen ? ordersQ.data?.find((o) => o.id === binnen.order?.id) : undefined
  const binnenRegel = binnenOrder?.regels.find((x) => x.id === binnen?.order?.inkooporderRegelId)
  const paneelRegel = ov?.regels.find((r) => r.id === paneel) ?? null
  const alle = regelsQ.data ?? []
  const open = (r: InkoopOverzichtRegel) => setPaneel(r.id)

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Bestellingen</div>
          <div className="st-page-sub">Van opdracht tot binnen: aanvragen, kiezen, bundelen, bestellen</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn primary" onClick={() => setNieuw(true)}><IconPlus size={14} />Materiaal toevoegen</button>
        </div>
      </div>

      <div className="ib-tabbalk" role="tablist" aria-label="Bestellingen">
        {TABS.map((t) => {
          const c = teller(ov, t.id)
          return (
            <button key={t.id} type="button" role="tab" className="ib-tab" aria-selected={tab === t.id} onClick={() => zetTab(t.id)}>
              {t.label}{c.n > 0 && <span className={`ib-tab-tel ${c.toon}`}>{c.n}</span>}
            </button>
          )
        })}
      </div>

      <div className="ib-tab-inhoud" role="tabpanel">
        {ovQ.error ? <div className="st-empty">De bestellingen konden niet geladen worden: {(ovQ.error as Error).message}</div>
          : !ov ? <div className="st-empty">Laden…</div>
          : tab === 'te_bestellen' ? <TeBestellenTab ov={ov} bestelRegels={alle} onOpen={open} onBewerk={setBewerk} />
          : tab === 'aanvragen' ? <AanvragenTab ov={ov} bestelRegels={alle} onOpen={open} />
          : tab === 'buffer' ? <BufferTab ov={ov} onOpen={open} />
          : <BesteldTab ov={ov} onOpen={open} onBinnen={setBinnen} />}
      </div>

      {paneelRegel && <RegelPaneel key={paneelRegel.id} r={paneelRegel} onSluit={() => setPaneel(null)} onBinnen={setBinnen} />}
      {binnen && binnenOrder && binnenRegel && <OntvangstVenster order={binnenOrder} regel={binnenRegel} onSluit={() => setBinnen(null)} />}
      {nieuw && <BestelRegelVenster onSluit={() => setNieuw(false)} />}
      {bewerk && <BestelRegelVenster bestaand={bewerk} onSluit={() => setBewerk(null)} />}
    </>
  )
}
