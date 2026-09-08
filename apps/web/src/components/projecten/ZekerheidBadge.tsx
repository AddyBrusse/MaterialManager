import { Tooltip } from '@mantine/core'
import type { ExtractieRapport } from '@stockmanager/shared'

/**
 * Hoe zeker is deze regel? — features/60-mail-import.md §6.
 *
 * Eén balkje per regel, zodat je in één blik ziet welke regels aandacht nodig
 * hebben zonder ze allemaal te lezen. Wat het níet is: een gemeten
 * nauwkeurigheid. Het zegt hoe goed onderbouwd de regel is (gevonden, terug te
 * vinden in de mail, gekoppeld aan een artikel, aantal bekend) — daarom staat
 * de opsomming van redenen erbij in de tooltip.
 */

export function kleurVoor(zekerheid: number): string {
  if (zekerheid >= 0.8) return 'var(--success)'
  if (zekerheid >= 0.55) return 'var(--warning)'
  return 'var(--danger)'
}

export function ZekerheidBadge({ zekerheid, redenen }: { zekerheid: number; redenen: string[] }) {
  const kleur = kleurVoor(zekerheid)
  const procent = Math.round(zekerheid * 100)

  return (
    <Tooltip
      multiline
      w={300}
      withArrow
      position="left"
      label={
        <div style={{ fontSize: 11 }}>
          <strong>Zekerheid {procent}%</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 14 }}>
            {redenen.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      }
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'help' }}>
        <span
          style={{
            width: 34, height: 5, borderRadius: 3, background: 'var(--surface-3, #e6e6e6)',
            overflow: 'hidden', flexShrink: 0,
          }}
        >
          <span style={{ display: 'block', width: `${procent}%`, height: '100%', background: kleur }} />
        </span>
        <span style={{ fontSize: 10.5, color: kleur, whiteSpace: 'nowrap' }}>{procent}%</span>
      </span>
    </Tooltip>
  )
}

/** De samenvatting boven de tabel: is dit resultaat in zijn geheel te vertrouwen? */
export function ExtractieSamenvatting({ rapport }: { rapport: ExtractieRapport | null }) {
  if (!rapport) return null
  const procent = Math.round(rapport.zekerheid * 100)
  const laagste = Math.round(rapport.laagsteZekerheid * 100)

  return (
    <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 3, lineHeight: 1.5 }}>
      <span style={{ color: kleurVoor(rapport.zekerheid) }}>Zekerheid gemiddeld {procent}%</span>
      {rapport.laagsteZekerheid < rapport.zekerheid && <> · laagste regel {laagste}%</>}
      {rapport.aiGebruikt && <> · gelezen door {rapport.model}</>}
      {rapport.controleGedaan && <> · met controlelezing</>}
      {/* Welke bron de regels bepaalde is het eerste wat je wilt weten bij een
          controle: kwam dit uit de order van de klant of uit bestandsnamen? */}
      {rapport.documentGebruikt ? (
        <div>Regels uit <strong>{rapport.documentGebruikt}</strong>; meegestuurde tekeningen zijn eraan gehangen.</div>
      ) : (
        <div>Geen leesbaar order- of aanvraagdocument gevonden — regels uit de mail en de bestandsnamen.</div>
      )}
      {rapport.gescandeBijlagen.length > 0 && (
        <div>
          Als afbeelding gelezen (geen tekstlaag): {rapport.gescandeBijlagen.join(', ')}
        </div>
      )}
      {rapport.ongegrondeRegels > 0 && (
        <div style={{ color: 'var(--danger)' }}>
          {rapport.ongegrondeRegels} regel(s) niet letterlijk terug te vinden in de mail — nakijken.
        </div>
      )}
      {rapport.onbevestigdeRegels > 0 && (
        <div style={{ color: 'var(--danger)' }}>
          {rapport.onbevestigdeRegels} regel(s) waarover de twee lezingen het oneens waren — nakijken.
        </div>
      )}
      {rapport.foutmelding && (
        <div style={{ color: 'var(--warning)' }}>{rapport.foutmelding}</div>
      )}
    </div>
  )
}
