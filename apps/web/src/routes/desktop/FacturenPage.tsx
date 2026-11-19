import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconFileInvoice, IconPlus } from '@tabler/icons-react'
import type { VerkoopFactuur } from '@stockmanager/shared'
import { facturenApi } from '../../api/facturen'
import { FacturenFilters } from '../../components/facturen/FacturenFilters'
import { FacturenTabel } from '../../components/facturen/FacturenTabel'
import { LosseFactuurVenster } from '../../components/facturen/LosseFactuurVenster'
import { NieuweCreditVenster } from '../../components/facturen/NieuweCreditVenster'
import { filter, GEEN_FILTERS, sorteer, type Filters } from '../../components/facturen/facturen-lijst'
import type { Bewerk } from '../../components/facturen/useConceptFactuur'
import { useFactuurRijActies } from '../../components/facturen/useFactuurRijActies'
import { useLosseFactuurDocument } from '../../components/facturen/useLosseFactuurDocument'
import { meldFout } from '../../utils/fout-melding-toon'
import '../../features/projects/detail/project-detail.css'
import '../../components/facturen/facturen.css'

/**
 * Facturen (2026-11-18): alle facturen en credits, met en zonder project. Een
 * losse factuur of credit (bij de klant, voor artikelen uit voorraad) maak,
 * pas aan en verstuur je hier; een projectfactuur opent op zijn project.
 */
export function FacturenPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [filters, setFilters] = useState<Filters>(GEEN_FILTERS)
  const [bewerk, setBewerk] = useState<Bewerk | null>(null)
  const [credit, setCredit] = useState<{ van: VerkoopFactuur | null } | null>(null)

  const { data: facturen = [], isPending, error } = useQuery({ queryKey: ['facturen', 'alle'], queryFn: facturenApi.list })
  const ververs = () => {
    void qc.invalidateQueries({ queryKey: ['facturen'] })
    void qc.invalidateQueries({ queryKey: ['documenten'] })
    void qc.invalidateQueries({ queryKey: ['artikel-voorraad'] })
  }
  useEffect(() => {
    if (error) meldFout({ actie: 'Facturen laden', fout: error, gevolg: 'De lijst is leeg of verouderd. Er is niets gewijzigd.' })
  }, [error])
  const doc = useLosseFactuurDocument(ververs)
  const rij = useFactuurRijActies(ververs)

  const klanten = useMemo(() => {
    const m = new Map(facturen.filter((f) => f.relatieId).map((f) => [f.relatieId!, f.klantNaam ?? f.relatieId!]))
    return [...m.entries()].map(([id, naam]) => ({ id, naam })).sort((a, b) => a.naam.localeCompare(b.naam))
  }, [facturen])
  const zichtbaar = useMemo(() => sorteer(filter(facturen, filters)), [facturen, filters])

  const open = (f: VerkoopFactuur) => {
    if (f.projectId) navigate(`/projecten/${f.projectId}?tab=facturen`)
    else setBewerk({ soort: f.soort, factuur: f })
  }

  return (
    <>
      <div className="st-page-hd">
        <div>
          <h1 className="st-h1"><IconFileInvoice size={19} />Facturen</h1>
          <p className="st-sub">Alle facturen en credits. Losse facturen voor artikelen uit voorraad maak je hier; een projectfactuur op zijn project.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="st-btn" onClick={() => setCredit({ van: null })}><IconPlus size={13} /> Nieuwe credit</button>
          <button type="button" className="st-btn primary" onClick={() => setBewerk({ soort: 'factuur', factuur: null })}><IconPlus size={13} /> Nieuwe factuur</button>
        </div>
      </div>

      <FacturenFilters filters={filters} onFilters={setFilters} klanten={klanten} zichtbaar={zichtbaar.length} totaal={facturen.length} />

      <div className="st-table-wrap">
        <div className="st-tbl-scroll">
          <FacturenTabel facturen={zichtbaar} bezig={doc.bezig}
            leeg={error ? 'De facturen zijn niet te laden. Ververs de pagina.' : isPending ? 'Laden…' : facturen.length === 0 ? 'Nog geen facturen.' : 'Geen factuur voldoet aan de filters.'}
            onOpen={open} onPdf={doc.openen} onPakbon={doc.pakbon} onVerstuur={(f) => void doc.klaarzetten(f)}
            onVerwijder={rij.verwijder} onTrekIn={rij.trekIn} onBetaald={rij.betaald} onCrediteer={(f) => setCredit({ van: f })} />
        </div>
      </div>

      {bewerk && (
        <LosseFactuurVenster key={bewerk.factuur?.id ?? 'nieuw'} bewerk={bewerk} facturen={facturen} onSluit={() => setBewerk(null)}
          onOpgeslagen={ververs} onPdf={doc.openen} onPakbon={doc.pakbon}
          onVersturen={(f) => { setBewerk(null); void doc.klaarzetten(f) }} />
      )}
      {credit && (
        <NieuweCreditVenster facturen={facturen} vanFactuur={credit.van} onSluit={() => setCredit(null)}
          onGemaakt={(c) => { setCredit(null); ververs(); setBewerk({ soort: 'credit', factuur: c }) }} />
      )}
      <div className="pdv2 fact-dialoog">
        {doc.dialoog}
        {rij.dialoog}
      </div>
    </>
  )
}
