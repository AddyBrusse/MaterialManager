import { useEffect } from 'react'
import { useVerbeterpunt, type VerbeterpuntBron } from '../../stores/verbeterpunt'
import { VerbeterpuntVenster } from './VerbeterpuntVenster'
import './verbeterpunt.css'

/**
 * Hangt "Dit klopt niet" in een scherm: het venster plus de sneltoets F8.
 * F8 werkt ook als er al een ander venster open staat — dan is de knop in de
 * zijbalk niet te bereiken, en juist in zo'n venster zit vaak het probleem.
 */
export function VerbeterpuntHost({ bron }: { bron: VerbeterpuntBron }) {
  const zetBron = useVerbeterpunt((s) => s.zetBron)
  const start = useVerbeterpunt((s) => s.start)
  useEffect(() => { zetBron(bron) }, [bron, zetBron])
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.key !== 'F8' || e.repeat) return
      e.preventDefault()
      start()
    }
    // In de capture-fase: een venster dat toetsen zelf afvangt, houdt F8 dan niet tegen.
    window.addEventListener('keydown', toets, true)
    return () => window.removeEventListener('keydown', toets, true)
  }, [start])
  return <VerbeterpuntVenster />
}
