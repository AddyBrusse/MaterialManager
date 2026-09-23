import { balkSegmenten, type RegelVoortgang } from '@stockmanager/shared'

/**
 * De vier toestanden van een orderregel als één balk.
 *
 * De segmenten zijn een **opdeling** van het bestelde aantal, geen geneste
 * schalen: gefactureerd → geleverd-niet-gefactureerd → gemaakt-niet-geleverd →
 * nog te maken. Daardoor tellen ze altijd op tot besteld en is de grijze staart
 * precies "wat er nog moet".
 */

const KLEUR: Record<string, string> = {
  afgehandeld: 'var(--ok)',
  teFactureren: 'var(--accent)',
  klaar: 'var(--warn)',
  teMaken: 'var(--rail)',
}

const LABEL: Record<string, string> = {
  afgehandeld: 'gefactureerd',
  teFactureren: 'geleverd, nog te factureren',
  klaar: 'klaar, nog te leveren',
  teMaken: 'nog te maken',
}

export function VoortgangBalk({ regel, breedte = 132 }: { regel: RegelVoortgang; breedte?: number }) {
  const segmenten = balkSegmenten(regel)
  const totaal = regel.besteld || 1

  return (
    <span
      style={{
        display: 'flex',
        width: breedte,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        background: 'var(--rail)',
      }}
      role="img"
      aria-label={segmenten
        .filter((s) => s.aantal > 0)
        .map((s) => `${s.aantal} ${LABEL[s.soort]}`)
        .join(', ')}
    >
      {segmenten.map((s) => (
        <i
          key={s.soort}
          title={`${s.aantal} ${LABEL[s.soort]}`}
          style={{
            width: `${(s.aantal / totaal) * 100}%`,
            background: KLEUR[s.soort],
          }}
        />
      ))}
    </span>
  )
}

/** De balk in woorden, voor onder de balk. Alleen wat er werkelijk staat. */
export function voortgangTekst(r: RegelVoortgang): string {
  const delen: string[] = []
  if (r.teMaken > 0) delen.push(`${r.teMaken} te maken`)
  if (r.klaar > 0) delen.push(`${r.klaar} klaar`)
  if (r.teFactureren > 0) delen.push(`${r.teFactureren} te factureren`)
  if (r.gefactureerd > 0) delen.push(`${r.gefactureerd} gefactureerd`)
  if (r.gecrediteerd > 0) delen.push(`${r.gecrediteerd} gecrediteerd`)
  return delen.join(' · ') || 'nog niets gebeurd'
}
