import { Fragment, useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import type { Offerte, Project } from '@stockmanager/shared'
import { ArtikelPickerModal } from '../../../../components/projecten/ArtikelPickerModal'
import { PrijzenBijwerkenModal } from '../../../../components/projecten/PrijzenBijwerkenModal'
import type { Bijwerking } from '../../../../components/projecten/prijs-bijwerken'
import { Card } from '../components/Card'
import { CelTekst } from '../components/CelTekst'
import { datum, eur } from '../lib/format'
import { geaccepteerdeOfferte } from '../lib/status'
import { OfferteRegels } from './OfferteRegels'
import { OfferteActies } from './OfferteActies'
import { NaarProjectModal, type NaarProjectKeuze } from './NaarProjectModal'
import { WegBevestiging } from './WegBevestiging'

function statusPill(o: Offerte) {
  switch (o.status) {
    case 'geaccepteerd':
      return { tekst: 'Geaccepteerd', kleur: 'ok' }
    case 'vervallen':
      return { tekst: 'Vervallen', kleur: '' }
    case 'verzonden':
      return { tekst: 'Verzonden', kleur: 'accent' }
    default:
      return { tekst: 'Concept', kleur: '' }
  }
}

/**
 * Wat deze versie betekent, in één regel.
 *
 * Dit stond er eerder als "geldend of vervallen", waarbij geldend de
 * geaccepteerde versie was en al het andere vervallen heette. Een concept dat
 * nog niet verstuurd was kreeg dan "vervallen versie, alleen ter vergelijking"
 * te lezen terwijl je er juist in zat te typen. De status van de offerte zegt
 * het gewoon zelf.
 */
function toelichting(o: Offerte, erIsGeaccepteerd: boolean): string {
  switch (o.status) {
    case 'geaccepteerd':
      return 'geldend — hierop draait de productie'
    case 'verzonden':
      return erIsGeaccepteerd ? 'verstuurd, een andere is geaccepteerd' : 'verstuurd — wacht op de klant'
    case 'vervallen':
      return 'vervallen, ter vergelijking'
    default:
      return 'concept — nog te wijzigen'
  }
}

interface Props {
  project: Project
  geblokkeerd: boolean
  onNieuweVersie: () => void
  onKopieer: (offerteId: string) => void
  onReferentie: (offerteId: string, ref: string) => void
  onVerzend: (offerteId: string) => void
  onAccepteer: (offerteId: string) => void
  onGewijzigd: () => void
  onRegel: (offerteId: string, regelId: string, patch: { qty?: number; verkoopprijs?: number }) => void
  onVerwijderRegel: (offerteId: string, regelId: string) => void
  onPrijzen: (offerteId: string, gekozen: Bijwerking[]) => void
  onVerwijder: (offerteId: string) => void
  onIntrekken: (offerteId: string) => void
  onNaarProject: (offerteId: string, keuze: NaarProjectKeuze) => Promise<boolean>
}

/** §5.2 — de versies, elk met zijn eigen regels eronder. */
export function OffertesTab({
  project,
  geblokkeerd,
  onNieuweVersie,
  onKopieer,
  onReferentie,
  onVerzend,
  onAccepteer,
  onGewijzigd,
  onRegel,
  onVerwijderRegel,
  onPrijzen,
  onVerwijder,
  onIntrekken,
  onNaarProject,
}: Props) {
  const versies = [...project.offertes].sort((a, b) => b.versie - a.versie)
  const acc = geaccepteerdeOfferte(project)
  // Standaard de geaccepteerde versie open, anders de hoogste — dat is de
  // versie waar iemand die dit scherm opent naar op zoek is. Eén versie
  // tegelijk open: twee regeltabellen onder elkaar met dezelfde kolommen zijn
  // niet meer uit elkaar te houden.
  const [open, setOpen] = useState<string | null>(acc?.id ?? versies[0]?.id ?? null)
  // Komt er een versie bij — leeg of gekopieerd — dan klapt die open. Wie net
  // op "Kopieer" drukte wil de nieuwe versie bewerken, niet eerst zoeken waar
  // hij gebleven is.
  const aantal = useRef(versies.length)
  useEffect(() => {
    if (versies.length > aantal.current && versies[0]) setOpen(versies[0].id)
    aantal.current = versies.length
  }, [versies])
  const [picker, setPicker] = useState<string | null>(null)
  const [prijzen, setPrijzen] = useState<string | null>(null)
  const [bevestig, setBevestig] = useState<{ soort: 'verwijderen' | 'intrekken'; id: string } | null>(null)
  const [naarProject, setNaarProject] = useState<string | null>(null)

  const pickerOfferte = versies.find((v) => v.id === picker) ?? null
  const prijzenOfferte = versies.find((v) => v.id === prijzen) ?? null
  const bevestigOfferte = versies.find((v) => v.id === bevestig?.id) ?? null
  const naarProjectOfferte = versies.find((v) => v.id === naarProject) ?? null

  if (versies.length === 0) {
    return (
      <Card
        titel="Offertes"
        acties={
          <button
            type="button"
            className="pdv2-btn s primair"
            onClick={onNieuweVersie}
            disabled={geblokkeerd}
          >
            Nieuwe versie
          </button>
        }
      >
        <div className="pdv2-empty">
          Nog geen offerte. De status springt naar Offerte zodra je er één verstuurt.
        </div>
      </Card>
    )
  }

  return (
    <Card
      titel="Offertes"
      teller={`${versies.length} versies · ${acc ? 1 : 0} geaccepteerd`}
      plat
      acties={
        <button type="button" className="pdv2-btn s" onClick={onNieuweVersie} disabled={geblokkeerd}>
          Nieuwe versie
        </button>
      }
    >
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th style={{ width: 54 }}>v.</th>
            <th style={{ width: 118 }}>Nummer</th>
            <th style={{ width: 170 }}>Referentie</th>
            <th style={{ width: 120 }}>Status</th>
            <th>Wat het is</th>
            <th style={{ width: 92 }}>Verzonden</th>
            <th style={{ width: 100 }}>Geaccepteerd</th>
            <th style={{ width: 92 }}>Geldig tot</th>
            <th className="num" style={{ width: 104 }}>
              Totaal
            </th>
            <th style={{ width: 196 }} />
          </tr>
        </thead>
        <tbody>
          {versies.map((o) => {
            const pill = statusPill(o)
            const uit = open === o.id
            return (
              <Fragment key={o.id}>
                <tr
                  className={[
                    o.status === 'geaccepteerd' ? 'geaccepteerd' : '',
                    o.status === 'vervallen' ? 'vervallen' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td>
                    <button
                      type="button"
                      className="pdv2-uitklap"
                      aria-expanded={uit}
                      aria-label={`Regels van ${o.id} ${uit ? 'verbergen' : 'tonen'}`}
                      onClick={() => setOpen(uit ? null : o.id)}
                    >
                      {uit ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                      <span className="mono">{o.versie}</span>
                    </button>
                  </td>
                  {/* Het nummer dat de klant kent, niet de sleutel: een herziening
                      draagt het nummer van de versie die ze herziet, dus v4 en
                      een kopie ervan staan hier onder hetzelfde nummer. */}
                  <td className="mono" title={o.documentNr !== o.id ? `intern ${o.id}` : undefined}>
                    {o.documentNr}
                  </td>
                  {/* Waar deze versie antwoord op geeft. Ook na het versturen
                      nog in te vullen: het is onze eigen boekhouding, niet iets
                      wat de klant kreeg — en een RFQ-nummer vind je soms pas
                      later terug in de mail. */}
                  <td>
                    <CelTekst
                      waarde={o.externeRef}
                      placeholder="RFQ of mail…"
                      uit={geblokkeerd}
                      max={200}
                      onKlaar={(ref) => onReferentie(o.id, ref)}
                    />
                  </td>
                  <td>
                    <span className={`pdv2-pill ${pill.kleur}`}>{pill.tekst}</span>
                  </td>
                  <td style={{ color: 'var(--text3)' }}>{toelichting(o, Boolean(acc))}</td>
                  <td className="mono">{datum(o.verzondenOp)}</td>
                  <td className="mono">{datum(o.geaccepteerdOp)}</td>
                  <td className="mono">{datum(o.geldigTot)}</td>
                  <td className="num">{eur(o.regels.reduce((s, r) => s + r.totaal, 0))}</td>
                  <OfferteActies
                    offerte={o}
                    erIsGeaccepteerd={Boolean(acc)}
                    geblokkeerd={geblokkeerd}
                    onVerzend={() => onVerzend(o.id)}
                    onAccepteer={() => onAccepteer(o.id)}
                    onKopieer={() => onKopieer(o.id)}
                    onNaarProject={() => setNaarProject(o.id)}
                    onIntrekken={() => setBevestig({ soort: 'intrekken', id: o.id })}
                    onVerwijder={() => setBevestig({ soort: 'verwijderen', id: o.id })}
                  />
                </tr>

                {uit && (
                  <tr className="pdv2-kind-rij">
                    <td colSpan={10}>
                      <OfferteRegels
                        offerte={o}
                        projectId={project.id}
                        bewerkbaar={o.status === 'concept' && !geblokkeerd}
                        onToevoegen={() => setPicker(o.id)}
                        onPrijzen={() => setPrijzen(o.id)}
                        onRegel={(regelId, patch) => onRegel(o.id, regelId, patch)}
                        onVerwijder={(regelId) => onVerwijderRegel(o.id, regelId)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      {/* Dezelfde kiezer als op het oude scherm: artikelen zoeken, marge en
          verkoopprijs afstemmen, in één keer wegschrijven. */}
      {pickerOfferte && (
        <ArtikelPickerModal
          opened
          projectId={project.id}
          offerteId={pickerOfferte.id}
          relatieId={project.relatieId}
          onClose={() => setPicker(null)}
          onAdded={onGewijzigd}
        />
      )}

      {bevestig && bevestigOfferte && (
        <WegBevestiging
          soort={bevestig.soort}
          offerte={bevestigOfferte}
          onSluit={() => setBevestig(null)}
          onBevestig={() => {
            setBevestig(null)
            if (bevestig.soort === 'verwijderen') onVerwijder(bevestigOfferte.id)
            else onIntrekken(bevestigOfferte.id)
          }}
        />
      )}

      {naarProjectOfferte && (
        <NaarProjectModal
          project={project}
          offerte={naarProjectOfferte}
          onSluit={() => setNaarProject(null)}
          onMaak={(keuze) => onNaarProject(naarProjectOfferte.id, keuze)}
        />
      )}

      {prijzenOfferte && (
        <PrijzenBijwerkenModal
          opened
          offerte={prijzenOfferte}
          onClose={() => setPrijzen(null)}
          onBijwerken={(gekozen) => {
            setPrijzen(null)
            onPrijzen(prijzenOfferte.id, gekozen)
          }}
        />
      )}
    </Card>
  )
}
