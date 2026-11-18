import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { afspraakGeldtOp, afspraakTekst, geldendeAfspraak, vandaagIso, type Prijsafspraak } from '@stockmanager/shared'
import { prijsafsprakenApi } from '../../../api/prijsafspraken'
import { meldFout } from '../../../utils/fout-melding-toon'
import { PrijsafspraakVenster } from './PrijsafspraakVenster'

const euro = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const nl = (d: string | null) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : '—')

/**
 * De prijsafspraken van één artikel met zijn klant (2026-11-18): staffel en
 * geldigheid. Wat er vandaag bij 1 stuk geldt, staat gemarkeerd.
 */
export function PrijsafsprakenKaart({ artikelId, klantNaam, alleenLezen }: {
  artikelId: string
  klantNaam: string | null
  alleenLezen: boolean
}) {
  const qc = useQueryClient()
  const [venster, setVenster] = useState<{ bestaand?: Prijsafspraak } | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['prijsafspraken', 'artikel', artikelId],
    queryFn: () => prijsafsprakenApi.list({ artikelId }),
  })
  const weg = useMutation({
    mutationFn: (a: Prijsafspraak) => prijsafsprakenApi.verwijder(a.id).then(() => a),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['prijsafspraken'] })
      notifications.show({ color: 'green', message: `Prijsafspraak ${afspraakTekst(a)} verwijderd` })
    },
    onError: (e) => meldFout({ actie: 'Prijsafspraak verwijderen', fout: e, gevolg: 'De afspraak staat er nog.' }),
  })

  const lijst = data ?? []
  const vandaag = vandaagIso()
  const nu = geldendeAfspraak(lijst, 1, vandaag)

  return (
    <section className="av-sectie">
      <div className="av-kop">
        <h3>Prijsafspraken</h3>
        <span className="av-uitleg">
          {klantNaam ? `Met ${klantNaam}. In een project van een andere klant gelden ze niet.` : 'Dit artikel heeft geen klant: de afspraak geldt voor iedereen.'}
        </span>
        <Button size="xs" variant="light" leftSection={<IconPlus size={12} />} disabled={alleenLezen}
          onClick={() => setVenster({})}>Afspraak toevoegen</Button>
      </div>
      {isLoading ? <div className="st-empty">Prijsafspraken laden…</div>
        : error ? <div className="st-empty">De prijsafspraken konden niet geladen worden.</div>
        : lijst.length === 0 ? (
          <div className="st-empty" style={{ padding: 18 }}>
            Nog geen prijsafspraak. Zonder afspraak komt de prijs uit de calculatie, of typ je hem zelf.
          </div>
        ) : (
          <div className="ph-tabel-wrap">
            <table className="st-tbl av-tabel">
              <thead>
                <tr>
                  <th style={{ width: '16%', textAlign: 'right' }}>Prijs / stuk</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Vanaf</th>
                  <th style={{ width: '14%' }}>Geldig vanaf</th>
                  <th style={{ width: '14%' }}>Tot en met</th>
                  <th>Kenmerk</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {lijst.map((a) => {
                  const geldig = afspraakGeldtOp(a, vandaag)
                  return (
                    <tr key={a.id} className={geldig ? undefined : 'av-verlopen'}>
                      <td className="cell-mono" style={{ textAlign: 'right' }}>
                        {euro(a.prijs)} {nu?.id === a.id && <span className="av-geldt">geldt nu</span>}
                      </td>
                      <td className="cell-mono" style={{ textAlign: 'right' }}>{a.vanafAantal} st</td>
                      <td className="cell-mono">{nl(a.geldigVan)}</td>
                      <td className="cell-mono">{nl(a.geldigTot)}{!geldig && a.geldigTot && a.geldigTot < vandaag ? ' (verlopen)' : ''}</td>
                      <td>{a.kenmerk ?? '—'}{a.door ? <span className="cell-muted"> · {a.door}</span> : null}</td>
                      <td className="av-acties">
                        <Button size="compact-xs" variant="subtle" disabled={alleenLezen} aria-label="Wijzigen"
                          onClick={() => setVenster({ bestaand: a })}><IconPencil size={12} /></Button>
                        <Button size="compact-xs" variant="subtle" color="red" disabled={alleenLezen} aria-label="Verwijderen"
                          loading={weg.isPending && weg.variables?.id === a.id} onClick={() => weg.mutate(a)}><IconTrash size={12} /></Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      {venster && (
        <PrijsafspraakVenster artikelId={artikelId} bestaand={venster.bestaand}
          anderen={lijst.filter((a) => a.id !== venster.bestaand?.id)} onSluit={() => setVenster(null)} />
      )}
    </section>
  )
}
