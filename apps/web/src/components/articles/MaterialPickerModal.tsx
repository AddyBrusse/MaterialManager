import { useMemo, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { IconX, IconPlus } from '@tabler/icons-react'
import type { RawMaterialRow } from '../../api/raw-materials'
import type { Machine } from '../../api/machines'
import type { EstimateCtx } from '../../api/estimate'
import {
  filter, groepeer, LEEG_FILTER, sorteer as sorteerGroepen,
  type MateriaalFilter, type MateriaalGroep, type Sorteer,
} from '../materiaal/materiaal-groepen'
import { MateriaalFilters, MateriaalTabel } from '../materiaal/kiezer/MateriaalTabel'
import { LaderPaneel, type Keuze } from '../materiaal/kiezer/LaderPaneel'
import { NieuwMateriaal } from './NieuwMateriaal'
import '../materiaal/materiaal.css'

interface MaterialPickerModalProps {
  opened: boolean
  onClose: () => void
  stockRows: RawMaterialRow[]
  grades: { id: string; name: string; pricePerKg?: number }[]
  profiles: { id: string; name: string; volumeFormula: string }[]
  machines: Machine[]
  ctx: EstimateCtx
  /** Werkstuklengte om mee te beginnen (uit het recept). */
  startLengte: number | null
  onPick: (row: RawMaterialRow, keuze: Keuze) => void
  onCreated: (row: RawMaterialRow) => void
}

const uniek = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'))

/**
 * Materiaal kiezen voor het recept (herzien 2026-10-09): een breed venster met
 * een echte tabel (één rij per soort materiaal, filters, sorteren) en rechts
 * de werkstuklengte en de stangenlader met het rekenscherm. Het recept is voor
 * één stuk: geen aantal — dat komt uit de offerte.
 */
export function MaterialPickerModal(p: MaterialPickerModalProps) {
  const [f, setF] = useState<MateriaalFilter>(LEEG_FILTER)
  const [sort, setSort] = useState<{ op: Sorteer; oplopend: boolean }>({ op: 'maat', oplopend: true })
  const [gekozen, setGekozen] = useState<MateriaalGroep | null>(null)
  const [keuze, setKeuze] = useState<Keuze>({ lengthMm: p.startLengte, laderMachineId: null })
  const [nieuw, setNieuw] = useState(false)

  const groepen = useMemo(() => groepeer(p.stockRows), [p.stockRows])
  const opties = useMemo(() => ({
    kwaliteiten: uniek(groepen.map((g) => g.kwaliteit)),
    vormen: uniek(groepen.map((g) => g.vorm)),
    afwerkingen: uniek(groepen.map((g) => g.afwerking)),
  }), [groepen])
  const zichtbaar = useMemo(() => sorteerGroepen(filter(groepen, f), sort.op, sort.oplopend), [groepen, f, sort])

  if (!p.opened) return null
  const neem = (g: MateriaalGroep | null) => {
    if (!g) {
      notifications.show({ color: 'orange', title: 'Nog geen materiaal gekozen', message: 'Klik eerst een rij in de tabel aan.' })
      return
    }
    // Een exoot heeft zijn eigen maat en geen lader (2026-10-06).
    p.onPick(g.rij, g.exoot ? { lengthMm: null, laderMachineId: null } : keuze)
  }
  const lader = keuze.laderMachineId ? p.machines.find((m) => m.id === keuze.laderMachineId) : null

  return (
    <div className="mk-overlay" onClick={p.onClose}>
      <div className="mk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Materiaal kiezen">
        <div className="mk-kop">
          <b>Materiaal kiezen</b>
          <span className="sub">voor één stuk — het aantal komt uit de offerte</span>
          <button type="button" className="st-icon-btn sluit" onClick={p.onClose} aria-label="Sluiten"><IconX size={16} /></button>
        </div>
        <MateriaalFilters f={f} opties={opties} onF={setF} />
        <div className="mk-romp">
          <MateriaalTabel
            groepen={zichtbaar} totaal={groepen.length} gekozen={gekozen?.sleutel ?? null} sorteer={sort}
            prijsPerKg={(id) => p.grades.find((g) => g.id === id)?.pricePerKg}
            onSorteer={(op) => setSort((s) => ({ op, oplopend: s.op === op ? !s.oplopend : true }))}
            onKies={(g) => { setGekozen(g); setNieuw(false) }}
            onNeem={(g) => { setGekozen(g); neem(g) }}
          />
          <div className="mk-zij">
            {nieuw ? (
              <NieuwMateriaal stockRows={p.stockRows} grades={p.grades} profiles={p.profiles}
                onCreated={(row) => { setNieuw(false); p.onCreated(row) }} onAnnuleer={() => setNieuw(false)} />
            ) : gekozen ? (
              <LaderPaneel groep={gekozen} keuze={keuze} machines={p.machines} ctx={p.ctx} onKeuze={setKeuze} />
            ) : (
              <div className="k">Klik een materiaal in de tabel aan. Hier kies je daarna de werkstuklengte en of hij van de stangenlader komt.</div>
            )}
          </div>
        </div>
        <div className="mk-voet">
          <div className="som">
            {gekozen && (
              <>
                <b>Receptregel:</b> {gekozen.kwaliteit} {gekozen.vorm} {gekozen.afmeting}
                {gekozen.exoot ? ' · exoot' : ` · ${keuze.lengthMm ?? '?'} mm · ${lader ? `met stangenlader ${lader.name}` : 'alleen lengte'}`}
              </>
            )}
          </div>
          <button type="button" className="st-btn" onClick={() => setNieuw(true)}><IconPlus size={14} />Nieuw materiaal</button>
          <button type="button" className="st-btn" onClick={p.onClose}>Annuleren</button>
          <button type="button" className="st-btn primary" onClick={() => neem(gekozen)}>Kies dit materiaal</button>
        </div>
      </div>
    </div>
  )
}
