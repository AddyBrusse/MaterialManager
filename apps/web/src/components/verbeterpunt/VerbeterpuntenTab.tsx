import { useState } from 'react'
import type { Todo } from '@stockmanager/shared'
import { waaromNietVerbeterpuntenExporteren } from '@stockmanager/shared'
import { notifications } from '@mantine/notifications'
import { IconFileZip, IconMessageReport } from '@tabler/icons-react'
import { todosApi } from '../../api/todos'
import { eis } from '../../utils/fout-melding'
import { meldFout } from '../../utils/fout-melding-toon'
import { useVerbeterpunt } from '../../stores/verbeterpunt'
import { VerbeterpuntRij } from './VerbeterpuntRij'
import { VerbeterpuntBekijken } from './VerbeterpuntBekijken'
import { useVerbeterpuntActies } from './useVerbeterpuntActies'
import './verbeterpunt.css'

/** De tab "Verbeterpunten" op de ToDo-pagina (2026-10-24). */
export function VerbeterpuntenTab({ punten }: { punten: Todo[] }) {
  const { afvinken, verwijderen } = useVerbeterpuntActies()
  const start = useVerbeterpunt((s) => s.start)
  const [bekijkId, setBekijkId] = useState<string | null>(null)
  const [exporteren, setExporteren] = useState(false)
  const open = punten.filter((p) => !p.done)
  const klaar = punten.filter((p) => p.done)
  // Uit de actuele lijst, zodat afvinken in het grote venster meteen zichtbaar is.
  const bekijk = punten.find((p) => p.id === bekijkId) ?? null

  async function exporteer() {
    setExporteren(true)
    try {
      eis(waaromNietVerbeterpuntenExporteren(open.length))
      const { blob, bestandsnaam } = await todosApi.exporteerVerbeterpunten()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = bestandsnaam ?? 'verbeterpunten.zip'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      notifications.show({ color: 'green', title: 'Zip gedownload', message: `${open.length} open ${open.length === 1 ? 'punt' : 'punten'}. Sleep de zip in een chat met Claude.` })
    } catch (fout) {
      meldFout({ actie: 'Verbeterpunten exporteren', fout, gevolg: 'Er is niets gedownload. De verbeterpunten zelf zijn niet veranderd.' })
    } finally {
      setExporteren(false)
    }
  }

  const rij = (p: Todo) => (
    <VerbeterpuntRij key={p.id} punt={p} onBekijk={() => setBekijkId(p.id)}
      onAfvinken={(done) => afvinken(p.id, done)} onVerwijder={() => verwijderen(p.id)} />
  )

  return (
    <>
      <div className="vp-tab-kop">
        <span>
          Wat iemand met <strong>Dit klopt niet</strong> meldde (knop linksonder of <kbd>F8</kbd>).
          Vink een punt af als het opgelost is.
        </span>
        <button className="st-btn sm" onClick={start}><IconMessageReport size={13} />Nieuw verbeterpunt</button>
        <button className="st-btn sm" onClick={() => void exporteer()} disabled={exporteren}
          title="Eén tekstbestand plus alle schermafbeeldingen, om in een chat met Claude te slepen">
          <IconFileZip size={13} />{exporteren ? 'Bezig…' : 'Exporteer voor Claude (zip)'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {open.length === 0 && <div className="st-empty">Geen open verbeterpunten.</div>}
        {open.map(rij)}
      </div>

      {klaar.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-3)', fontWeight: 500 }}>
            Opgelost ({klaar.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>{klaar.map(rij)}</div>
        </details>
      )}

      <VerbeterpuntBekijken
        punt={bekijk}
        onSluit={() => setBekijkId(null)}
        onAfvinken={(done) => afvinken(bekijk!.id, done)}
        onVerwijder={() => verwijderen(bekijk!.id, () => setBekijkId(null))}
      />
    </>
  )
}
