import type { OfferteRegel } from '@stockmanager/shared'
import type { OrderRegelDekking } from '../../../../api/materiaal-plan'
import type { ZaagReservation } from '../../../../api/reservations'

/**
 * Hoe het materiaal voor één orderregel ervoor staat.
 *
 * Vier standen (besloten 2026-09-28). Eerder waren het er drie en telde alleen
 * een reservering die nog open stond als "bevestigd" — een staaf die al gezaagd
 * en afgeboekt was sprong daardoor terug naar "nog niets", terwijl het
 * materiaal juist binnen was.
 *
 * Sinds 2026-10-23 doet elke materiaalregel van het artikel mee. Daarom twee
 * standen erbij: `deels` (een deel ligt vast, er is nog iets te kiezen) en
 * `besteld` (niets uit voorraad, alles staat op de bestellijst). Of een regel
 * geregeld is zegt de server (`materiaal-dekking`), niet dit scherm.
 */
export type MateriaalStand = 'kiezen' | 'deels' | 'besteld' | 'gereserveerd' | 'gezaagd' | 'geen'

export interface MateriaalVanRegel {
  stand: MateriaalStand
  /** Alle reserveringen van deze regel, behalve geannuleerde. */
  reserveringen: ZaagReservation[]
  /** Bij `deels`: "1 van 2 materialen" of "40 van 50 st". */
  deelTekst?: string
  /** Een deel staat op de bestellijst. */
  besteld?: boolean
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
  /** Van de server; zonder (nog niet geladen) alleen de reserveringen. */
  dekking?: OrderRegelDekking | null,
): MateriaalVanRegel {
  if (!regel.artikelId) return { stand: 'geen', reserveringen: [] }

  const enigeMetArtikel = alleRegels.filter(r => r.artikelId === regel.artikelId).length === 1
  const eigen = reserveringen.filter(x =>
    x.status !== 'geannuleerd'
    && (x.offerteRegelId
      ? x.offerteRegelId === regel.id
      : enigeMetArtikel && x.artikelId === regel.artikelId),
  )

  const d = dekking?.regels ?? []
  const besteld = d.some(x => x.besteld)
  if (d.length > 0) {
    const klaar = d.filter(x => x.klaar).length
    if (klaar < d.length) {
      const begonnen = eigen.length > 0 || besteld
      if (!begonnen) return { stand: 'kiezen', reserveringen: [] }
      const deelTekst = d.length > 1
        ? `${klaar} van ${d.length} materialen`
        : `${d[0].gedektStuks} van ${d[0].nodigStuks} st`
      return { stand: 'deels', reserveringen: eigen, deelTekst, besteld }
    }
    if (eigen.length === 0 && besteld) return { stand: 'besteld', reserveringen: [], besteld }
  }

  if (eigen.some(x => x.status === 'open' || x.status === 'in_progress')) {
    return { stand: 'gereserveerd', reserveringen: eigen, besteld }
  }
  if (eigen.some(x => x.status === 'done')) return { stand: 'gezaagd', reserveringen: eigen, besteld }
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
