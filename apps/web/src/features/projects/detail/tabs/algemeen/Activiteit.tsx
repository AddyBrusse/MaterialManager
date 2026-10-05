import { useState } from 'react'
import type { ActiviteitVM } from '../../types'
import { Card } from '../../components/Card'

const EERST = 5

/** Recente activiteit: de laatste vijf, de rest op verzoek. */
export function Activiteit({ activiteit }: { activiteit: ActiviteitVM[] }) {
  const [alles, setAlles] = useState(false)
  const zichtbaar = alles ? activiteit : activiteit.slice(0, EERST)
  const meer = activiteit.length > EERST

  return (
    <Card
      titel="Recente activiteit"
      plat
      acties={
        meer && (
          <button type="button" className="pdv2-btn s stil" onClick={() => setAlles(!alles)}>
            {alles ? 'Minder tonen' : `Alles tonen (${activiteit.length})`}
          </button>
        )
      }
    >
      {activiteit.length === 0 ? (
        <div className="pdv2-empty">Nog niets gebeurd op dit project.</div>
      ) : (
        <table className="pdv2-tbl">
          <tbody>
            {zichtbaar.map((a, i) => (
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
  )
}
