import { useMemo, useState } from 'react'
import type { Offerte, Project } from '@stockmanager/shared'
import { relatiesApi } from '../../../../api/relaties'
import { eur } from '../lib/format'

export interface NaarProjectKeuze {
  naam: string
  relatieId: string | null
  contactId: string | null
  externeRef: string | null
}

interface Props {
  project: Project
  offerte: Offerte
  /** Maakt het project; `false` als het mislukte (de melding is dan al getoond). */
  onMaak: (keuze: NaarProjectKeuze) => Promise<boolean>
  onSluit: () => void
}

/**
 * Een offerteversie als begin van een nieuw project — een herhaalorder, of
 * dezelfde onderdelen voor een andere klant.
 *
 * Vraagt alleen wat per bestelling verschilt: voor wie, onder welke naam, en
 * waar het antwoord op geeft. De referentie mag hier leeg; zonder referentie
 * kan de offerte straks alleen niet verstuurd worden, en dat zegt de melding
 * dan zelf.
 */
export function NaarProjectModal({ project, offerte, onMaak, onSluit }: Props) {
  const klanten = useMemo(
    () => relatiesApi.listSync().filter((r) => r.type !== 'leverancier').sort((a, b) => a.naam.localeCompare(b.naam)),
    [],
  )
  const [naam, setNaam] = useState(project.naam)
  const [relatieId, setRelatieId] = useState<string | null>(project.relatieId)
  const [contactId, setContactId] = useState<string | null>(project.contactId)
  const [ref, setRef] = useState('')
  const [bezig, setBezig] = useState(false)

  const contacten = klanten.find((k) => k.id === relatieId)?.contacten ?? []
  const naamFout = naam.trim() ? null : 'Geef het project een naam.'
  const totaal = offerte.regels.reduce((s, r) => s + r.totaal, 0)

  const maak = async () => {
    setBezig(true)
    const gelukt = await onMaak({ naam: naam.trim(), relatieId, contactId, externeRef: ref.trim() || null })
    if (!gelukt) setBezig(false)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Naar nieuw project" className="pdv2-modal-achter" onClick={onSluit}>
      <div className="pdv2-card pdv2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pdv2-card-head">
          <h2>v{offerte.versie} kopiëren naar een nieuw project</h2>
        </div>
        <div className="pdv2-card-body pdv2-modal-tekst">
          <p>
            Het nieuwe project krijgt <strong>v1</strong> met een eigen offertenummer en dezelfde{' '}
            <strong>
              {offerte.regels.length} regel{offerte.regels.length === 1 ? '' : 's'} ({eur(totaal)})
            </strong>{' '}
            tegen dezelfde prijzen. Dit project blijft zoals het is.
          </p>

          <div className="pdv2-veld">
            <label htmlFor="np-naam">Projectnaam</label>
            <input id="np-naam" autoFocus value={naam} onChange={(e) => setNaam(e.currentTarget.value)} />
            {naamFout && (
              <div className="hint" style={{ color: 'var(--dgr)' }}>
                {naamFout}
              </div>
            )}
          </div>

          <div className="pdv2-veld">
            <label htmlFor="np-klant">Klant</label>
            <select
              id="np-klant"
              value={relatieId ?? ''}
              onChange={(e) => {
                setRelatieId(e.currentTarget.value || null)
                // Een contactpersoon hoort bij één klant; bij een andere klant
                // is de oude keuze betekenisloos.
                setContactId(null)
              }}
            >
              <option value="">— geen klant —</option>
              {klanten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.naam}
                </option>
              ))}
            </select>
          </div>

          <div className="pdv2-veld">
            <label htmlFor="np-contact">Contactpersoon</label>
            <select
              id="np-contact"
              value={contactId ?? ''}
              disabled={contacten.length === 0}
              onChange={(e) => setContactId(e.currentTarget.value || null)}
            >
              <option value="">{contacten.length === 0 ? '— geen contactpersonen bij deze klant —' : '— geen —'}</option>
              {contacten.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naam}
                </option>
              ))}
            </select>
          </div>

          <div className="pdv2-veld">
            <label htmlFor="np-ref">Externe referentie</label>
            <input
              id="np-ref"
              maxLength={200}
              placeholder="RFQ-nummer, mail of telefoon van deze aanvraag"
              value={ref}
              onChange={(e) => setRef(e.currentTarget.value)}
            />
            <div className="hint">Mag nu leeg; nodig om de offerte te versturen.</div>
          </div>
        </div>
        <div className="pdv2-modal-knoppen">
          <button type="button" className="pdv2-btn" onClick={onSluit} disabled={bezig}>
            Annuleren
          </button>
          <button type="button" className="pdv2-btn primair" disabled={Boolean(naamFout) || bezig} onClick={maak}>
            {bezig ? 'Bezig…' : 'Project aanmaken'}
          </button>
        </div>
      </div>
    </div>
  )
}
