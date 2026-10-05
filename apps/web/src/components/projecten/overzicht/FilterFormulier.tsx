import { useState } from 'react'
import { PROJECT_STATUSES, type ProjectStatus } from '@stockmanager/shared'
import { PROJECT_STATUS_CONFIG } from '../projectColumns'
import { HEEFT_LABEL, LEVERTIJD_LABEL, type Filter, type HeeftWat } from './filters'

export type FilterSoort = Exclude<Filter['soort'], 'signaal'>

export interface Keuzes {
  klanten: { id: string; naam: string }[]
  contacten: { id: string; naam: string }[]
}

/**
 * De tweede stap van "+ Filter": de waarde kiezen. Eén formulier per soort,
 * steeds met één knop Toevoegen; wat niet ingevuld is, voegt niets toe.
 */
export function FilterFormulier({ soort, keuzes, nabelDagen, onKlaar }: {
  soort: FilterSoort
  keuzes: Keuzes
  nabelDagen: number
  onKlaar: (f: Filter) => void
}) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [periode, setPeriode] = useState<'voorbij' | 'week' | 'maand' | 'tussen'>('voorbij')
  const [dagen, setDagen] = useState(String(nabelDagen))

  const getal = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))
  let filter: Filter | null = null
  if (soort === 'klant' && a) filter = { soort, relatieId: a }
  if (soort === 'contact' && a) filter = { soort, contactId: a }
  if (soort === 'status' && a) filter = { soort, status: a as ProjectStatus }
  if (soort === 'levertijd') filter = periode === 'tussen' ? (a || b ? { soort, periode, van: a || undefined, tot: b || undefined } : null) : { soort, periode }
  if (soort === 'offerteLeeftijd' && Number(dagen) > 0) filter = { soort, dagen: Math.round(Number(dagen)) }
  if (soort === 'bedrag' && (getal(a) != null || getal(b) != null)) filter = { soort, min: getal(a), max: getal(b) }
  if (soort === 'aangemaakt' && (a || b)) filter = { soort, van: a || undefined, tot: b || undefined }

  const kies = (opties: { id: string; naam: string }[], leeg: string) => (
    <select className="st-input" value={a} onChange={(e) => setA(e.target.value)} autoFocus>
      <option value="">{leeg}</option>
      {opties.map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
    </select>
  )
  const datums = (
    <div className="prj-ff-rij">
      <label>van<input className="st-input" type="date" value={a} onChange={(e) => setA(e.target.value)} /></label>
      <label>t/m<input className="st-input" type="date" value={b} onChange={(e) => setB(e.target.value)} /></label>
    </div>
  )

  if (soort === 'heeft') {
    return (
      <div className="prj-ff">
        {(Object.keys(HEEFT_LABEL) as HeeftWat[]).map((wat) => (
          <button key={wat} type="button" className="prj-ff-optie" onClick={() => onKlaar({ soort, wat })}>
            Heeft {HEEFT_LABEL[wat]}
          </button>
        ))}
      </div>
    )
  }

  return (
    <form className="prj-ff" onSubmit={(e) => { e.preventDefault(); if (filter) onKlaar(filter) }}>
      {soort === 'klant' && kies(keuzes.klanten, 'Kies een klant…')}
      {soort === 'contact' && kies(keuzes.contacten, 'Kies een contactpersoon…')}
      {soort === 'status' &&
        kies(PROJECT_STATUSES.map((s) => ({ id: s, naam: PROJECT_STATUS_CONFIG[s].label })), 'Kies een status…')}
      {soort === 'levertijd' && (
        <>
          <div className="prj-ff-rij">
            {(Object.keys(LEVERTIJD_LABEL) as (keyof typeof LEVERTIJD_LABEL)[]).map((p) => (
              <label key={p} className="prj-ff-radio">
                <input type="radio" checked={periode === p} onChange={() => setPeriode(p)} />
                {LEVERTIJD_LABEL[p]}
              </label>
            ))}
          </div>
          {periode === 'tussen' && datums}
        </>
      )}
      {soort === 'offerteLeeftijd' && (
        <label className="prj-ff-rij">
          Verstuurd langer dan
          <input className="st-input cell-mono" type="number" min={1} style={{ width: 70 }} value={dagen} onChange={(e) => setDagen(e.target.value)} autoFocus />
          dagen, zonder reactie
        </label>
      )}
      {soort === 'bedrag' && (
        <div className="prj-ff-rij">
          <label>vanaf €<input className="st-input cell-mono" inputMode="decimal" style={{ width: 90 }} value={a} onChange={(e) => setA(e.target.value)} autoFocus /></label>
          <label>tot €<input className="st-input cell-mono" inputMode="decimal" style={{ width: 90 }} value={b} onChange={(e) => setB(e.target.value)} /></label>
        </div>
      )}
      {soort === 'aangemaakt' && datums}
      <button type="submit" className="st-btn primary" disabled={!filter}>Toevoegen</button>
    </form>
  )
}
