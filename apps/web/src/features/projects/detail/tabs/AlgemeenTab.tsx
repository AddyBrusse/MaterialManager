import { useState } from 'react'
import type { Project, Relatie } from '@stockmanager/shared'
import type { ActiviteitVM } from '../types'
import { Card } from '../components/Card'
import { MailImportKaart } from '../components/MailImportKaart'
import { datum, relatieveDagen } from '../lib/format'

interface Props {
  project: Project
  relatie: Relatie | null
  activiteit: ActiviteitVM[]
  geblokkeerd: boolean
  onGewijzigd: () => void
}

function Veld({
  label,
  waarde,
  hint,
  bewerkbaar,
}: {
  label: string
  waarde: string
  hint?: string
  bewerkbaar?: boolean
}) {
  const id = `pdv2-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <div className="pdv2-veld">
      <label htmlFor={id}>{label}</label>
      <input id={id} defaultValue={waarde} readOnly={!bewerkbaar} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

/** §5.1 — basisgegevens, notities en recente activiteit. */
export function AlgemeenTab({ project: p, relatie, activiteit, geblokkeerd, onGewijzigd }: Props) {
  const [bewerken, setBewerken] = useState(false)
  const contact = relatie?.contacten?.find((c) => c.id === p.contactId) ?? null

  return (
    <>
      <Card
        titel="Basisgegevens"
        acties={
          <button
            type="button"
            className="pdv2-btn s"
            onClick={() => setBewerken((v) => !v)}
            disabled={geblokkeerd}
          >
            {bewerken ? 'Klaar' : 'Bewerken'}
          </button>
        }
      >
        <div className="pdv2-grid3">
          <Veld
            label="Klant"
            waarde={relatie?.naam ?? ''}
            hint={relatie?.kvk ? `KvK ${relatie.kvk}` : undefined}
            bewerkbaar={bewerken}
          />
          <Veld
            label="Contactpersoon"
            waarde={contact?.naam ?? ''}
            hint={contact?.email ?? undefined}
            bewerkbaar={bewerken}
          />
          <Veld label="Uw referentie" waarde={p.klantRef ?? ''} bewerkbaar={bewerken} />
          <Veld
            label="Levertijd"
            waarde={datum(p.levertijdDatum)}
            hint={relatieveDagen(p.levertijdDatum) || undefined}
            bewerkbaar={bewerken}
          />
          <Veld label="Aangemaakt" waarde={datum(p.createdAt)} />
          <Veld label="Gewijzigd" waarde={datum(p.updatedAt)} />
        </div>
      </Card>

      <Card titel="Notities">
        <div className="pdv2-veld">
          <label htmlFor="pdv2-notities">Notities</label>
          <textarea
            id="pdv2-notities"
            defaultValue={p.notities}
            readOnly={!bewerken}
            placeholder="Geen notities."
          />
        </div>
      </Card>

      <MailImportKaart project={p} geblokkeerd={geblokkeerd} onGewijzigd={onGewijzigd} />

      <Card titel="Recente activiteit" plat>
        {activiteit.length === 0 ? (
          <div className="pdv2-empty">Nog niets gebeurd op dit project.</div>
        ) : (
          <table className="pdv2-tbl">
            <tbody>
              {activiteit.map((a, i) => (
                <tr key={`${a.tijd}-${i}`}>
                  <td className="mono" style={{ width: 110, color: 'var(--text3)' }}>
                    {a.tijd}
                  </td>
                  <td>{a.tekst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
