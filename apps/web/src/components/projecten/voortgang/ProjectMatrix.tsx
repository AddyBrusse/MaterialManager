// De brede matrix: alle vier de stappen naast elkaar, één rij per orderregel.
//
// Geen wisselende kolomsets en geen tabbladen — de vier kolomgroepen zijn de
// stappen, en elke groep draagt zijn eigen volgende handeling in de kop.
//
// De breedtes staan vast in een colgroup. Zonder dat verdeelt de browser bij
// `table-layout: fixed` alles gelijk over de eerste rij, en die eerste rij is
// hier de groepskoprij met colspans — dan zijn alle kolommen even breed en
// lopen de groepskoppen over elkaar heen.
import { useState } from 'react'
import { formatBedrag } from '../../../api/projects'
import { StapKop, StappenLabel } from './StapKop'
import { MatrixRij } from './MatrixRij'
import type { Project, ProjectVoortgang, StapStand, OfferteRegel } from '@stockmanager/shared'

/** Welke kolomgroepen dicht staan. Inklappen is er niet voor de sier: in de
 *  offertefase zeggen Productie, Levering en Factuur nog niets, en dan gaat
 *  hun ruimte naar de kolommen waar je op dat moment wél naar kijkt. */
type Groep = 'offerte' | 'productie' | 'levering' | 'factuur'

const TINT_A = 'rgba(15,17,22,.035)'
const TINT_B = 'rgba(15,17,22,.015)'

// Vaste breedtes, met horizontaal schuiven als het scherm te smal is.
//
// Gemeten: bij een venster van 1440 blijft er naast de zijbalk 1190 px over,
// niet 1440. Het ontwerp ging uit van 1392 en dan viel juist de statuskolom —
// het enige dat zegt wát er moet gebeuren — buiten beeld. Deze breedtes tellen
// op tot 1180 en passen daar dus wel in.
//
// De ondergrens per kolom komt van de groepskop erboven, niet van de cel
// eronder: "PRODUCTIE 82/100" is breder dan "34 / 40", dus die kop bepaalt.
// Percentages waren het alternatief, maar dan krimpen de geldkolommen mee tot
// "€ 113,42" over twee regels breekt.
const BREEDTES = [
  46,  // tekening
  172, // artikel (draagt ook de hintregel 'bestellen → maken → …')
  52,  // aantal        ┐
  88,  // stukprijs     ├ kopgroep Offerte (240)
  100, // totaal        ┘
  172, // gemaakt       — kopgroep Productie ("PRODUCTIE 82/100" = 165 nodig)
  72,  // geleverd      ┐ kopgroep Levering (224; de kop vraagt 213)
  152, // pakbonnen     ┘
  120, // nog te fact.  — kopgroep Factuur
  206, // voortgang & volgende stap
]
// De breedte van een dichtgeklapte groep: net genoeg voor de chevron en de
// eerste letters, zodat je ziet wat er dicht staat.
const GOOT = 74

export type StapActies = {
  offerte: { stand: StapStand; tekst: string; titel?: string; fn?: () => void }
  productie: { stand: StapStand; tekst: string; titel?: string; fn?: () => void }
  levering: { stand: StapStand; tekst: string; titel?: string; fn?: () => void }
  factuur: { stand: StapStand; tekst: string; titel?: string; fn?: () => void }
}

interface Props {
  project: Project
  voortgang: ProjectVoortgang
  regels: OfferteRegel[]
  acties: StapActies
  offerteNr: string | null
  /** Klik op een pakbonchip → naar die pakbon in de documentenweergave. */
  onPakbon?: (paklijstId: string) => void
  /** Klik op een artikelregel → naar het artikel. */
  onArtikel?: (artikelId: string) => void
}

export function ProjectMatrix({
  project, voortgang: v, regels, acties, offerteNr, onPakbon, onArtikel,
}: Props) {
  const [dicht, setDicht] = useState<Set<Groep>>(new Set())
  const klap = (g: Groep) => setDicht(vorige => {
    const volgende = new Set(vorige)
    if (volgende.has(g)) volgende.delete(g); else volgende.add(g)
    return volgende
  })
  const isDicht = (g: Groep) => dicht.has(g)

  const regelVan = (id: string) => regels.find(r => r.id === id)
  const offerteTotaal = v.regels.reduce((t, r) => t + r.besteld * r.verkoopprijs, 0)
  const bonnen = v.aantalPakbonnen

  // Een dichtgeklapte groep krimpt tot één smalle goot. De verhoudingen van de
  // open kolommen blijven; alleen de vrijgekomen ruimte wordt verdeeld.
  const breedtes = [
    BREEDTES[0], BREEDTES[1],
    ...(isDicht('offerte') ? [0, 0, GOOT] : BREEDTES.slice(2, 5)),
    isDicht('productie') ? GOOT : BREEDTES[5],
    ...(isDicht('levering') ? [0, GOOT] : BREEDTES.slice(6, 8)),
    isDicht('factuur') ? GOOT : BREEDTES[8],
    BREEDTES[9],
  ]

  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 8, overflowX: 'auto',
    }}>
      <table style={{
        width: '100%', minWidth: breedtes.reduce((t, w) => t + w, 0),
        tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0,
      }}>
        <colgroup>
          {breedtes.map((w, i) => (
            <col key={i} style={w === 0 ? { display: 'none' } : { width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <StappenLabel />
            <StapKop
              naam="Offerte" span={isDicht('offerte') ? 1 : 3} tint={TINT_B}
              dicht={isDicht('offerte')} onKlap={() => klap('offerte')}
              samenvatting={offerteNr ?? formatBedrag(offerteTotaal)}
              stand={acties.offerte.stand} knopTekst={acties.offerte.tekst}
              titel={acties.offerte.titel} onClick={acties.offerte.fn}
            />
            <StapKop
              naam="Productie" span={1} tint={TINT_A}
              dicht={isDicht('productie')} onKlap={() => klap('productie')}
              samenvatting={`${v.gemaakt}/${v.besteld}`}
              stand={acties.productie.stand} knopTekst={acties.productie.tekst}
              titel={acties.productie.titel} onClick={acties.productie.fn}
            />
            <StapKop
              naam="Levering" span={isDicht('levering') ? 1 : 2} tint={TINT_B}
              dicht={isDicht('levering')} onKlap={() => klap('levering')}
              samenvatting={bonnen > 0 ? `${v.geleverd} in ${bonnen} pakbon${bonnen > 1 ? 'nen' : ''}` : '—'}
              stand={acties.levering.stand} knopTekst={acties.levering.tekst}
              titel={acties.levering.titel} onClick={acties.levering.fn}
            />
            <StapKop
              naam="Factuur" span={1} tint={TINT_A}
              dicht={isDicht('factuur')} onKlap={() => klap('factuur')}
              samenvatting={v.teFacturerenBedrag > 0 ? `${formatBedrag(v.teFacturerenBedrag)} open` : '—'}
              stand={acties.factuur.stand} knopTekst={acties.factuur.tekst}
              titel={acties.factuur.titel} onClick={acties.factuur.fn}
            />
            <th style={{
              background: 'var(--bg-2)', borderBottom: '1px solid var(--border)',
              padding: '7px 10px', verticalAlign: 'top',
            }}>
              <span style={{
                fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '.05em', color: 'var(--text-3)',
              }}>
                Voortgang &amp; volgende stap
              </span>
            </th>
          </tr>
          <tr className="h">
            <th />
            <th>Artikel</th>
            {!isDicht('offerte') && <>
              <th style={{ textAlign: 'right', background: TINT_B }}>Aantal</th>
              <th style={{ textAlign: 'right', background: TINT_B }}>Stukprijs</th>
            </>}
            <th style={{ textAlign: 'right', background: TINT_B }}>
              {isDicht('offerte') ? '' : 'Totaal'}
            </th>
            <th style={{ textAlign: 'right', background: TINT_A }}>
              {isDicht('productie') ? '' : 'Gemaakt'}
            </th>
            {!isDicht('levering') && (
              <th style={{ textAlign: 'right', background: TINT_B }}>Geleverd</th>
            )}
            <th style={{ background: TINT_B }}>{isDicht('levering') ? '' : 'Pakbonnen'}</th>
            <th style={{ textAlign: 'right', background: TINT_A }}>
              {isDicht('factuur') ? '' : 'Nog te fact.'}
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {v.regels.map(r => (
            <MatrixRij
              key={r.offerteRegelId}
              voortgang={r}
              regel={regelVan(r.offerteRegelId)}
              orders={project.productieOrders}
              dicht={dicht}
              onPakbon={onPakbon}
              onArtikel={onArtikel}
            />
          ))}
          <tr>
            <td colSpan={2} style={{
              padding: '11px 10px', textAlign: 'right', fontSize: 12,
              color: 'var(--text-2)', borderBottom: 0,
            }}>
              Totaal
            </td>
            {!isDicht('offerte') && <>
              <td className="mn" style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 600, borderBottom: 0, background: TINT_B }}>
                {v.besteld}
              </td>
              <td style={{ borderBottom: 0, background: TINT_B }} />
            </>}
            <td className="mn" style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 600, borderBottom: 0, background: TINT_B, whiteSpace: 'nowrap' }}>
              {isDicht('offerte') ? '' : formatBedrag(offerteTotaal)}
            </td>
            <td className="mn" style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 600, color: 'var(--success)', borderBottom: 0, background: TINT_A }}>
              {isDicht('productie') ? '' : v.gemaakt}
            </td>
            {!isDicht('levering') && (
              <td className="mn" style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)', borderBottom: 0, background: TINT_B }}>
                {v.geleverd}
              </td>
            )}
            <td className="mn" style={{ padding: '11px 9px', borderBottom: 0, background: TINT_B, fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
              {/* De echte deling over de bonnen — het totaal alleen verbergt dat
                  het twee leveringen waren. */}
              {isDicht('levering') ? '' : project.paklijsten
                .map(pl => pl.regels.reduce((t, r) => t + r.qty, 0))
                .join(' + ')}
            </td>
            <td className="mn" style={{ padding: '11px 9px', textAlign: 'right', fontWeight: 600, borderBottom: 0, background: TINT_A, whiteSpace: 'nowrap' }}>
              {isDicht('factuur') ? '' : v.teFacturerenBedrag > 0 ? formatBedrag(v.teFacturerenBedrag) : '—'}
            </td>
            <td style={{ borderBottom: 0 }} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
