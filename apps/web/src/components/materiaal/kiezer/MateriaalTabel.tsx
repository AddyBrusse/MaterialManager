import { Checkbox, MultiSelect, NumberInput, Select, TextInput } from '@mantine/core'
import type { MateriaalFilter, MateriaalGroep, Sorteer } from '../materiaal-groepen'
import { LEEG_FILTER } from '../materiaal-groepen'

const nl = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 0 })

export function MateriaalFilters({ f, opties, onF }: {
  f: MateriaalFilter
  opties: { kwaliteiten: string[]; vormen: string[]; afwerkingen: string[] }
  onF: (f: MateriaalFilter) => void
}) {
  const zet = (p: Partial<MateriaalFilter>) => onF({ ...f, ...p })
  const getal = (v: string | number) => (v === '' || v == null ? null : Number(v))
  return (
    <div className="mk-filters">
      <TextInput size="xs" label="Zoeken" placeholder="kwaliteit, vorm, maat, nummer…" w={220}
        value={f.zoek} onChange={(e) => zet({ zoek: e.currentTarget.value })} data-autofocus />
      <MultiSelect size="xs" label="Kwaliteit" placeholder={f.kwaliteiten.length ? '' : 'Alle'} w={200} searchable clearable
        data={opties.kwaliteiten} value={f.kwaliteiten} onChange={(v) => zet({ kwaliteiten: v })} />
      <MultiSelect size="xs" label="Vorm" placeholder={f.vormen.length ? '' : 'Alle'} w={160} clearable
        data={opties.vormen} value={f.vormen} onChange={(v) => zet({ vormen: v })} />
      <NumberInput size="xs" label="Maat van" w={80} min={0} hideControls value={f.maatVan ?? ''} onChange={(v) => zet({ maatVan: getal(v) })} />
      <NumberInput size="xs" label="tot" w={80} min={0} hideControls value={f.maatTot ?? ''} onChange={(v) => zet({ maatTot: getal(v) })} />
      <Select size="xs" label="Afwerking" placeholder="Alle" w={140} clearable
        data={opties.afwerkingen} value={f.afwerking} onChange={(v) => zet({ afwerking: v })} />
      <Checkbox size="xs" label="Alleen vrije voorraad" checked={f.alleenVrij} onChange={(e) => zet({ alleenVrij: e.currentTarget.checked })} pb={6} />
      <Checkbox size="xs" label="Exoten tonen" checked={f.exoten} onChange={(e) => zet({ exoten: e.currentTarget.checked })} pb={6} />
      <button type="button" className="reset" onClick={() => onF(LEEG_FILTER)}>Filters wissen</button>
    </div>
  )
}

const KOLOMMEN: { op: Sorteer; label: string; n?: boolean }[] = [
  { op: 'kwaliteit', label: 'Kwaliteit' }, { op: 'vorm', label: 'Vorm' }, { op: 'maat', label: 'Afmeting' },
  { op: 'afwerking', label: 'Afwerking' }, { op: 'staven', label: 'Staven', n: true },
  { op: 'vrij', label: 'Vrij (mm)', n: true }, { op: 'langste', label: 'Langste', n: true },
]

/** Eén rij per soort materiaal; klik = kiezen voor het paneel, dubbelklik = meteen nemen. */
export function MateriaalTabel({ groepen, totaal, gekozen, sorteer, prijsPerKg, onSorteer, onKies, onNeem }: {
  groepen: MateriaalGroep[]
  totaal: number
  gekozen: string | null
  sorteer: { op: Sorteer; oplopend: boolean }
  prijsPerKg: (gradeId: string) => number | undefined
  onSorteer: (op: Sorteer) => void
  onKies: (g: MateriaalGroep) => void
  onNeem: (g: MateriaalGroep) => void
}) {
  return (
    <div className="mk-tabel">
      <table>
        <thead>
          <tr>
            {KOLOMMEN.map((k) => (
              <th key={k.op} className={k.n ? 'n' : undefined} onClick={() => onSorteer(k.op)}>
                {k.label}{sorteer.op === k.op ? (sorteer.oplopend ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th className="n">€/kg</th>
          </tr>
        </thead>
        <tbody>
          {groepen.map((g) => {
            const klasse = g.vrijMm <= 0 ? 'geen' : g.langsteMm < 1500 ? 'laag' : 'ok'
            const prijs = prijsPerKg(g.rij.gradeId)
            return (
              <tr key={g.sleutel} data-gekozen={g.sleutel === gekozen || undefined}
                onClick={() => onKies(g)} onDoubleClick={() => onNeem(g)}>
                <td>{g.kwaliteit}</td>
                <td>{g.vorm}</td>
                <td className="mono"><b>{g.afmeting}</b></td>
                <td className="dim">
                  {g.exoot ? <span className="mk-tag exoot">exoot{g.rij.klant ? ` · ${g.rij.klant.naam}` : ''}</span> : g.afwerking || '—'}
                </td>
                <td className="n">{g.staven}</td>
                <td className={`n ${klasse}`}>{g.vrijMm > 0 ? nl(g.vrijMm) : g.exoot ? 'bij opdracht' : '—'}</td>
                <td className="n dim">{g.langsteMm > 0 ? nl(g.langsteMm) : '—'}</td>
                <td className="n">{prijs != null ? prijs.toFixed(2).replace('.', ',') : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="voet">
        {groepen.length === 0 ? 'Geen materiaal voor deze filters.' : `${groepen.length} van ${totaal} materialen`} · klik op een kolomkop om te sorteren · dubbelklik = kiezen
      </div>
    </div>
  )
}
