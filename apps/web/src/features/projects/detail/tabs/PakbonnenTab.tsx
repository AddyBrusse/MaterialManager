import { Fragment, useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconChevronRight, IconTrash } from '@tabler/icons-react'
import type { Paklijst, PakbonRegelKeuze, Project, ProjectVoortgang } from '@stockmanager/shared'
import { Card } from '../components/Card'
import { BevestigModal } from '../components/BevestigModal'
import { datum, getal } from '../lib/format'
import { KlaarKaart } from './pakbonnen/KlaarKaart'
import { PakbonRegels } from './pakbonnen/PakbonRegels'

interface Props {
  project: Project
  voortgang: ProjectVoortgang
  geblokkeerd: boolean
  onNieuw: () => void
  onWijzig: (paklijstId: string, regels: PakbonRegelKeuze[]) => boolean | void
  onVerzend: (paklijstId: string) => void
  onVerwijder: (paklijstId: string) => void
}

const stuks = (pl: Paklijst) => pl.regels.reduce((s, r) => s + r.qty, 0)

/**
 * De pakbonnen van een project, in dezelfde opbouw als de Offertes-tab
 * (besloten 2026-10-02): elke pakbon een rij, uitklappen toont de regels. Een
 * concept pas je in de tabel aan; een verstuurde pakbon ligt bij de klant en
 * staat vast. Bovenaan wat er klaarligt, zodat je ziet wat er nog mee kan.
 */
export function PakbonnenTab({ project, voortgang, geblokkeerd, onNieuw, onWijzig, onVerzend, onVerwijder }: Props) {
  const pakbonnen = [...project.paklijsten].reverse()
  const [open, setOpen] = useState<string | null>(pakbonnen.find((pl) => !pl.verzondenOp)?.id ?? null)
  const [weg, setWeg] = useState<Paklijst | null>(null)

  // Komt er een pakbon bij, dan klapt die open: wie op "Nieuwe pakbon" drukt,
  // wil hem aanpassen. Het id kan na het opslaan nog wisselen (de server
  // nummert), dus volgen we de nieuwste.
  const aantal = useRef(pakbonnen.length)
  useEffect(() => {
    if (pakbonnen.length > aantal.current && pakbonnen[0]) setOpen(pakbonnen[0].id)
    aantal.current = pakbonnen.length
  }, [pakbonnen])

  const verstuurd = project.paklijsten.filter((pl) => pl.verzondenOp).length
  const nieuw = (
    <button type="button" className="pdv2-btn s primair" onClick={onNieuw} disabled={geblokkeerd}>
      Nieuwe pakbon
    </button>
  )

  return (
    <>
      <KlaarKaart project={project} v={voortgang} />
      <Card
        titel="Pakbonnen"
        teller={pakbonnen.length === 0 ? undefined : `${pakbonnen.length} ${pakbonnen.length === 1 ? 'pakbon' : 'pakbonnen'} · ${verstuurd} verstuurd`}
        plat
        acties={nieuw}
      >
        {pakbonnen.length === 0 ? (
          <div className="pdv2-empty" style={{ padding: 14 }}>
            Nog geen pakbon. "Nieuwe pakbon" zet er de regels op die helemaal klaar zijn; een regel die maar deels klaar is, voeg je zelf toe.
          </div>
        ) : (
          <table className="pdv2-tbl">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Nummer</th>
                <th>Status</th>
                <th style={{ width: 100 }}>Verstuurd</th>
                <th className="num" style={{ width: 160 }}>Inhoud</th>
                <th style={{ width: 210 }} />
              </tr>
            </thead>
            <tbody>
              {pakbonnen.map((pl) => {
                const uit = open === pl.id
                const concept = !pl.verzondenOp
                return (
                  <Fragment key={pl.id}>
                    <tr>
                      <td>
                        <button type="button" className="pdv2-uitklap" aria-expanded={uit}
                          aria-label={`Regels van ${pl.id} ${uit ? 'verbergen' : 'tonen'}`}
                          onClick={() => setOpen(uit ? null : pl.id)}>
                          {uit ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                          <span className="mono">{pl.id}</span>
                        </button>
                      </td>
                      <td>
                        <span className={`pdv2-pill ${concept ? '' : 'ok'}`}>{concept ? 'Concept' : 'Verstuurd'}</span>
                        <span className="pdv2-status-uitleg">
                          {concept ? 'nog aan te passen — de stuks liggen voor deze pakbon apart' : 'bij de klant, staat vast'}
                        </span>
                      </td>
                      <td className="mono">{datum(pl.verzondenOp)}</td>
                      <td className="num">
                        {pl.regels.length} {pl.regels.length === 1 ? 'regel' : 'regels'} · {getal(stuks(pl))} stuks
                      </td>
                      <td className="pdv2-acties">
                        {concept && (
                          <div className="pdv2-acties-rij pdv2-pakbon-acties">
                            <button type="button" className="pdv2-btn s primair" disabled={geblokkeerd} onClick={() => onVerzend(pl.id)}>
                              Versturen
                            </button>
                            <button type="button" className="pdv2-btn s" disabled={geblokkeerd} onClick={() => setWeg(pl)}>
                              <IconTrash size={12} /> Verwijderen
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {uit && (
                      <tr className="pdv2-kind-rij">
                        <td colSpan={5}>
                          <PakbonRegels project={project} pakbon={pl} bewerkbaar={concept && !geblokkeerd}
                            onWijzig={(regels) => onWijzig(pl.id, regels)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {weg && (
        <BevestigModal
          titel={`${weg.id} verwijderen?`}
          knop="Verwijderen"
          gevaar
          onSluit={() => setWeg(null)}
          onBevestig={() => {
            setWeg(null)
            onVerwijder(weg.id)
          }}
        >
          <p>
            Het concept met {weg.regels.length} {weg.regels.length === 1 ? 'regel' : 'regels'} ({getal(stuks(weg))} stuks) vervalt.
            De stuks liggen daarna weer klaar voor een andere pakbon.
          </p>
        </BevestigModal>
      )}
    </>
  )
}
