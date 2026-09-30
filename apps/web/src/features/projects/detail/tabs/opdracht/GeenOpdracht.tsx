import { useState } from 'react'
import type { Project } from '@stockmanager/shared'
import { ArtikelPickerModal } from '../../../../../components/projecten/ArtikelPickerModal'
import { PrijzenBijwerkenModal } from '../../../../../components/projecten/PrijzenBijwerkenModal'
import type { Bijwerking } from '../../../../../components/projecten/prijs-bijwerken'
import { Card } from '../../components/Card'
import { BevestigModal } from '../../components/BevestigModal'
import { datum, eur } from '../../lib/format'
import { OfferteRegels } from '../OfferteRegels'

export interface GeenOpdrachtActies {
  onAccepteer: (offerteId: string) => void
  onDirect: () => void
  onAnnuleerDirect: (offerteId: string) => void
  onRegel: (offerteId: string, regelId: string, patch: { qty?: number; verkoopprijs?: number }) => void
  onVerwijderRegel: (offerteId: string, regelId: string) => void
  onPrijzen: (offerteId: string, gekozen: Bijwerking[]) => void
  onGewijzigd: () => void
}

/**
 * De Opdracht-tab zolang er nog geen opdracht is.
 *
 * Twee wegen naar een opdracht, allebei vanaf hier (besloten 2026-09-28):
 *  - een verstuurde offerte accepteren — de klant appte net "maken!", dan hoef
 *    je niet eerst terug naar Offertes;
 *  - een directe opdracht, zonder offerte. Onder water een offerteversie die
 *    meteen geaccepteerd wordt, zodat productie, nacalculatie, pakbon en
 *    factuur werken zoals altijd.
 */
export function GeenOpdracht({ project: p, geblokkeerd, ...a }: GeenOpdrachtActies & { project: Project; geblokkeerd: boolean }) {
  const [picker, setPicker] = useState(false)
  const [prijzen, setPrijzen] = useState(false)
  const [annuleer, setAnnuleer] = useState(false)
  const direct = p.offertes.find((o) => o.direct && o.status === 'concept') ?? null
  const verstuurd = [...p.offertes].filter((o) => o.status === 'verzonden').sort((x, y) => y.versie - x.versie)

  if (direct) {
    return (
      <Card
        titel="Directe opdracht"
        teller="nog niet gemaakt"
        acties={
          <>
            <button type="button" className="pdv2-btn s" disabled={geblokkeerd} onClick={() => setAnnuleer(true)}>
              Annuleren
            </button>
            <button type="button" className="pdv2-btn s primair" disabled={geblokkeerd} onClick={() => a.onAccepteer(direct.id)}>
              Opdracht maken
            </button>
          </>
        }
      >
        <p className="pdv2-uitleg">
          Voeg de artikelen toe die de klant bestelde, met aantal en prijs. Met <strong>Opdracht maken</strong> ontstaan
          de productieorders en de todo&apos;s voor het materiaal — er wordt geen offerte verstuurd.
        </p>
        <OfferteRegels
          offerte={direct}
          projectId={p.id}
          bewerkbaar={!geblokkeerd}
          onToevoegen={() => setPicker(true)}
          onPrijzen={() => setPrijzen(true)}
          onRegel={(regelId, patch) => a.onRegel(direct.id, regelId, patch)}
          onVerwijder={(regelId) => a.onVerwijderRegel(direct.id, regelId)}
        />
        {picker && (
          <ArtikelPickerModal
            opened
            projectId={p.id}
            offerteId={direct.id}
            relatieId={p.relatieId}
            onClose={() => setPicker(false)}
            onAdded={a.onGewijzigd}
          />
        )}
        {annuleer && (
          <BevestigModal
            titel="Directe opdracht annuleren?"
            knop="Annuleren en weggooien"
            annuleer="Terug"
            gevaar
            onSluit={() => setAnnuleer(false)}
            onBevestig={() => {
              setAnnuleer(false)
              a.onAnnuleerDirect(direct.id)
            }}
          >
            <p>
              De {direct.regels.length} regel{direct.regels.length === 1 ? '' : 's'} die je toevoegde worden
              weggegooid. Er is nog geen opdracht gemaakt, dus verder verandert er niets.
            </p>
          </BevestigModal>
        )}
        {prijzen && (
          <PrijzenBijwerkenModal
            opened
            offerte={direct}
            onClose={() => setPrijzen(false)}
            onBijwerken={(gekozen) => {
              setPrijzen(false)
              a.onPrijzen(direct.id, gekozen)
            }}
          />
        )}
      </Card>
    )
  }

  return (
    <Card
      titel="Opdracht"
      teller="nog geen opdracht"
      acties={
        <button type="button" className="pdv2-btn s" disabled={geblokkeerd} onClick={a.onDirect}>
          Direct opdracht maken
        </button>
      }
      plat={verstuurd.length > 0}
    >
      {verstuurd.length === 0 ? (
        <div className="pdv2-empty">
          Nog geen verstuurde offerte. Verstuur een versie op de Offertes-tab — of gaf de klant zonder offerte opdracht,
          gebruik dan <strong>Direct opdracht maken</strong>.
        </div>
      ) : (
        <table className="pdv2-tbl">
          <thead>
            <tr>
              <th>Wacht op de klant</th>
              <th>Referentie</th>
              <th style={{ width: 100 }}>Verzonden</th>
              <th className="num" style={{ width: 110 }}>Totaal</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {verstuurd.map((o) => (
              <tr key={o.id}>
                <td className="mono">
                  {o.documentNr} v{o.versie}
                  <span className="sub">
                    {o.regels.length} regel{o.regels.length === 1 ? '' : 's'}
                  </span>
                </td>
                <td>{o.externeRef ?? '—'}</td>
                <td className="mono">{datum(o.verzondenOp)}</td>
                <td className="num">{eur(o.regels.reduce((s, r) => s + r.totaal, 0))}</td>
                <td className="pdv2-acties">
                  <button
                    type="button"
                    className="pdv2-btn s primair"
                    disabled={geblokkeerd}
                    onClick={() => a.onAccepteer(o.id)}
                  >
                    Accepteren
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
