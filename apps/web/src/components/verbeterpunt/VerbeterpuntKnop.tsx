import { IconMessageReport } from '@tabler/icons-react'
import { useVerbeterpunt } from '../../stores/verbeterpunt'

/** "Dit klopt niet" — linksonder naast de gebruiker, en via F8 overal. */
export function VerbeterpuntKnop({ groot = false }: { groot?: boolean }) {
  const start = useVerbeterpunt((s) => s.start)
  if (groot) {
    // Terminal: grote knop met tekst, zoals de andere knoppen daar.
    return (
      <button className="tr-tbtn" style={{ height: 44, fontSize: 14, padding: '0 16px' }} onClick={start}>
        dit klopt niet
      </button>
    )
  }
  return (
    <button className="st-icon-btn" title="Dit klopt niet (F8)" aria-label="Dit klopt niet" onClick={start}>
      <IconMessageReport size={16} />
    </button>
  )
}
