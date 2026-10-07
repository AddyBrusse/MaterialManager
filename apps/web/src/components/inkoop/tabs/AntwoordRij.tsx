import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { prijsVanAntwoord, type AntwoordSoort, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { bestelRegelsApi, prijsaanvragenApi } from '../../../api/bestellingen'
import { meldFout } from '../../../utils/fout-melding-toon'
import { Weigering } from '../../../utils/fout-melding'
import { eur } from '../bestellingen/bestel-tekst'
import { ddmm, lokaleDag } from '../overzicht/tekst'

type Gevraagd = InkoopOverzichtRegel['gevraagd'][number]
const getal = (v: string) => { const n = Number(v.replace(',', '.')); return v.trim() === '' || !Number.isFinite(n) ? null : n }
const tekst = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

/**
 * Eén gevraagde leverancier bij één regel (tab 2, 2026-10-07): hoe ze rekenen,
 * de prijs, zagen en levertijd, meteen in de rij. Bewaren gebeurt bij het
 * verlaten van een veld; een lege prijs wist het antwoord.
 */
export function AntwoordRij({ r, g, goedkoopst, gekozen }: { r: InkoopOverzichtRegel; g: Gevraagd; goedkoopst: boolean; gekozen: boolean }) {
  const qc = useQueryClient()
  const [soort, setSoort] = useState<AntwoordSoort>(g.antwoord?.prijsSoort ?? 'per_kg')
  const [prijs, setPrijs] = useState(tekst(g.antwoord?.prijs))
  const [zagen, setZagen] = useState(tekst(g.antwoord?.zaagkostenPerSnede))
  const [dagen, setDagen] = useState(tekst(g.antwoord?.levertijdDagen))
  const ververs = () => { for (const k of ['inkoop', 'prijsaanvragen', 'bestel-regels', 'bestel-geschiedenis']) qc.invalidateQueries({ queryKey: [k] }) }

  const kies = useMutation({
    mutationFn: () => {
      if (!g.antwoord) throw new Weigering(`Vul eerst de prijs van ${g.naam} in.`)
      return bestelRegelsApi.kies(r.id, { leverancierId: g.leverancierId, bron: 'antwoord', antwoordId: g.antwoord.id })
    },
    onSuccess: ververs,
    onError: (e) => meldFout({ actie: `${g.naam} kiezen voor ${r.materiaal}`, fout: e, gevolg: 'De keuze is niet veranderd.' }),
  })

  const bewaar = useMutation({
    mutationFn: (s: AntwoordSoort) => prijsaanvragenApi.cel(g.aanvraagId, g.leverancierId, r.id, {
      prijsSoort: s, prijs: getal(prijs), zaagkostenPerSnede: getal(zagen), levertijdDagen: getal(dagen) == null ? null : Math.round(getal(dagen)!),
    }),
    // Is deze leverancier al gekozen, dan legt de keuze de nieuwe prijs opnieuw
    // vast: anders zou de buffer met de oude prijs bestellen.
    onSuccess: () => { ververs(); if (gekozen && g.antwoord && getal(prijs) != null) kies.mutate() },
    onError: (e) => meldFout({ actie: `Antwoord van ${g.naam} bij ${r.materiaal} bewaren`, fout: e, gevolg: 'Het antwoord is niet bewaard; wat je typte staat nog in de velden.' }),
  })
  const opslaan = (s = soort) => {
    const oud = g.antwoord
    const nieuw = { soort: s, prijs: getal(prijs), zagen: getal(zagen), dagen: getal(dagen) }
    const zelfde = oud
      ? oud.prijsSoort === nieuw.soort && oud.prijs === nieuw.prijs && (oud.zaagkostenPerSnede ?? null) === nieuw.zagen && (oud.levertijdDagen ?? null) === nieuw.dagen
      : nieuw.prijs == null
    if (!zelfde) bewaar.mutate(s)
  }
  const p = getal(prijs)
  const totaal = p == null ? null : prijsVanAntwoord({ prijsSoort: soort, prijs: p, zaagkostenPerSnede: soort === 'totaal' ? null : getal(zagen) }, { stuks: r.stuks, kg: r.kg, gradeId: '', rawMaterialId: null }).totaal
  const naam = `${g.naam} bij ${r.materiaal}`

  return (
    <tr data-gekozen={gekozen}>
      <td className="lev">
        <span className={gekozen ? 'cell-strong' : undefined}>{g.naam}</span>
        {goedkoopst && <span className="ib-goedkoopst">GOEDKOOPST</span>}
      </td>
      <td className="cell-mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>{g.aanvraagId}{g.verzondenOp ? ` · ${ddmm(lokaleDag(g.verzondenOp))}` : ' · niet gemaild'}</td>
      <td>
        <select className="ib-cel-sel" aria-label={`Prijs als, ${naam}`} value={soort} onChange={(e) => { const s = e.currentTarget.value as AntwoordSoort; setSoort(s); opslaan(s) }}>
          <option value="per_kg">per kg</option><option value="per_stuk">per stuk</option><option value="totaal">totaal</option>
        </select>
      </td>
      <td><input className="ib-cel-in" aria-label={`Prijs, ${naam}`} placeholder="prijs" value={prijs} onChange={(e) => setPrijs(e.currentTarget.value)} onBlur={() => opslaan()} /></td>
      <td>
        {soort === 'totaal' ? <span className="ib-sub">in totaal</span>
          : <input className="ib-cel-in" aria-label={`Zagen per snede, ${naam}`} value={zagen} onChange={(e) => setZagen(e.currentTarget.value)} onBlur={() => opslaan()} />}
      </td>
      <td><input className="ib-cel-in kort" aria-label={`Levertijd in werkdagen, ${naam}`} value={dagen} onChange={(e) => setDagen(e.currentTarget.value)} onBlur={() => opslaan()} /> <span className="ib-sub">wd</span></td>
      <td className="cell-mono ta-r" style={gekozen ? { fontWeight: 600 } : undefined}>{totaal == null ? '—' : eur(totaal)}</td>
      <td style={{ textAlign: 'center' }}>
        <input type="radio" name={`kies-${r.id}`} checked={gekozen} aria-label={`Kies ${naam}`} onChange={() => kies.mutate()} />
      </td>
    </tr>
  )
}
