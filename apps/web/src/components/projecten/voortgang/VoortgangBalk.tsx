// De vier toestanden van een orderregel als één balk.
//
// Niet genest, maar een opdeling: de segmenten tellen altijd op tot wat er
// besteld is. Zo leest de balk van links naar rechts als de weg die het werk
// aflegt, en is de grijze staart altijd precies "wat er nog moet".
import { balkSegmenten, type RegelVoortgang } from '@stockmanager/shared'

/** Eén kleur per toestand, en overal dezelfde. Deze vier woorden komen ook in
 *  de legenda terug, dus wat je in de balk ziet heet daar net zo. */
export const BALK_KLEUR = {
  afgehandeld: 'var(--success)',
  teFactureren: 'var(--accent)',
  klaar: 'rgba(17, 122, 69, .30)',
  teMaken: 'rgba(15, 17, 22, .10)',
} as const

export const BALK_LABEL = {
  afgehandeld: 'afgehandeld',
  teFactureren: 'geleverd, nog te factureren',
  klaar: 'klaar op de vloer',
  teMaken: 'nog te maken',
} as const

type Voortgang = Pick<RegelVoortgang,
  'besteld' | 'gefactureerd' | 'gecrediteerd' | 'geleverd' | 'gemaakt'>

interface Props {
  voortgang: Voortgang
  hoogte?: number
  /** Waar elke pakbon ophield, als aantal stuks vanaf het begin geteld. Tekent
   *  een witte streep in de balk, zodat je ziet dat het twee leveringen waren
   *  en niet één. */
  leveringGrenzen?: number[]
}

export function VoortgangBalk({ voortgang, hoogte = 9, leveringGrenzen = [] }: Props) {
  const totaal = voortgang.besteld
  if (totaal <= 0) return null
  const pct = (n: number) => `${(n / totaal) * 100}%`

  return (
    <div
      style={{
        position: 'relative', display: 'flex', width: '100%', height: hoogte,
        borderRadius: 3, overflow: 'hidden', background: BALK_KLEUR.teMaken,
      }}
    >
      {balkSegmenten(voortgang).map(seg => (
        seg.aantal > 0 && (
          <div
            key={seg.soort}
            title={`${seg.aantal} ${BALK_LABEL[seg.soort]}`}
            style={{ width: pct(seg.aantal), background: BALK_KLEUR[seg.soort] }}
          />
        )
      ))}
      {leveringGrenzen
        // De laatste grens valt samen met het einde van het geleverde deel en
        // zou als streepje op een kleurovergang staan — die voegt niets toe.
        .filter(g => g > 0 && g < voortgang.geleverd)
        .map(g => (
          <div
            key={g}
            style={{
              position: 'absolute', left: pct(g), top: 0, bottom: 0,
              width: 2, background: 'var(--bg-2)',
            }}
          />
        ))}
    </div>
  )
}

/** De legenda onder de projectbalk: dezelfde vier kleuren met hun aantallen. */
export function BalkLegenda({ voortgang }: { voortgang: Voortgang }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {balkSegmenten(voortgang).map(seg => (
        <span
          key={seg.soort}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11.5, color: 'var(--text-2)', whiteSpace: 'nowrap',
          }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: 2, background: BALK_KLEUR[seg.soort],
          }} />
          {seg.aantal} {BALK_LABEL[seg.soort]}
        </span>
      ))}
    </div>
  )
}
