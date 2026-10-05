import { useState, type ReactNode } from 'react'
import type { Project, Relatie, UpdateProject } from '@stockmanager/shared'
import { relatiesApi } from '../../../../../api/relaties'
import { meldFout } from '../../../../../utils/fout-melding-toon'
import { Weigering } from '../../../../../utils/fout-melding'
import { Card } from '../../components/Card'
import { BevestigModal } from '../../components/BevestigModal'
import { datum, relatieveDagen } from '../../lib/format'
import { enigContact, klantOpties, waarschuwingKlantWissel } from '../../lib/klant-keuze'
import { KeuzeMetNieuw } from './KeuzeMetNieuw'

interface Props {
  project: Project
  relaties: Relatie[]
  geblokkeerd: boolean
  /** Opslaan; mislukt het, dan meldt syncProject het en zet het scherm terug. */
  onZet: (patch: UpdateProject) => void
  /** Na een nieuwe klant of contactpersoon: de relatielijst opnieuw lezen. */
  onRelatiesGewijzigd: () => void
  /** Onder de velden, over de volle breedte (de notities). */
  children?: ReactNode
}

/**
 * §5.1 — wie, wat en wanneer. Altijd in te vullen, net als de Opdracht-tab: er
 * was een knop "Bewerken", maar wat je daarna typte werd nergens opgeslagen
 * (gevonden 2026-10-01). Kiezen slaat meteen op, tekst bij het verlaten van
 * het veld.
 */
export function BasisGegevens({ project: p, relaties, geblokkeerd, onZet, onRelatiesGewijzigd, children }: Props) {
  const relatie = relaties.find((r) => r.id === p.relatieId) ?? null
  const contact = relatie?.contacten?.find((c) => c.id === p.contactId) ?? null
  const [wissel, setWissel] = useState<{ relatieId: string | null; tekst: string } | null>(null)

  // Een andere klant neemt zijn enige contactpersoon mee; meer dan één → kiezen.
  const zetKlant = (relatieId: string | null, lijst: Relatie[] = relaties) => {
    setWissel(null)
    onZet({ relatieId, contactId: enigContact(lijst.find((r) => r.id === relatieId)) })
  }

  const kiesKlant = (relatieId: string | null, lijst?: Relatie[]) => {
    if (relatieId === p.relatieId) return
    const tekst = waarschuwingKlantWissel(p, relatie?.naam ?? null)
    if (tekst) setWissel({ relatieId, tekst })
    else zetKlant(relatieId, lijst)
  }

  const nieuweKlant = async (naam: string) => {
    try {
      // Alleen de naam: adres en de rest vul je later aan op de Relaties-pagina.
      const r = await relatiesApi.aanmaken({
        naam, type: 'klant', actief: true, land: 'Nederland',
        factuurAdresZelfde: true, afleverAdresZelfde: true, contacten: [],
      })
      onRelatiesGewijzigd()
      kiesKlant(r.id, [...relaties, r])
    } catch (fout) {
      meldFout({
        actie: `Nieuwe klant "${naam}" aanmaken`,
        fout,
        gevolg: 'Er is geen klant aangemaakt en het project is niet gewijzigd.',
      })
    }
  }

  const nieuwContact = async (naam: string) => {
    if (!relatie) return
    try {
      const { contactId } = await relatiesApi.contactToevoegen(relatie.id, naam)
      onRelatiesGewijzigd()
      onZet({ contactId })
    } catch (fout) {
      meldFout({
        actie: `Contactpersoon "${naam}" toevoegen aan ${relatie.naam}`,
        fout,
        gevolg: 'Er is geen contactpersoon toegevoegd en het project is niet gewijzigd.',
      })
    }
  }

  const tekst = (veld: 'naam' | 'klantRef', waarde: string) => {
    const nieuw = waarde.trim()
    if (veld === 'naam') {
      if (nieuw === p.naam) return
      if (!nieuw) {
        meldFout({
          actie: 'Projectnaam wijzigen',
          fout: new Weigering('Een project moet een naam hebben.'),
          gevolg: `Er is niets opgeslagen; de naam blijft "${p.naam}".`,
        })
        return
      }
      onZet({ naam: nieuw })
    } else if (nieuw !== (p.klantRef ?? '')) {
      onZet({ klantRef: nieuw || null })
    }
  }

  return (
    <Card titel="Project">
      <div className="pdv2-form">
        <div className="pdv2-form-grid">
          <div className="pdv2-veld breed">
            <label htmlFor="pdv2-naam">Projectnaam</label>
            <input
              id="pdv2-naam"
              key={p.naam}
              defaultValue={p.naam}
              maxLength={200}
              disabled={geblokkeerd}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onBlur={(e) => tekst('naam', e.currentTarget.value)}
            />
          </div>
          <div />
          <KeuzeMetNieuw
            id="pdv2-klant"
            label="Klant"
            soort="klant"
            placeholder="Zoek of typ een klant"
            opties={klantOpties(relaties, p.relatieId)}
            waarde={p.relatieId}
            disabled={geblokkeerd}
            hint={relatie?.kvk ? `KvK ${relatie.kvk}` : undefined}
            onKies={(id) => kiesKlant(id)}
            onNieuw={nieuweKlant}
          />
          <KeuzeMetNieuw
            id="pdv2-contact"
            label="Contactpersoon"
            soort="contact"
            placeholder={relatie ? 'Zoek of typ een naam' : 'Kies eerst een klant'}
            opties={(relatie?.contacten ?? []).map((c) => ({ value: c.id, label: c.naam }))}
            waarde={contact?.id ?? null}
            disabled={geblokkeerd || !relatie}
            hint={contact?.email ?? undefined}
            onKies={(contactId) => onZet({ contactId })}
            onNieuw={nieuwContact}
          />
          <div className="pdv2-veld">
            <label htmlFor="pdv2-ref">Uw referentie</label>
            <input
              id="pdv2-ref"
              key={p.klantRef ?? ''}
              defaultValue={p.klantRef ?? ''}
              maxLength={200}
              disabled={geblokkeerd}
              placeholder="ordernummer of aanvraag"
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onBlur={(e) => tekst('klantRef', e.currentTarget.value)}
            />
          </div>
          <div className="pdv2-veld">
            <label htmlFor="pdv2-lever">Levertijd</label>
            <input
              id="pdv2-lever"
              type="date"
              key={p.levertijdDatum ?? ''}
              defaultValue={p.levertijdDatum?.slice(0, 10) ?? ''}
              disabled={geblokkeerd}
              onBlur={(e) => {
                const v = e.currentTarget.value || null
                if (v !== (p.levertijdDatum?.slice(0, 10) ?? null)) onZet({ levertijdDatum: v })
              }}
            />
            <div className="hint">{relatieveDagen(p.levertijdDatum) || 'Dezelfde datum als op de Opdracht-tab.'}</div>
          </div>
          {children}
        </div>
        <div className="pdv2-meta">
          Aangemaakt {datum(p.createdAt)} · laatst gewijzigd {datum(p.updatedAt)}
        </div>
      </div>

      {wissel && (
        <BevestigModal
          titel="Toch de klant wijzigen?"
          knop="Klant wijzigen"
          onSluit={() => setWissel(null)}
          onBevestig={() => zetKlant(wissel.relatieId)}
        >
          <p>{wissel.tekst}</p>
          <p>
            Nieuwe klant:{' '}
            <strong>{relaties.find((r) => r.id === wissel.relatieId)?.naam ?? '(geen klant)'}</strong>
          </p>
        </BevestigModal>
      )}
    </Card>
  )
}
