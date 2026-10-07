import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { InkoopOverzichtRegel } from '@stockmanager/shared'
import { inkoopApi } from '../../api/inkoop'
import { inkoopordersApi } from '../../api/inkooporders'
import { BesteldTab } from '../../components/inkoop/tabs/BesteldTab'
import { RegelPaneel } from '../../components/inkoop/overzicht/RegelPaneel'
import { OntvangstVenster } from '../../components/inkoop/bestellingen/OntvangstVenster'
import '../../components/inkoop/bestellingen/bestellingen.css'
import '../../components/inkoop/overzicht/overzicht.css'
import '../../components/inkoop/tabs/tabs.css'

/**
 * Binnen boeken (2026-10-07): typ het nummer van het label (260042) en de
 * juiste bestelling staat klaar. Dezelfde lijst als Bestellingen → Besteld;
 * deze pagina was tot nu toe een voorbeeldscherm zonder echte gegevens.
 */
export function BinnenBoekenPage() {
  const ovQ = useQuery({ queryKey: ['inkoop', 'overzicht'], queryFn: () => inkoopApi.overzicht(), refetchInterval: 20000 })
  const ordersQ = useQuery({ queryKey: ['inkooporders'], queryFn: inkoopordersApi.list })
  const [paneel, setPaneel] = useState<string | null>(null)
  const [binnen, setBinnen] = useState<InkoopOverzichtRegel | null>(null)
  const ov = ovQ.data
  const order = binnen ? ordersQ.data?.find((o) => o.id === binnen.order?.id) : undefined
  const regel = order?.regels.find((x) => x.id === binnen?.order?.inkooporderRegelId)
  const paneelRegel = ov?.regels.find((r) => r.id === paneel) ?? null

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Binnen boeken</div>
          <div className="st-page-sub">Materiaal dat binnenkomt in de voorraad zetten, met het nummer van het label</div>
        </div>
      </div>
      <div className="ib-tab-inhoud">
        {ovQ.error ? <div className="st-empty">De bestellingen konden niet geladen worden: {(ovQ.error as Error).message}</div>
          : !ov ? <div className="st-empty">Laden…</div>
          : <BesteldTab ov={ov} onOpen={(r) => setPaneel(r.id)} onBinnen={setBinnen} />}
      </div>
      {paneelRegel && <RegelPaneel key={paneelRegel.id} r={paneelRegel} onSluit={() => setPaneel(null)} onBinnen={setBinnen} />}
      {binnen && order && regel && <OntvangstVenster order={order} regel={regel} onSluit={() => setBinnen(null)} />}
    </>
  )
}
