import type { OfferteRegel } from '@stockmanager/shared'
import type { ZaagReservation } from '../../../../api/reservations'

/**
 * Hoe het materiaal voor één orderregel ervoor staat.
 *
 * Vier standen (besloten 2026-09-28). Eerder waren het er drie en telde alleen
 * een reservering die nog open stond als "bevestigd" — een staaf die al gezaagd
 * en afgeboekt was sprong daardoor terug naar "nog niets", terwijl het
 * materiaal juist binnen was.
 */
export type MateriaalStand = 'kiezen' | 'gereserveerd' | 'gezaagd' | 'geen'

export interface MateriaalVanRegel {
  stand: MateriaalStand
  /** Alle reserveringen van deze regel, behalve geannuleerde. */
  reserveringen: ZaagReservation[]
}

/**
 * Reserveringen horen per regel bij elkaar via `offerteRegelId`. Oude
 * reserveringen hebben dat niet; die tellen alleen mee als er precies één regel
 * met dat artikel is — anders zou de staaf van de ene regel bij de andere
 * verschijnen.
 */
export function materiaalVanRegel(
  regel: Pick<OfferteRegel, 'id' | 'artikelId'>,
  alleRegels: Pick<OfferteRegel, 'id' | 'artikelId'>[],
  reserveringen: ZaagReservation[],
): MateriaalVanRegel {
  if (!regel.artikelId) return { stand: 'geen', reserveringen: [] }

  const enigeMetArtikel = alleRegels.filter(r => r.artikelId === regel.artikelId).length === 1
  const eigen = reserveringen.filter(x =>
    x.status !== 'geannuleerd'
    && (x.offerteRegelId
      ? x.offerteRegelId === regel.id
      : enigeMetArtikel && x.artikelId === regel.artikelId),
  )

  if (eigen.some(x => x.status === 'open' || x.status === 'in_progress')) {
    return { stand: 'gereserveerd', reserveringen: eigen }
  }
  if (eigen.some(x => x.status === 'done')) return { stand: 'gezaagd', reserveringen: eigen }
  return { stand: 'kiezen', reserveringen: [] }
}

/** "2 staven · 3,40 m · 42CrMo4" — kort genoeg voor een tabelcel. */
export function materiaalSamenvatting(res: ZaagReservation[]): string {
  if (res.length === 0) return ''
  const meters = res.reduce((s, x) => s + x.sawLength, 0) / 1000
  const soorten = [...new Set(res.map(x => x.materiaal).filter(Boolean))].join(', ')
  const staven = new Set(res.map(x => x.barId)).size
  return [
    `${staven} ${staven === 1 ? 'staaf' : 'staven'}`,
    `${meters.toFixed(2).replace('.', ',')} m`,
    soorten,
  ].filter(Boolean).join(' · ')
}
