import type { Project, Relatie, UpdateProject } from '@stockmanager/shared'
import type { ActiviteitVM } from '../types'
import { Card } from '../components/Card'
import { MailImportKaart } from '../components/MailImportKaart'
import { BasisGegevens } from './algemeen/BasisGegevens'

interface Props {
  project: Project
  relaties: Relatie[]
  activiteit: ActiviteitVM[]
  geblokkeerd: boolean
  onGewijzigd: () => void
  onZet: (patch: UpdateProject) => void
  onRelatiesGewijzigd: () => void
}

/** §5.1 — basisgegevens, notities en recente activiteit. */
export function AlgemeenTab({ project: p, relaties, activiteit, geblokkeerd, onGewijzigd, onZet, onRelatiesGewijzigd }: Props) {
  return (
    <>
      <BasisGegevens
        project={p}
        relaties={relaties}
        geblokkeerd={geblokkeerd}
        onZet={onZet}
        onRelatiesGewijzigd={onRelatiesGewijzigd}
      />

      <Card titel="Notities">
        <div className="pdv2-veld">
          <label htmlFor="pdv2-notities">Notities</label>
          <textarea
            id="pdv2-notities"
            key={p.notities}
            defaultValue={p.notities}
            disabled={geblokkeerd}
            placeholder="Intern: wat je over dit project kwijt wilt. Komt niet op een document."
            // Bij het verlaten van het veld; eerder werd dit nooit opgeslagen.
            onBlur={(e) => {
              const v = e.currentTarget.value
              if (v !== p.notities) onZet({ notities: v })
            }}
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
