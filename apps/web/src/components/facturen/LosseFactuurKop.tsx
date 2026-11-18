import { Checkbox, Select, SimpleGrid, Textarea, TextInput } from '@mantine/core'
import { factuurMailadres, type Relatie } from '@stockmanager/shared'

export interface ConceptKop {
  relatieId: string | null
  contactId: string | null
  klantRef: string
  leverdatum: string
  naarEmail: string
  notities: string
  reden: string
  retour: boolean
}

interface Props {
  kop: ConceptKop
  onKop: (k: ConceptKop) => void
  klanten: Relatie[]
  soort: 'factuur' | 'credit'
  /** De klant ligt vast: genummerd, of een credit op een factuur. */
  klantVast: boolean
  /** Een credit op deze factuur; leeg = losse credit, dan is de reden verplicht. */
  crediteert: string | null
  bewerkbaar: boolean
}

/** De kop van een losse factuur of credit: klant, contact, referentie, leverdatum, mailadres. */
export function LosseFactuurKop({ kop, onKop, klanten, soort, klantVast, crediteert, bewerkbaar }: Props) {
  const klant = klanten.find((r) => r.id === kop.relatieId) ?? null
  const zet = (patch: Partial<ConceptKop>) => onKop({ ...kop, ...patch })
  const kiesKlant = (id: string | null) => {
    const r = klanten.find((x) => x.id === id) ?? null
    // Een andere klant: ook zijn contact en factuurmail, anders gaat de mail naar de vorige.
    zet({ relatieId: id, contactId: null, naarEmail: factuurMailadres(r, null) ?? '' })
  }
  const kiesContact = (id: string | null) => {
    const c = klant?.contacten.find((x) => x.id === id) ?? null
    zet({ contactId: id, naarEmail: kop.naarEmail || factuurMailadres(klant, c) || '' })
  }

  return (
    <div className="fact-kop">
      <SimpleGrid cols={3} spacing="xs">
        <Select size="xs" label="Klant" searchable required data={klanten.map((r) => ({ value: r.id, label: r.naam }))}
          value={kop.relatieId} onChange={kiesKlant} disabled={!bewerkbaar || klantVast} nothingFoundMessage="Geen klant gevonden"
          description={klantVast ? (crediteert ? `Klant van ${crediteert}` : 'Ligt vast: hij heeft een nummer') : undefined} />
        <Select size="xs" label="Contactpersoon" clearable placeholder={klant ? 'Kies een contact' : 'Kies eerst een klant'}
          data={(klant?.contacten ?? []).map((c) => ({ value: c.id, label: c.naam }))} value={kop.contactId}
          onChange={kiesContact} disabled={!bewerkbaar || !klant} />
        <TextInput size="xs" label="Uw referentie" placeholder="Ordernummer van de klant" maxLength={200}
          value={kop.klantRef} onChange={(e) => zet({ klantRef: e.currentTarget.value })} disabled={!bewerkbaar} />
        {soort === 'factuur' && (
          <TextInput size="xs" type="date" label="Leverdatum" description="Leeg = de factuurdatum"
            value={kop.leverdatum} onChange={(e) => zet({ leverdatum: e.currentTarget.value })} disabled={!bewerkbaar} />
        )}
        <TextInput size="xs" label="Mailadres" placeholder="administratie@klant.nl" maxLength={200}
          description="Factuurmail van de klant, anders de contactpersoon"
          value={kop.naarEmail} onChange={(e) => zet({ naarEmail: e.currentTarget.value })} disabled={!bewerkbaar} />
        {soort === 'credit' && (
          <TextInput size="xs" label="Reden" required={!crediteert} maxLength={500}
            placeholder={crediteert ? 'Optioneel' : 'Prijscorrectie oktober, retour 2 stuks…'}
            value={kop.reden} onChange={(e) => zet({ reden: e.currentTarget.value })} disabled={!bewerkbaar} />
        )}
      </SimpleGrid>
      {soort === 'credit' && (
        <Checkbox size="xs" mt={8} label="Retour: de stuks komen terug op de vrije voorraad bij versturen"
          checked={kop.retour} onChange={(e) => zet({ retour: e.currentTarget.checked })} disabled={!bewerkbaar} />
      )}
      <Textarea size="xs" mt={8} label="Opmerking op de factuur" autosize minRows={1} maxRows={4} maxLength={2000}
        value={kop.notities} onChange={(e) => zet({ notities: e.currentTarget.value })} disabled={!bewerkbaar} />
    </div>
  )
}
