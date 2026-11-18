import { NumberInput, Select, TextInput } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import type { ArtikelVerkoopInfo } from '@stockmanager/shared'
import type { Article } from '../../api/articles'
import { eur } from '../../features/projects/detail/lib/format'
import type { PrijsBron, PrijsVoorstel } from './regel-prijs'

export interface ConceptRegel {
  sleutel: string
  artikelId: string | null
  naam: string
  qty: number
  eenheid: string
  verkoopprijs: number
  bron: PrijsBron | 'factuur'
  bronTekst: string
}

interface Props {
  regels: ConceptRegel[]
  onRegels: (r: ConceptRegel[]) => void
  /** De artikelen van de klant, om toe te voegen. */
  artikelen: Article[]
  info: ArtikelVerkoopInfo[]
  stel: (artikel: Article, qty: number) => PrijsVoorstel
  bewerkbaar: boolean
  /** Een credit op een factuur neemt alleen regels van die factuur: dan niets toevoegen. */
  toevoegen: boolean
  toonVoorraad: boolean
}

const nieuweSleutel = () => Math.random().toString(36).slice(2, 9)
const rond = (n: number) => Math.round(n * 100) / 100

/** De regels van een losse factuur of credit, met prijsvoorstel en voorraad per artikel. */
export function LosseRegelsTabel({ regels, onRegels, artikelen, info, stel, bewerkbaar, toevoegen, toonVoorraad }: Props) {
  const zet = (sleutel: string, wijzig: (r: ConceptRegel) => ConceptRegel) =>
    onRegels(regels.map((r) => (r.sleutel === sleutel ? wijzig(r) : r)))
  const artikel = (id: string | null) => artikelen.find((a) => a.id === id)

  const zetAantal = (r: ConceptRegel, qty: number) => zet(r.sleutel, (x) => {
    const a = artikel(x.artikelId)
    // Een afspraak volgt zijn staffel; een getypte prijs blijft staan.
    if (a && x.bron === 'afspraak') {
      const v = stel(a, qty)
      return { ...x, qty, verkoopprijs: v.prijs, bron: v.bron, bronTekst: v.tekst }
    }
    return { ...x, qty }
  })
  const voegToe = (id: string | null) => {
    const a = artikel(id)
    if (!a) return
    const v = stel(a, 1)
    onRegels([...regels, { sleutel: nieuweSleutel(), artikelId: a.id, naam: a.naam, qty: 1, eenheid: 'st', verkoopprijs: v.prijs, bron: v.bron, bronTekst: v.tekst }])
  }
  const vrijeRegel = () => onRegels([...regels, {
    sleutel: nieuweSleutel(), artikelId: null, naam: '', qty: 1, eenheid: 'st', verkoopprijs: 0, bron: 'hand', bronTekst: 'vrije regel',
  }])
  const opties = artikelen.filter((a) => !regels.some((r) => r.artikelId === a.id)).map((a) => ({ value: a.id, label: `${a.id} · ${a.naam}` }))

  return (
    <table className="st-tbl fact-regels">
      <thead>
        <tr>
          <th>Omschrijving</th>
          <th style={{ width: 90, textAlign: 'right' }}>Aantal</th>
          <th style={{ width: 150, textAlign: 'right' }}>Prijs / stuk</th>
          <th style={{ width: 100, textAlign: 'right' }}>Totaal</th>
          {toonVoorraad && <th style={{ width: 120 }}>Voorraad</th>}
          <th style={{ width: 30 }} />
        </tr>
      </thead>
      <tbody>
        {regels.length === 0 && (
          <tr><td colSpan={6} className="cell-muted" style={{ padding: 14 }}>Nog geen regels. Kies hieronder een artikel van deze klant, of een vrije regel.</td></tr>
        )}
        {regels.map((r) => {
          const i = info.find((x) => x.artikelId === r.artikelId)
          const tekort = toonVoorraad && i && r.qty > i.vrij
          return (
            <tr key={r.sleutel}>
              <td>
                <TextInput size="xs" value={r.naam} disabled={!bewerkbaar} aria-label="Omschrijving" placeholder="Bijvoorbeeld verzendkosten"
                  onChange={(e) => { const naam = e.currentTarget.value; zet(r.sleutel, (x) => ({ ...x, naam })) }} />
                {r.artikelId && <div className="fact-sub mono">{r.artikelId}</div>}
              </td>
              <td>
                <NumberInput size="xs" min={0} decimalSeparator="," value={r.qty} disabled={!bewerkbaar} aria-label="Aantal"
                  onChange={(v) => zetAantal(r, Number(v) || 0)} styles={{ input: { textAlign: 'right' } }} />
              </td>
              <td>
                <NumberInput size="xs" min={0} prefix="€ " decimalSeparator="," thousandSeparator="." decimalScale={4} value={r.verkoopprijs}
                  disabled={!bewerkbaar} aria-label="Prijs per stuk" styles={{ input: { textAlign: 'right' } }}
                  onChange={(v) => zet(r.sleutel, (x) => ({ ...x, verkoopprijs: Number(v) || 0, bron: 'hand', bronTekst: 'met de hand' }))} />
                <div className={`fact-sub fact-bron-${r.bron}`}>{r.bronTekst}</div>
              </td>
              <td className="cell-mono" style={{ textAlign: 'right' }}>{eur(rond(r.qty * r.verkoopprijs))}</td>
              {toonVoorraad && (
                <td className={tekort ? 'fact-tekort' : 'cell-muted'} style={{ fontSize: 11 }}>
                  {i ? <>vrij {i.vrij}{i.klaarVoorOrders > 0 && <> · klaar voor orders {i.klaarVoorOrders}</>}</> : '—'}
                </td>
              )}
              <td>
                {bewerkbaar && (
                  <button type="button" className="st-icon-btn danger" title="Regel weghalen"
                    onClick={() => onRegels(regels.filter((x) => x.sleutel !== r.sleutel))}>×</button>
                )}
              </td>
            </tr>
          )
        })}
        {bewerkbaar && toevoegen && (
          <tr className="fact-toevoegen">
            <td colSpan={6}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select size="xs" searchable placeholder={artikelen.length ? 'Artikel van deze klant toevoegen…' : 'Deze klant heeft nog geen artikelen'}
                  data={opties} value={null} onChange={voegToe} style={{ flex: 1 }} nothingFoundMessage="Geen artikel gevonden" />
                <button type="button" className="st-btn sm" onClick={vrijeRegel}><IconPlus size={12} /> Vrije regel</button>
              </div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
