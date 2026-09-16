// Eén orderregel in de brede matrix.
//
// Rechts staat de voortgang twee keer: als balk en als zin. De balk is voor de
// blik, de zin is voor het antwoord — "12 klaar om te leveren, 6 nog te maken"
// zegt wat een percentage nooit zegt.
import { formatBedrag } from '../../../api/projects'
import { articlesApi } from '../../../api/articles'
import { ArtikelPreviewThumb } from '../ArtikelPreviewThumb'
import { VoortgangBalk } from './VoortgangBalk'
import type { RegelVoortgang, OfferteRegel, ProductieOrder } from '@stockmanager/shared'

const TINT_A = 'rgba(15,17,22,.035)'
const TINT_B = 'rgba(15,17,22,.015)'

/** Wat er met deze regel moet gebeuren, in woorden. De volgorde loopt van
 *  "geld binnen" terug naar "nog niets gebeurd", zodat de eerste regel die
 *  past ook de meest actuele is. */
export function watNu(v: RegelVoortgang, machine: string | null): { kleur: string; zin: string } {
  if (v.gecrediteerd > 0 && v.teFactureren === 0 && v.teMaken === 0 && v.klaar === 0) {
    return { kleur: 'var(--warning)', zin: `${v.gecrediteerd} retour — gecrediteerd` }
  }
  if (v.besteld > 0 && v.gefactureerd + v.gecrediteerd >= v.besteld) {
    return { kleur: 'var(--success)', zin: 'helemaal afgerond' }
  }
  if (v.klaar > 0) {
    const rest = v.teMaken > 0 ? `, ${v.teMaken} nog te maken` : ''
    return { kleur: 'var(--success)', zin: `${v.klaar} klaar om te leveren${rest}` }
  }
  if (v.teFactureren > 0) {
    return { kleur: 'var(--accent)', zin: `${v.teFactureren} geleverd, nog te factureren` }
  }
  if (v.gemaakt === 0) {
    return {
      kleur: 'var(--text-4)',
      zin: `nog niet begonnen${machine ? ` · ${machine}` : ''}`,
    }
  }
  return { kleur: 'var(--text-3)', zin: `${v.teMaken} nog te maken` }
}

interface Props {
  voortgang: RegelVoortgang
  regel: OfferteRegel | undefined
  orders: ProductieOrder[]
  /** Welke kolomgroepen ingeklapt staan — die cellen worden overgeslagen. */
  dicht: Set<'offerte' | 'productie' | 'levering' | 'factuur'>
  onPakbon?: (paklijstId: string) => void
  onArtikel?: (artikelId: string) => void
}

export function MatrixRij({ voortgang: v, regel, orders, dicht, onPakbon, onArtikel }: Props) {
  const artikelId = regel?.artikelId ?? null
  const art = artikelId ? articlesApi.list().find(a => a.id === artikelId) ?? null : null
  const machine = orders.find(o => o.offerteRegelId === v.offerteRegelId)?.stappen[0]?.machine ?? null
  const { kleur, zin } = watNu(v, machine)

  // Waar elke pakbon ophield, opgeteld vanaf het begin: de witte streepjes in
  // de balk staan precies op die grenzen.
  const grenzen: number[] = []
  let loop = 0
  for (const l of v.leveringen) { loop += l.qty; grenzen.push(loop) }

  return (
    <tr className="r">
      <td style={{ padding: '0 5px' }}>
        {/* 36 px past in de kolom van 46; op 52 liep de tekening over de
            artikelnaam heen. */}
        <ArtikelPreviewThumb article={art} size={36} />
      </td>
      <td style={{ padding: '0 10px' }}>
        <div
          onClick={artikelId && onArtikel ? () => onArtikel(artikelId) : undefined}
          title={artikelId && onArtikel ? 'Naar het artikel' : undefined}
          style={{
            fontSize: 12.5, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.3,
            cursor: artikelId && onArtikel ? 'pointer' : 'default',
          }}
        >
          {v.naam}
        </div>
        <div className="cell-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {artikelId ?? '—'}
        </div>
      </td>

      {!dicht.has('offerte') && <>
        <td className="mn" style={{ padding: '0 9px', textAlign: 'right', background: TINT_B }}>
          {v.besteld}
        </td>
        <td className="mn" style={{ padding: '0 9px', textAlign: 'right', background: TINT_B, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          {formatBedrag(v.verkoopprijs)}
        </td>
      </>}
      <td className="mn" style={{ padding: '0 9px', textAlign: 'right', background: TINT_B, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {dicht.has('offerte') ? '' : formatBedrag(v.besteld * v.verkoopprijs)}
      </td>

      <td className="mn" style={{
        padding: '0 9px', textAlign: 'right', background: TINT_A,
        color: v.gemaakt === v.besteld ? 'var(--success)' : 'var(--text-2)',
      }}>
        {dicht.has('productie')
          ? ''
          : <>{v.gemaakt}<span style={{ color: 'var(--text-4)' }}> / {v.besteld}</span></>}
      </td>

      {!dicht.has('levering') && (
        <td style={{ padding: '0 9px', textAlign: 'right', background: TINT_B }}>
          {v.geleverd > 0
            ? <span className="mn" style={{ color: 'var(--accent)', fontWeight: v.geleverd === v.besteld ? 600 : 400 }}>{v.geleverd}</span>
            : <span style={{ color: 'var(--text-4)' }}>—</span>}
        </td>
      )}
      <td style={{ padding: '0 9px', background: TINT_B }}>
        {dicht.has('levering')
          ? ''
          : v.leveringen.length > 0
            ? (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3, whiteSpace: 'normal' }}>
                {v.leveringen.map(l => (
                  <button
                    key={l.paklijstId}
                    type="button"
                    className="chip mn"
                    onClick={onPakbon ? () => onPakbon(l.paklijstId) : undefined}
                    title={onPakbon ? `Pakbon ${l.paklijstId} bekijken` : undefined}
                    style={{
                      background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11,
                      border: 0, cursor: onPakbon ? 'pointer' : 'default', font: 'inherit',
                    }}
                  >
                    {l.paklijstId} · {l.qty}
                  </button>
                ))}
              </span>
            )
            : <span style={{ color: 'var(--text-4)' }}>—</span>}
      </td>

      <td className="mn" style={{
        padding: '0 9px', textAlign: 'right', background: TINT_A,
        fontWeight: v.teFacturerenBedrag > 0 ? 600 : 400, whiteSpace: 'nowrap',
        color: v.teFacturerenBedrag > 0 ? 'var(--text)' : 'var(--text-4)',
      }}>
        {dicht.has('factuur')
          ? ''
          : v.teFacturerenBedrag > 0 ? formatBedrag(v.teFacturerenBedrag) : '—'}
      </td>

      <td style={{ padding: '0 10px' }}>
        <VoortgangBalk voortgang={v} leveringGrenzen={grenzen} />
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11.5,
          color: kleur, marginTop: 6, whiteSpace: 'normal', lineHeight: 1.3,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: kleur,
            flexShrink: 0, marginTop: 4,
          }} />
          <span>{zin}</span>
        </div>
      </td>
    </tr>
  )
}
