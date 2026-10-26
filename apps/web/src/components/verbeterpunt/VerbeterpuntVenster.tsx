import { useEffect, useRef, useState } from 'react'
import { Modal, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { IconSend } from '@tabler/icons-react'
import { todosApi } from '../../api/todos'
import { ApiFout } from '../../api/client'
import { useVerbeterpunt } from '../../stores/verbeterpunt'
import { metKaders, NIET_OP_SCHERMAFBEELDING } from '../../services/verbeterpunt/schermafbeelding'
import { meldFout } from '../../utils/fout-melding-toon'
import { browserNaam, type Kader } from '../../utils/verbeterpunt'
import { Schets } from './Schets'
import { SchetsKnoppen } from './SchetsKnoppen'

/** Het venster achter "Dit klopt niet": schermafbeelding, kaders en één zin. */
export function VerbeterpuntVenster() {
  const s = useVerbeterpunt()
  const qc = useQueryClient()
  const [zin, setZin] = useState('')
  const [zinFout, setZinFout] = useState<string | null>(null)
  const [kaders, setKaders] = useState<Kader[]>([])
  const [bezig, setBezig] = useState(false)
  const tekst = useRef<HTMLTextAreaElement>(null)

  // Elke keer openen begint leeg.
  useEffect(() => {
    if (s.open) { setZin(''); setZinFout(null); setKaders([]); setBezig(false) }
  }, [s.open, s.ronde])

  // Ctrl+V met een afbeelding erin: een echte schermafdruk vervangt de nagetekende.
  useEffect(() => {
    if (!s.open) return
    const plak = (e: ClipboardEvent) => {
      const bestand = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (!bestand) return
      e.preventDefault()
      s.zetBeeld({ blob: bestand, bron: 'geplakt' })
      setKaders([])
    }
    window.addEventListener('paste', plak)
    return () => window.removeEventListener('paste', plak)
  }, [s.open, s.zetBeeld])

  async function verstuur() {
    if (!zin.trim()) {
      setZinFout('Schrijf in een zin wat er niet klopt')
      tekst.current?.focus()
      return
    }
    setBezig(true)
    try {
      const beeld = s.beeld ? await metKaders(s.beeld.blob, kaders) : null
      await todosApi.verbeterpunt({
        zin: zin.trim(),
        paginaUrl: s.pagina.url,
        paginaNaam: s.pagina.naam,
        context: {
          scherm: { ...s.scherm, breedte: Math.round(s.scherm.breedte), hoogte: Math.round(s.scherm.hoogte) },
          browser: browserNaam(navigator.userAgent),
          operator: s.operator,
          schermafbeelding: s.beeld?.bron ?? 'geen',
          fouten: s.fouten,
        },
      }, beeld)
      // Groen pas nu de server het heeft (CLAUDE.md, foutmeldingen).
      notifications.show({ color: 'green', title: 'Verbeterpunt opgeslagen', message: 'Het staat in ToDo onder Verbeterpunten.' })
      void qc.invalidateQueries({ queryKey: ['todos'] })
      s.sluit()
    } catch (fout) {
      meldFout({
        actie: 'Verbeterpunt opslaan',
        fout,
        gevolg: fout instanceof ApiFout && fout.code === 'TIMEOUT'
          ? 'Onbekend of het is opgeslagen. Kijk in ToDo onder Verbeterpunten voor je het opnieuw verstuurt; het venster blijft open.'
          : 'Er is niets opgeslagen. Je tekst en de schermafbeelding staan nog in het venster: probeer het opnieuw.',
      })
    } finally {
      setBezig(false)
    }
  }

  return (
    <Modal
      opened={s.open}
      onClose={s.sluit}
      title="Dit klopt niet"
      size={1000}
      centered
      lockScroll={false}
      closeOnClickOutside={false}
      // Boven elk ander venster, ook een eigen overlay (de lichtbak op 1000):
      // F8 opent dit juist vaak terwijl er al iets open staat. Onder de
      // meldingen (main.tsx), anders valt een foutmelding erachter.
      zIndex={1100}
      {...{ [NIET_OP_SCHERMAFBEELDING]: '' }}
    >
      <div className="vp-venster">
        <Schets beeld={s.beeld?.blob ?? null} bezig={s.bezig} fout={s.beeldFout} kaders={kaders} onKaders={setKaders} />
        <SchetsKnoppen kaders={kaders} onKaders={setKaders} />
        <Textarea
          ref={tekst}
          label="Wat klopt er niet?"
          placeholder="Eén zin is genoeg, bijvoorbeeld: de kolomkop zegt Stangenlader maar er staat een aantal in"
          autosize
          minRows={2}
          maxRows={6}
          data-autofocus
          value={zin}
          error={zinFout}
          onChange={(e) => { setZin(e.currentTarget.value); setZinFout(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void verstuur() } }}
        />
        <div className="vp-mee">
          Gaat vanzelf mee: <strong>{s.pagina.naam ?? s.pagina.url}</strong>, wie het meldt en wanneer
          {s.fouten.length > 0 && <>, en {s.fouten.length === 1 ? 'de foutmelding' : `${s.fouten.length} foutmeldingen`} van vlak ervoor</>}.
        </div>
        <div className="vp-voet">
          <button className="st-btn sm" onClick={s.sluit}>Annuleren</button>
          <button className="st-btn primary sm" onClick={() => void verstuur()} disabled={bezig}>
            <IconSend size={13} />{bezig ? 'Bezig…' : 'Versturen'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
