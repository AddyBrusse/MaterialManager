import { useState } from 'react'
import { Checkbox, Modal, Select, TextInput } from '@mantine/core'
import { voorstelLosseCredit, waaromNietLosseCredit, type VerkoopFactuur } from '@stockmanager/shared'
import { ApiFout } from '../../api/client'
import { facturenApi } from '../../api/facturen'
import { relatiesApi } from '../../api/relaties'
import { datum, eur } from '../../features/projects/detail/lib/format'
import { meldFout } from '../../utils/fout-melding-toon'
import { Weigering } from '../../utils/fout-melding'

interface Props {
  facturen: VerkoopFactuur[]
  /** Vanuit "Crediteren" op een factuur: klant en factuur staan al ingevuld. */
  vanFactuur: VerkoopFactuur | null
  onSluit: () => void
  /** De credit staat op de server (concept); het venster om hem aan te passen gaat open. */
  onGemaakt: (credit: VerkoopFactuur) => void
}

/**
 * Een losse creditfactuur beginnen (2026-11-18): op een verstuurde losse
 * factuur (dan neemt hij wat er nog openstaat, tegen de prijs van de factuur),
 * of helemaal los met een reden. Retour = de stuks komen terug op voorraad.
 */
export function NieuweCreditVenster({ facturen, vanFactuur, onSluit, onGemaakt }: Props) {
  const [relatieId, setRelatieId] = useState<string | null>(vanFactuur?.relatieId ?? null)
  const [factuurId, setFactuurId] = useState<string | null>(vanFactuur?.id ?? null)
  const [reden, setReden] = useState('')
  const [retour, setRetour] = useState(false)
  const [bezig, setBezig] = useState(false)

  const klanten = relatiesApi.listSync().filter((r) => r.type !== 'leverancier' && (r.actief !== false || r.id === relatieId))
  const teCrediteren = facturen.filter((f) => !f.projectId && f.soort === 'factuur' && f.verzondenOp && f.relatieId === relatieId)

  const maak = async () => {
    const actie = 'Creditfactuur maken'
    const nee = waaromNietLosseCredit(facturen, {
      factuurId, relatieId, reden, regels: factuurId ? voorstelLosseCredit(facturen, factuurId) : [],
    }, { leegMag: !factuurId })
    if (nee) {
      meldFout({ actie, fout: new Weigering(nee), gevolg: 'Er is geen creditfactuur gemaakt.' })
      return
    }
    setBezig(true)
    try {
      onGemaakt(await facturenApi.maakCredit({ factuurId, relatieId, reden: reden.trim() || null, retour }))
    } catch (fout) {
      meldFout({
        actie, fout,
        gevolg: fout instanceof ApiFout && fout.code === 'TIMEOUT'
          ? 'Onbekend of hij gemaakt is: de server antwoordde niet op tijd. Kijk in de lijst voor je het opnieuw doet.'
          : 'Er is geen creditfactuur gemaakt.',
      })
    } finally {
      setBezig(false)
    }
  }

  return (
    <Modal opened onClose={onSluit} title="Nieuwe creditfactuur" size="lg" centered closeOnClickOutside={!bezig}>
      <Select size="xs" label="Klant" searchable required data={klanten.map((r) => ({ value: r.id, label: r.naam }))}
        value={relatieId} onChange={(id) => { setRelatieId(id); setFactuurId(null) }} disabled={!!vanFactuur}
        nothingFoundMessage="Geen klant gevonden" />
      <Select size="xs" mt={8} label="Op factuur" clearable disabled={!relatieId || !!vanFactuur}
        placeholder={!relatieId ? 'Kies eerst de klant' : teCrediteren.length ? 'Geen: een losse credit (prijscorrectie, bonus)' : 'Deze klant heeft geen verstuurde losse factuur'}
        description="Op een factuur neemt de credit wat er nog openstaat, tegen de prijs van die factuur. Pas daarna aan wat niet klopt."
        data={teCrediteren.map((f) => ({ value: f.id, label: `${f.id} · ${datum(f.verzondenOp)} · ${eur(f.totaalInclBtw)}` }))}
        value={factuurId} onChange={setFactuurId} />
      <TextInput size="xs" mt={8} label="Reden" required={!factuurId} maxLength={500} value={reden}
        placeholder={factuurId ? 'Optioneel' : 'Prijscorrectie oktober, retour 2 stuks…'} onChange={(e) => setReden(e.currentTarget.value)} />
      <Checkbox size="xs" mt={10} label="Retour: de stuks komen terug op de vrije voorraad bij versturen" checked={retour}
        onChange={(e) => setRetour(e.currentTarget.checked)} />
      <div className="fact-voet">
        <span className="fact-stand">Er komt pas een nummer bij versturen.</span>
        <button type="button" className="st-btn sm" onClick={onSluit}>Annuleren</button>
        <button type="button" className="st-btn sm primary" disabled={bezig} onClick={() => void maak()}>Credit maken</button>
      </div>
    </Modal>
  )
}
