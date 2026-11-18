import { useState } from 'react'
import { notifications } from '@mantine/notifications'
import {
  factuurNaam, waaromNietBetaaldVan, waaromNietFactuurWeg, waaromNietNummerIntrekken, type VerkoopFactuur,
} from '@stockmanager/shared'
import { ApiFout } from '../../api/client'
import { facturenApi } from '../../api/facturen'
import { BevestigModal } from '../../features/projects/detail/components/BevestigModal'
import { eur } from '../../features/projects/detail/lib/format'
import { meldFout } from '../../utils/fout-melding-toon'
import { Weigering } from '../../utils/fout-melding'

const hoofdletter = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const onbekend = (fout: unknown) => fout instanceof ApiFout && fout.code === 'TIMEOUT'

/**
 * Verwijderen, nummer intrekken en betaald op een rij van de pagina Facturen
 * (2026-11-18). Weggooien en intrekken vragen eerst; de voorwaarden zijn
 * dezelfde als op de server (`calc/factuur.ts`).
 */
export function useFactuurRijActies(onVeranderd: () => void) {
  const [vraag, setVraag] = useState<{ f: VerkoopFactuur; wat: 'weg' | 'intrekken' } | null>(null)

  const doe = async (actie: string, gevolgBijFout: string, fn: () => Promise<unknown>, gelukt: string) => {
    try {
      await fn()
      notifications.show({ color: 'green', message: gelukt })
    } catch (fout) {
      meldFout({ actie, fout, gevolg: onbekend(fout) ? 'Onbekend of het gelukt is: de server antwoordde niet op tijd. Kijk in de lijst.' : gevolgBijFout })
    }
    onVeranderd()
  }

  const vraagEerst = (f: VerkoopFactuur, wat: 'weg' | 'intrekken') => {
    const nee = wat === 'weg' ? waaromNietFactuurWeg(f) : waaromNietNummerIntrekken(f)
    if (nee) {
      const actie = wat === 'weg' ? `${hoofdletter(factuurNaam(f))} verwijderen` : `Nummer van ${f.id} intrekken`
      meldFout({ actie, fout: new Weigering(nee), gevolg: 'Er is niets gewijzigd.' })
      return
    }
    setVraag({ f, wat })
  }

  const betaald = (f: VerkoopFactuur, b: boolean) => {
    const actie = b ? `${f.id} als betaald zetten` : `Betaald van ${f.id} terugzetten`
    const nee = waaromNietBetaaldVan(f)
    if (nee) {
      meldFout({ actie, fout: new Weigering(nee), gevolg: 'Er is niets gewijzigd.' })
      return
    }
    void doe(actie, 'Er is niets gewijzigd.', () => facturenApi.betaald(f.id, b), b ? `${f.id} staat als betaald` : `${f.id} staat weer open`)
  }

  const bevestig = () => {
    if (!vraag) return
    const { f, wat } = vraag
    setVraag(null)
    if (wat === 'weg') {
      void doe(`${hoofdletter(factuurNaam(f))} verwijderen`, 'Hij staat er nog.', () => facturenApi.verwijder(f.id), `${hoofdletter(factuurNaam(f))} is verwijderd`)
    } else {
      void doe(`Nummer van ${f.id} intrekken`, `${f.id} houdt zijn nummer.`, () => facturenApi.nummerTerug(f.id), `${f.id} is weer een concept; het nummer is vrij`)
    }
  }

  const dialoog = vraag && (
    <BevestigModal titel={vraag.wat === 'weg' ? 'Concept verwijderen?' : 'Nummer intrekken?'} gevaar={vraag.wat === 'weg'}
      knop={vraag.wat === 'weg' ? 'Verwijderen' : 'Nummer intrekken'} onSluit={() => setVraag(null)} onBevestig={bevestig}>
      {vraag.wat === 'weg' ? (
        <p>{hoofdletter(factuurNaam(vraag.f))} van <strong>{vraag.f.klantNaam ?? 'de klant'}</strong> met {vraag.f.regels.length} regel(s),
          {' '}{eur(vraag.f.totaalInclBtw)} incl. btw, gaat weg. Dit is niet terug te draaien.</p>
      ) : (
        <>
          <p><strong>{vraag.f.id}</strong> wordt weer een concept en het nummer komt vrij voor de volgende factuur.</p>
          <p>Doe dit alleen als hij níet bij de klant is aangekomen. Is hij wel verstuurd, druk dan op Versturen en daarna op "Ja, verstuurd".</p>
        </>
      )}
    </BevestigModal>
  )

  return { verwijder: (f: VerkoopFactuur) => vraagEerst(f, 'weg'), trekIn: (f: VerkoopFactuur) => vraagEerst(f, 'intrekken'), betaald, dialoog }
}
