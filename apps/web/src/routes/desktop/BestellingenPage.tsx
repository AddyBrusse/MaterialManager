import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { IconPlus } from '@tabler/icons-react'
import { vraagtVandaag, type InkoopOverzichtRegel, type Prijsaanvraag, type PrijsaanvraagLeverancier } from '@stockmanager/shared'
import { inkoopApi } from '../../api/inkoop'
import { bestelRegelsApi, prijsaanvragenApi } from '../../api/bestellingen'
import { inkoopordersApi } from '../../api/inkooporders'
import { InkoopTegels } from '../../components/inkoop/overzicht/InkoopTegels'
import { TeBestellenBlok } from '../../components/inkoop/overzicht/TeBestellenBlok'
import { OnderwegBlok, BinnenBlok } from '../../components/inkoop/overzicht/OnderwegBlok'
import { RegelPaneel } from '../../components/inkoop/overzicht/RegelPaneel'
import { PrijsInvullenVenster } from '../../components/inkoop/overzicht/PrijsInvullenVenster'
import { useBestellen } from '../../components/inkoop/overzicht/useBestellen'
import type { PrijsActies } from '../../components/inkoop/overzicht/LeverancierKeuze'
import { PrijsaanvragenTab } from '../../components/inkoop/bestellingen/PrijsaanvragenTab'
import { PrijsaanvraagVenster } from '../../components/inkoop/bestellingen/PrijsaanvraagVenster'
import { AntwoordVenster } from '../../components/inkoop/bestellingen/AntwoordVenster'
import { OntvangstVenster } from '../../components/inkoop/bestellingen/OntvangstVenster'
import { BestelRegelVenster } from '../../components/inkoop/bestellingen/BestelRegelVenster'
import { meldFout } from '../../utils/fout-melding-toon'
import { Weigering } from '../../utils/fout-melding'
import '../../components/inkoop/bestellingen/bestellingen.css'
import '../../components/inkoop/overzicht/overzicht.css'

/**
 * Bestellingen (2026-10-07): één pagina. Bovenaan of we op schema liggen, dan
 * wat besteld moet worden per leverancier (met de franco-grens, om te kunnen
 * bundelen), wat onderweg is, en wat er net binnenkwam.
 */
export function BestellingenPage() {
  const ovQ = useQuery({ queryKey: ['inkoop', 'overzicht'], queryFn: () => inkoopApi.overzicht(), refetchInterval: 20000 })
  const regelsQ = useQuery({ queryKey: ['bestel-regels'], queryFn: () => bestelRegelsApi.list() })
  const aanvragenQ = useQuery({ queryKey: ['prijsaanvragen'], queryFn: prijsaanvragenApi.list })
  const ordersQ = useQuery({ queryKey: ['inkooporders'], queryFn: inkoopordersApi.list })
  const ov = ovQ.data
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const [paneel, setPaneel] = useState<string | null>(null)
  const [binnen, setBinnen] = useState<InkoopOverzichtRegel | null>(null)
  const [vraag, setVraag] = useState<string[] | null>(null)
  const [invullen, setInvullen] = useState<InkoopOverzichtRegel | null>(null)
  const [antwoord, setAntwoord] = useState<{ a: Prijsaanvraag; l: PrijsaanvraagLeverancier } | null>(null)
  const [nieuw, setNieuw] = useState(false)
  const [openAanvraag, setOpenAanvraag] = useState<string | null>(null)
  const bestellen = useBestellen(ov)
  const [params, setParams] = useSearchParams()

  // Vanuit het belletje: ?regel=… opent die regel.
  const vanBel = params.get('regel')
  useEffect(() => {
    if (!vanBel) return
    setPaneel(vanBel)
    setParams({}, { replace: true })
  }, [vanBel, setParams])

  // Bij binnenkomst staat aangevinkt wat vandaag de deur uit moet.
  const begonnen = useRef(false)
  useEffect(() => {
    if (!ov || begonnen.current) return
    begonnen.current = true
    setGekozen(new Set(ov.regels.filter((r) => !r.order && r.leverancier?.soort === 'prijs' && vraagtVandaag(r.plan.stand)).map((r) => r.id)))
  }, [ov])

  const zet = (ids: string[], aan: boolean) => setGekozen((g) => { const n = new Set(g); for (const id of ids) aan ? n.add(id) : n.delete(id); return n })
  const alleRegels = regelsQ.data ?? []
  const acties: PrijsActies = {
    vraag: (r) => setVraag([r.id]),
    invullen: (r) => setInvullen(r),
    antwoord: (_r, o) => {
      const a = aanvragenQ.data?.find((x) => x.id === o.aanvraagId)
      const l = a?.leveranciers.find((x) => x.leverancierId === o.leverancierId)
      if (!a || !l) { meldFout({ actie: `Antwoord van ${o.naam} invullen`, fout: new Weigering(`Prijsaanvraag ${o.aanvraagId} is (nog) niet geladen. Ververs de pagina.`), gevolg: 'Er is niets veranderd.' }); return }
      setAntwoord({ a, l })
    },
  }
  const openBinnen = (r: InkoopOverzichtRegel) => setBinnen(r)
  const binnenOrder = binnen ? ordersQ.data?.find((o) => o.id === binnen.order?.id) : undefined
  const binnenRegel = binnenOrder?.regels.find((x) => x.id === binnen?.order?.inkooporderRegelId)
  const paneelRegel = ov?.regels.find((r) => r.id === paneel) ?? null
  const openIds = new Set(ov?.regels.filter((r) => r.status === 'te_bestellen' || r.status === 'aangevraagd').map((r) => r.id) ?? [])
  const lopend = (aanvragenQ.data ?? []).filter((a) => a.regelIds.some((id) => openIds.has(id)))

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Bestellingen</div>
          <div className="st-page-sub">Wat moet er besteld worden, wat is onderweg, en is het op tijd voor de productie?</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn primary" onClick={() => setNieuw(true)}><IconPlus size={14} />Materiaal toevoegen</button>
        </div>
      </div>

      <div className="ib-pagina">
        {ovQ.error ? (
          <div className="st-empty">Het inkoopoverzicht kon niet geladen worden: {(ovQ.error as Error).message}</div>
        ) : !ov ? <div className="st-empty">Laden…</div> : (
          <>
            <InkoopTegels ov={ov} />
            <TeBestellenBlok ov={ov} gekozen={gekozen} zet={zet} acties={acties} concept={bestellen.concept}
              onOpen={(r) => setPaneel(r.id)} onBestel={() => bestellen.open(ov.regels.filter((r) => gekozen.has(r.id) && !r.order))} />
            {lopend.length > 0 && (
              <details className="ib-binnen" open={!!openAanvraag || undefined}>
                <summary>Prijsaanvragen voor open regels ({lopend.length})</summary>
                <PrijsaanvragenTab aanvragen={lopend} regels={alleRegels} open={openAanvraag} />
              </details>
            )}
            <OnderwegBlok regels={ov.regels.filter((r) => r.status === 'besteld' && r.order?.status === 'verzonden')} onOpen={(r) => setPaneel(r.id)} onBinnen={openBinnen} />
            <BinnenBlok regels={ov.regels.filter((r) => r.status === 'ontvangen')} onOpen={(r) => setPaneel(r.id)} />
          </>
        )}
      </div>

      {bestellen.dialoog}
      {paneelRegel && <RegelPaneel key={paneelRegel.id} r={paneelRegel} onSluit={() => setPaneel(null)} onBinnen={openBinnen} />}
      {binnen && binnenOrder && binnenRegel && <OntvangstVenster order={binnenOrder} regel={binnenRegel} onSluit={() => setBinnen(null)} />}
      {nieuw && <BestelRegelVenster onSluit={() => setNieuw(false)} />}
      {vraag && (
        <PrijsaanvraagVenster regels={alleRegels.filter((r) => vraag.includes(r.id))} data={undefined} onSluit={() => setVraag(null)}
          onGemaakt={(a) => { setVraag(null); setOpenAanvraag(a.id) }} />
      )}
      {invullen && (
        <PrijsInvullenVenster r={invullen} onSluit={() => setInvullen(null)}
          onVerder={(a, levId) => { setInvullen(null); const l = a.leveranciers.find((x) => x.leverancierId === levId); if (l) setAntwoord({ a, l }) }} />
      )}
      {antwoord && <AntwoordVenster aanvraag={antwoord.a} leverancier={antwoord.l} regels={alleRegels} onSluit={() => setAntwoord(null)} />}
    </>
  )
}
