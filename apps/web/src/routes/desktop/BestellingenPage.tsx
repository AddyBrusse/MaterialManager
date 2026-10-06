import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IconPlus } from '@tabler/icons-react'
import { bestelRegelsApi, prijsaanvragenApi } from '../../api/bestellingen'
import { inkoopordersApi } from '../../api/inkooporders'
import { InkoopordersTab } from '../../components/inkoop/bestellingen/InkoopordersTab'
import { OntvangenTab } from '../../components/inkoop/bestellingen/OntvangenTab'
import { BesteldeRegels } from '../../components/inkoop/bestellingen/BesteldeRegels'
import { TeBestellenTab } from '../../components/inkoop/bestellingen/TeBestellenTab'
import { PrijsaanvragenTab } from '../../components/inkoop/bestellingen/PrijsaanvragenTab'
import { PrijsaanvraagVenster } from '../../components/inkoop/bestellingen/PrijsaanvraagVenster'
import { BestelRegelVenster } from '../../components/inkoop/bestellingen/BestelRegelVenster'
import { meldFout } from '../../utils/fout-melding-toon'
import { Weigering } from '../../utils/fout-melding'
import '../../components/inkoop/bestellingen/bestellingen.css'

type Tab = 'te_bestellen' | 'aanvragen' | 'inkooporders' | 'ontvangen'
const TABS: Tab[] = ['te_bestellen', 'aanvragen', 'inkooporders', 'ontvangen']

/**
 * Bestellingen (2026-10-06): van wat er nodig is, via prijsaanvragen en
 * vergelijken, naar inkooporders per leverancier en ontvangen in de voorraad.
 */
export function BestellingenPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'te_bestellen'
  const setTab = (t: Tab) => setParams(t === 'te_bestellen' ? {} : { tab: t }, { replace: true })
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const [nieuw, setNieuw] = useState(false)
  const [aanvragen, setAanvragen] = useState(false)
  const [openAanvraag, setOpenAanvraag] = useState<string | null>(null)

  const regelsQ = useQuery({ queryKey: ['bestel-regels'], queryFn: () => bestelRegelsApi.list(), refetchInterval: 20000 })
  const aanvragenQ = useQuery({ queryKey: ['prijsaanvragen'], queryFn: prijsaanvragenApi.list })
  const ordersQ = useQuery({ queryKey: ['inkooporders'], queryFn: inkoopordersApi.list, refetchInterval: 20000 })
  const ontvangstenQ = useQuery({ queryKey: ['ontvangsten'], queryFn: inkoopordersApi.ontvangsten, enabled: tab === 'ontvangen' })
  const openOrders = (ordersQ.data ?? []).filter((o) => o.status === 'verzonden' && o.regels.some((r) => r.ontvangenStuks < r.stuks)).length
  const alle = regelsQ.data ?? []
  const open = alle.filter((r) => r.status === 'te_bestellen' || r.status === 'aangevraagd')
  const openIds = open.map((r) => r.id).sort()
  const vergelijkQ = useQuery({ queryKey: ['vergelijk', openIds], queryFn: () => bestelRegelsApi.vergelijk(openIds), enabled: openIds.length > 0 })
  const selectie = open.filter((r) => gekozen.has(r.id))

  const vereisSelectie = (actie: string, doe: () => void) => {
    if (selectie.length === 0) {
      meldFout({ actie, fout: new Weigering('Vink eerst één of meer regels aan.'), gevolg: 'Er is niets gebeurd.' })
      return
    }
    doe()
  }

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Bestellingen</div>
          <div className="st-page-sub">Materiaal inkoop — van opdracht tot ontvangst</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn primary" onClick={() => setNieuw(true)}><IconPlus size={14} />Materiaal toevoegen</button>
        </div>
      </div>

      <div className="st-tabs">
        <button className={`st-tab-btn${tab === 'te_bestellen' ? ' active' : ''}`} onClick={() => setTab('te_bestellen')}>
          Te bestellen {open.length > 0 && <span className="bs-tel">{open.length}</span>}
        </button>
        <button className={`st-tab-btn${tab === 'aanvragen' ? ' active' : ''}`} onClick={() => setTab('aanvragen')}>
          Prijsaanvragen {(aanvragenQ.data?.length ?? 0) > 0 && <span className="bs-tel">{aanvragenQ.data!.length}</span>}
        </button>
        <button className={`st-tab-btn${tab === 'inkooporders' ? ' active' : ''}`} onClick={() => setTab('inkooporders')}>
          Inkooporders {openOrders > 0 && <span className="bs-tel" title="verstuurd, nog niet alles binnen">{openOrders}</span>}
        </button>
        <button className={`st-tab-btn${tab === 'ontvangen' ? ' active' : ''}`} onClick={() => setTab('ontvangen')}>Ontvangen</button>
      </div>

      <div className="bs-inhoud">
        {regelsQ.error ? (
          <div className="st-empty">De bestellijst kon niet geladen worden: {(regelsQ.error as Error).message}</div>
        ) : tab === 'te_bestellen' ? (
          <>
            <div className="bs-balk">
              <span>{selectie.length} geselecteerd</span>
              <span style={{ flex: 1 }} />
              <button className="st-btn sm" onClick={() => vereisSelectie('Prijsaanvraag maken', () => setAanvragen(true))}>Prijsaanvraag maken</button>
              <button className="st-btn primary sm" onClick={() => vereisSelectie('Vergelijken', () => navigate(`/bestellingen/vergelijk/${selectie.map((r) => r.id).join(',')}`))}>
                Vergelijken &amp; kiezen
              </button>
            </div>
            {regelsQ.isLoading ? <div className="st-empty">Laden…</div> : <TeBestellenTab regels={open} data={vergelijkQ.data} gekozen={gekozen} onGekozen={setGekozen} />}
            <BesteldeRegels regels={alle.filter((r) => r.status === 'besteld' || r.status === 'ontvangen')} />
          </>
        ) : tab === 'aanvragen' ? (
          <PrijsaanvragenTab aanvragen={aanvragenQ.data ?? []} regels={alle} open={openAanvraag} />
        ) : tab === 'inkooporders' ? (
          <InkoopordersTab orders={ordersQ.data ?? []} />
        ) : (
          <OntvangenTab ontvangsten={ontvangstenQ.data ?? []} />
        )}
      </div>

      {nieuw && <BestelRegelVenster onSluit={() => setNieuw(false)} />}
      {aanvragen && (
        <PrijsaanvraagVenster
          regels={selectie} data={vergelijkQ.data}
          onSluit={() => setAanvragen(false)}
          onGemaakt={(a) => { setAanvragen(false); setGekozen(new Set()); setOpenAanvraag(a.id); setTab('aanvragen') }}
        />
      )}
    </>
  )
}
