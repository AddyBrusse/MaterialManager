import { Fragment, useEffect, useRef, useState } from 'react'
import type { Factuur, FactuurRegelKeuze, Project, ProjectVoortgang } from '@stockmanager/shared'
import { Card } from '../components/Card'
import { BevestigModal } from '../components/BevestigModal'
import { eur } from '../lib/format'
import { FactuurRegels } from './facturen/FactuurRegels'
import { FactuurRij } from './facturen/FactuurRij'
import { TeFacturerenKaart } from './facturen/TeFacturerenKaart'

interface Props {
  project: Project
  voortgang: ProjectVoortgang
  geblokkeerd: boolean
  onNieuw: () => void
  onWijzig: (factuurId: string, patch: { regels?: FactuurRegelKeuze[]; naarEmail?: string | null }) => boolean | void
  onPdf: (f: Factuur) => void
  onVerstuur: (f: Factuur) => void
  onVerwijder: (factuurId: string) => void
  onCrediteer: (factuurId: string) => void
  onBetaald: (factuurId: string, betaald: boolean) => void
}

/** Nieuwste factuur bovenaan, en elke credit direct onder de factuur die hij crediteert. */
function volgorde(facturen: Factuur[]): Factuur[] {
  const uit: Factuur[] = []
  for (const f of [...facturen].filter((x) => x.soort === 'factuur').reverse()) {
    uit.push(f, ...facturen.filter((c) => c.crediteertFactuurId === f.id))
  }
  // Een credit zonder (bestaande) factuur toch tonen.
  return [...uit, ...facturen.filter((x) => !uit.includes(x))]
}

/**
 * De facturen van een project, in de opbouw van de Offertes-tab (besloten
 * 2026-10-03): elke factuur een rij, uitklappen toont de regels, een credit
 * hangt onder zijn factuur. Een concept pas je in de tabel aan; versturen gaat
 * via Outlook (pdf in de mail), naar het adres op de factuur.
 */
export function FacturenTab(props: Props) {
  const { project: p, voortgang, geblokkeerd } = props
  const lijst = volgorde(p.facturen)
  const [open, setOpen] = useState<string | null>(lijst.find((f) => !f.verzondenOp)?.id ?? null)
  const [weg, setWeg] = useState<Factuur | null>(null)

  // Een nieuwe factuur of credit klapt open: wie hem maakt, wil hem nakijken.
  const vorige = useRef(p.facturen.map((f) => f.id))
  useEffect(() => {
    const nieuw = p.facturen.find((f) => !vorige.current.includes(f.id))
    if (nieuw && p.facturen.length > vorige.current.length) setOpen(nieuw.id)
    vorige.current = p.facturen.map((f) => f.id)
  }, [p.facturen])

  const aantal = p.facturen.filter((f) => f.soort === 'factuur').length
  const credits = p.facturen.length - aantal

  return (
    <>
      <TeFacturerenKaart project={p} v={voortgang} />
      <Card
        titel="Facturen"
        teller={p.facturen.length === 0 ? undefined : `${aantal} ${aantal === 1 ? 'factuur' : 'facturen'}${credits ? ` · ${credits} credit` : ''}`}
        plat
        acties={<button type="button" className="pdv2-btn s primair" onClick={props.onNieuw} disabled={geblokkeerd}>Nieuwe factuur</button>}
      >
        {lijst.length === 0 ? (
          <div className="pdv2-empty" style={{ padding: 14 }}>
            Nog geen factuur. "Nieuwe factuur" zet er alles op wat verstuurd en nog niet gefactureerd is; aantal en prijs pas je daarna aan.
          </div>
        ) : (
          <table className="pdv2-tbl">
            <thead>
              <tr>
                <th style={{ width: 175 }}>Nummer</th>
                <th>Status</th>
                <th style={{ width: 250 }}>Aan</th>
                <th style={{ width: 90 }}>Datum</th>
                <th style={{ width: 90 }}>Vervalt</th>
                <th className="num" style={{ width: 110 }}>Incl. btw</th>
                <th style={{ width: 290 }} />
              </tr>
            </thead>
            <tbody>
              {lijst.map((f) => (
                <Fragment key={f.id}>
                  <FactuurRij
                    f={f}
                    open={open === f.id}
                    geblokkeerd={geblokkeerd}
                    onToggle={() => setOpen(open === f.id ? null : f.id)}
                    onAdres={(naar) => props.onWijzig(f.id, { naarEmail: naar || null })}
                    onPdf={() => props.onPdf(f)}
                    onVerstuur={() => props.onVerstuur(f)}
                    onVerwijder={() => setWeg(f)}
                    onCrediteer={() => props.onCrediteer(f.id)}
                    onBetaald={(b) => props.onBetaald(f.id, b)}
                  />
                  {open === f.id && (
                    <tr className="pdv2-kind-rij">
                      <td colSpan={7}>
                        <FactuurRegels project={p} factuur={f} bewerkbaar={!f.verzondenOp && !geblokkeerd}
                          onWijzig={(regels) => props.onWijzig(f.id, { regels })} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {weg && (
        <BevestigModal titel={`${weg.id} verwijderen?`} knop="Verwijderen" gevaar onSluit={() => setWeg(null)}
          onBevestig={() => { setWeg(null); props.onVerwijder(weg.id) }}>
          <p>
            Het concept van {eur(weg.totaalInclBtw)} incl. btw vervalt. Het is nog nergens heen gegaan; wat erop stond,
            staat daarna weer open om te factureren.
          </p>
        </BevestigModal>
      )}
    </>
  )
}
