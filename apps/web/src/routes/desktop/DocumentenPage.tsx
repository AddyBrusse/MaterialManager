import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { IconFileText, IconPlus, IconSearch } from '@tabler/icons-react'
import { DOCUMENT_SOORTEN, type DocumentSoort } from '@stockmanager/shared'
import { documentenApi } from '../../api/documenten'
import { relatiesApi } from '../../api/relaties'
import { formatBedrag, formatDate } from '../../api/projects'
import { statusBadge, SOORT_KORT, zoektekst } from '../../components/documenten/documentStatus'

// Alle offertes, opdrachtbevestigingen, paklijsten en facturen door elkaar, om
// op nummer terug te vinden zonder te weten bij welk project het hoort. Een rij
// opent het project op de tab van dat document (punt 1 + 2 uit
// features/61-orderproces-backlog.md).
const TAB_VAN_SOORT: Record<DocumentSoort, string> = {
  offerte: 'offertes',
  opdrachtbevestiging: 'opdrachtbevestiging',
  paklijst: 'paklijst',
  factuur: 'factuur',
}

export function DocumentenPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [soort, setSoort] = useState<'' | DocumentSoort>('')
  const [klant, setKlant] = useState('')

  const { data, isPending } = useQuery({
    queryKey: ['documenten'],
    queryFn: documentenApi.list,
  })
  const documenten = data?.data ?? []
  const relaties = relatiesApi.listSync()
  const klantNaam = (id: string | null) => relaties.find(r => r.id === id)?.naam ?? ''

  const klantOpties = useMemo(() => {
    const ids = [...new Set(documenten.map(d => d.relatieId).filter(Boolean) as string[])]
    return ids.map(id => ({ id, naam: klantNaam(id) || id })).sort((a, b) => a.naam.localeCompare(b.naam))
  }, [documenten, relaties])

  const zichtbaar = useMemo(() => {
    const Q = q.trim().toLowerCase()
    return documenten.filter(d =>
      (!soort || d.soort === soort) &&
      (!klant || d.relatieId === klant) &&
      (!Q || zoektekst(d, klantNaam(d.relatieId)).includes(Q)),
    )
  }, [documenten, q, soort, klant, relaties])

  return (
    <>
      <div className="st-page-hd">
        <div>
          <h1 className="st-h1"><IconFileText size={19} />Documenten</h1>
          <p className="st-sub">Offertes, opdrachtbevestigingen, paklijsten en facturen</p>
        </div>
      </div>

      <div className="st-toolbar">
        <div className="st-search">
          <IconSearch size={14} />
          <input
            placeholder="Zoek op nummer, project, klant of referentie…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        <label className={`st-chip${soort ? ' active' : ''}`}>
          {!soort && <IconPlus size={11} />}
          <span>Soort</span>
          {soort && <span className="chip-val">: {SOORT_KORT[soort]}</span>}
          <select value={soort} onChange={e => setSoort(e.target.value as '' | DocumentSoort)}>
            <option value="">Alle soorten</option>
            {DOCUMENT_SOORTEN.map(s => <option key={s} value={s}>{SOORT_KORT[s]}</option>)}
          </select>
          {soort && <span className="chip-x" onClick={e => { e.preventDefault(); setSoort('') }}>×</span>}
        </label>

        <label className={`st-chip${klant ? ' active' : ''}`}>
          {!klant && <IconPlus size={11} />}
          <span>Klant</span>
          {klant && <span className="chip-val">: {klantOpties.find(k => k.id === klant)?.naam}</span>}
          <select value={klant} onChange={e => setKlant(e.target.value)}>
            <option value="">Alle klanten</option>
            {klantOpties.map(k => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
          {klant && <span className="chip-x" onClick={e => { e.preventDefault(); setKlant('') }}>×</span>}
        </label>

        <div style={{ flex: 1 }} />
        <span className="st-sub" style={{ fontSize: 12 }}>
          {zichtbaar.length} van {documenten.length}
        </span>
      </div>

      <div className="st-table-wrap">
        <div className="st-tbl-scroll">
          <table className="st-tbl">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Nummer</th>
                <th style={{ minWidth: 120 }}>Soort</th>
                <th style={{ minWidth: 180 }}>Klant</th>
                <th style={{ minWidth: 200 }}>Project</th>
                <th style={{ minWidth: 130 }}>Ref. klant</th>
                <th style={{ minWidth: 110 }}>Datum</th>
                <th style={{ minWidth: 120 }}>Status</th>
                <th style={{ minWidth: 60, textAlign: 'right' }}>Regels</th>
                <th style={{ minWidth: 120, textAlign: 'right' }}>Bedrag excl.</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map(d => {
                const badge = statusBadge(d.status)
                return (
                  <tr
                    key={`${d.soort}-${d.id}`}
                    onClick={() => navigate(`/projecten/${d.projectId}?tab=${TAB_VAN_SOORT[d.soort]}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="cell-mono">{d.id}</td>
                    <td>{SOORT_KORT[d.soort]}</td>
                    <td>{klantNaam(d.relatieId) || <span className="cell-muted">—</span>}</td>
                    <td>{d.projectNaam || <span className="cell-muted">Naamloos</span>}</td>
                    <td>{d.klantRef || <span className="cell-muted">—</span>}</td>
                    <td className="cell-muted">{formatDate(d.datum)}</td>
                    <td><span className={`badge ${badge.cls}`}><span className="dot" />{badge.label}</span></td>
                    <td style={{ textAlign: 'right' }}>{d.aantalRegels}</td>
                    <td style={{ textAlign: 'right' }}>
                      {d.bedrag === null ? <span className="cell-muted">—</span> : formatBedrag(d.bedrag)}
                    </td>
                  </tr>
                )
              })}
              {!isPending && zichtbaar.length === 0 && (
                <tr>
                  <td colSpan={9} className="cell-muted" style={{ textAlign: 'center', padding: 28 }}>
                    {documenten.length === 0 ? 'Nog geen documenten.' : 'Geen document voldoet aan de filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
