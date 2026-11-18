import { useState } from 'react'
import { Modal } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFileTypePdf, IconPackage, IconSend } from '@tabler/icons-react'
import { factuurNaam, factuurNummerTekst, heeftFactuurnummer, type VerkoopFactuur } from '@stockmanager/shared'
import { ApiFout } from '../../api/client'
import { eur } from '../../features/projects/detail/lib/format'
import { meldFout } from '../../utils/fout-melding-toon'
import { Weigering } from '../../utils/fout-melding'
import { LosseFactuurKop } from './LosseFactuurKop'
import { LosseRegelsTabel } from './LosseRegelsTabel'
import { useConceptFactuur, type Bewerk } from './useConceptFactuur'

interface Props {
  bewerk: Bewerk
  /** Alle facturen: een credit op een factuur mag niet meer nemen dan er openstaat. */
  facturen: VerkoopFactuur[]
  onSluit: () => void
  onOpgeslagen: () => void
  /** Sluit het venster en zet de mail klaar (nummer, `.eml`, "Ja, verstuurd"). */
  onVersturen: (f: VerkoopFactuur) => void
  onPdf: (f: VerkoopFactuur) => void
  onPakbon: (f: VerkoopFactuur) => void
}

const onbekend = (fout: unknown) => fout instanceof ApiFout && fout.code === 'TIMEOUT'

/** Een losse factuur of credit maken en aanpassen (2026-11-18). Verstuurd = alleen kijken. */
export function LosseFactuurVenster({ bewerk, facturen, onSluit, onOpgeslagen, onVersturen, onPdf, onPakbon }: Props) {
  const c = useConceptFactuur(bewerk, facturen)
  const [bezig, setBezig] = useState(false)
  const [sluitVraag, setSluitVraag] = useState(false)
  const credit = c.soort === 'credit'
  const bewerkbaar = !c.basis?.verzondenOp
  const naam = c.basis ? factuurNaam(c.basis) : credit ? 'de nieuwe creditfactuur' : 'de nieuwe factuur'
  const titel = c.basis
    ? `${credit ? 'Creditfactuur' : 'Factuur'} ${factuurNummerTekst(c.basis.id)}${c.basis.verzondenOp ? ' (verstuurd)' : ''}`
    : credit ? 'Nieuwe creditfactuur' : 'Nieuwe factuur'
  const nu = c.alsFactuur()

  const bewaar = async (): Promise<VerkoopFactuur | null> => {
    const actie = `${naam.charAt(0).toUpperCase()}${naam.slice(1)} opslaan`
    const nee = c.waaromNiet(true)
    if (nee) {
      meldFout({ actie, fout: new Weigering(nee), gevolg: 'Er is niets opgeslagen; je invoer staat nog in het venster.' })
      return null
    }
    setBezig(true)
    try {
      const f = await c.opslaan()
      onOpgeslagen()
      return f
    } catch (fout) {
      meldFout({
        actie, fout,
        gevolg: onbekend(fout)
          ? 'Onbekend of het is opgeslagen: de server antwoordde niet op tijd. Sluit het venster en kijk in de lijst.'
          : 'Er is niets opgeslagen; je invoer staat nog in het venster. Probeer het opnieuw.',
      })
      return null
    } finally {
      setBezig(false)
    }
  }

  const opslaan = async (sluiten = false) => {
    const f = await bewaar()
    if (!f) return
    const wat = factuurNaam(f)
    notifications.show({ color: 'green', message: `${wat.charAt(0).toUpperCase()}${wat.slice(1)} is opgeslagen` })
    if (sluiten) onSluit()
  }

  const versturen = async () => {
    const nee = c.waaromNiet(false)
    if (nee) {
      meldFout({ actie: 'Versturen', fout: new Weigering(nee), gevolg: 'Er is niets opgeslagen, geen nummer gegeven en niets verstuurd.' })
      return
    }
    const f = c.gewijzigd ? await bewaar() : c.basis
    if (f) onVersturen(f)
  }

  const probeerSluiten = () => (c.gewijzigd && bewerkbaar && (c.basis || c.regels.length > 0) ? setSluitVraag(true) : onSluit())

  return (
    <Modal opened onClose={probeerSluiten} title={titel} size="80rem" centered closeOnEscape={!bezig} closeOnClickOutside={false}
      classNames={{ body: 'fact-venster' }}>
      <LosseFactuurKop kop={c.kop} onKop={c.setKop} klanten={c.klanten} soort={c.soort} bewerkbaar={bewerkbaar && !bezig}
        klantVast={!!c.basis && (heeftFactuurnummer(c.basis.id) || !!c.basis.crediteertFactuurId)}
        crediteert={c.basis?.crediteertFactuurId ?? null} />
      <div className="fact-regels-wrap">
        <LosseRegelsTabel regels={c.regels} onRegels={c.setRegels} artikelen={c.artikelen} info={c.info} stel={c.stel}
          bewerkbaar={bewerkbaar && !bezig} toevoegen={!c.basis?.crediteertFactuurId && !!c.kop.relatieId} toonVoorraad={!credit} />
      </div>
      <div className="fact-totalen">
        <span>Subtotaal <b className="mono">{eur(nu.subtotaal)}</b></span>
        <span>Btw {nu.btwPct}% <b className="mono">{eur(nu.btwBedrag)}</b></span>
        <span>Totaal <b className="mono">{eur((credit ? -1 : 1) * nu.totaalInclBtw)}</b></span>
      </div>
      {sluitVraag ? (
        <div className="fact-voet fact-sluitvraag" role="alert">
          <span>Je wijzigingen zijn nog niet opgeslagen.</span>
          <button type="button" className="st-btn sm" onClick={() => setSluitVraag(false)}>Terug</button>
          <button type="button" className="st-btn sm danger" onClick={onSluit}>Weggooien en sluiten</button>
          <button type="button" className="st-btn sm primary" disabled={bezig} onClick={() => void opslaan(true)}>Opslaan en sluiten</button>
        </div>
      ) : (
        <div className="fact-voet">
          <span className="fact-stand">
            {!bewerkbaar ? 'Verstuurd: staat vast. Corrigeren gaat met een creditfactuur.'
              : c.gewijzigd ? 'Niet opgeslagen' : 'Opgeslagen'}
          </span>
          <button type="button" className="st-btn sm" onClick={() => onPdf(nu)}><IconFileTypePdf size={13} /> Pdf</button>
          {!credit && <button type="button" className="st-btn sm" onClick={() => onPakbon(nu)}><IconPackage size={13} /> Pakbon</button>}
          <button type="button" className="st-btn sm" onClick={probeerSluiten}>Sluiten</button>
          {bewerkbaar && (
            <>
              <button type="button" className="st-btn sm" disabled={bezig || !c.gewijzigd} onClick={() => void opslaan()}>Opslaan</button>
              <button type="button" className="st-btn sm primary" disabled={bezig} onClick={() => void versturen()}>
                <IconSend size={13} /> Versturen
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
