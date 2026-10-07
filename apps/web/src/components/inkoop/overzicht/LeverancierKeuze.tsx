import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Popover } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { InkoopOptie, InkoopOverzichtRegel } from '@stockmanager/shared'
import { bestelRegelsApi } from '../../../api/bestellingen'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eur } from '../bestellingen/bestel-tekst'

export interface PrijsActies {
  /** Een prijsaanvraag maken voor deze regel. */
  vraag: (r: InkoopOverzichtRegel) => void
  /** Het antwoord op een bestaande aanvraag invullen. */
  antwoord: (r: InkoopOverzichtRegel, o: InkoopOptie) => void
  /** Een prijs invullen die je zonder mail kreeg (telefoon, website). */
  invullen: (r: InkoopOverzichtRegel) => void
}

/**
 * De leverancier van één regel (2026-10-07). Alle prijzen voor déze regel, de
 * goedkoopste bovenaan; die geldt al zolang niemand iets anders kiest. Een
 * andere kiezen legt de keuze vast en verplaatst de regel naar die leverancier.
 */
export function LeverancierKeuze({ r, acties }: { r: InkoopOverzichtRegel; acties: PrijsActies }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const kies = useMutation({
    mutationFn: (o: InkoopOptie) => bestelRegelsApi.kies(r.id, { leverancierId: o.leverancierId, bron: o.bron!, antwoordId: o.antwoordId }),
    onSuccess: (_d, o) => {
      for (const k of ['inkoop', 'bestel-regels', 'bestel-geschiedenis']) qc.invalidateQueries({ queryKey: [k] })
      notifications.show({ color: 'green', message: `${r.materiaal}: ${o.naam} gekozen` })
    },
    onError: (e, o) => meldFout({ actie: `${o.naam} kiezen voor ${r.materiaal}`, fout: e, gevolg: 'De leverancier is niet veranderd.' }),
  })
  const l = r.leverancier
  const label = l ? l.naam : 'Kies…'

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" shadow="md" withinPortal trapFocus>
      <Popover.Target>
        <button type="button" className="ib-lev-knop" aria-haspopup="listbox" aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
          {label}{l?.goedkoopst && <span className="ib-goedkoopst">GOEDKOOPST</span>} ▾
        </button>
      </Popover.Target>
      <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
        <div className="ib-opties" role="listbox" aria-label={`Leverancier voor ${r.materiaal}`}>
          {r.opties.length === 0 && <div className="ib-sub" style={{ padding: 8 }}>Nog geen prijs van een leverancier voor deze maat.</div>}
          {r.opties.map((o) => {
            const gekozen = l?.leverancierId === o.leverancierId
            return (
              <button key={o.leverancierId} type="button" role="option" aria-selected={gekozen} className="ib-optie"
                onClick={() => {
                  setOpen(false)
                  if (o.soort === 'gevraagd') { acties.antwoord(r, o); return }
                  if (!gekozen || !l?.gekozen) kies.mutate(o)
                }}>
                <span className="ib-optie-naam">{gekozen ? '✓ ' : ''}{o.naam}{o.goedkoopst && <span className="ib-goedkoopst">GOEDKOOPST</span>}</span>
                <span className="ib-optie-prijs">{o.totaal != null ? eur(o.totaal) : '—'}</span>
                <span className="ib-optie-uitleg">
                  {o.soort === 'gevraagd'
                    ? <>gevraagd in {o.aanvraagId}, nog geen antwoord · <u>antwoord invullen</u></>
                    : <>{o.uitleg} · {o.bron === 'antwoord' ? `antwoord ${o.aanvraagId ?? ''}` : 'prijslijst'}{o.levertijdDagen != null ? ` · ${o.levertijdDagen} werkdagen` : ' · levertijd onbekend'}</>}
                </span>
              </button>
            )
          })}
          <div className="ib-opties-voet">
            <button type="button" className="st-btn ghost sm" onClick={() => { setOpen(false); acties.vraag(r) }}>+ Prijs vragen</button>
            <button type="button" className="st-btn ghost sm" onClick={() => { setOpen(false); acties.invullen(r) }}>+ Prijs invullen</button>
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
