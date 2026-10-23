/**
 * Elke materiaalregel uit voorraad (2026-10-23).
 *
 * Een artikel kan meer materiaalregels hebben — een as en een bus, elk met een
 * eigen kwaliteit, maat, lengte en lader. Tot 2026-10-23 deed alleen de eerste
 * mee: de rest werd wel berekend in de kostprijs, maar nooit gekozen,
 * gereserveerd, afgeboekt of besteld. Nu doet elke regel mee, behalve een
 * exoot: die is op maat besteld en volgt zijn eigen weg (bestelregel bij de
 * opdracht, gereserveerd bij ontvangst).
 *
 * Wat er per regel van een order al geregeld is, rekent `dekkingPerRegel` uit.
 * Het selectievenster, de todo "materiaal selecteren" en de Opdracht-tab lezen
 * allemaal daaruit, zodat ze het niet oneens kunnen zijn.
 */

import type { ArticleEstimate, EstimateNode } from './estimate'

/** De materiaalregels die uit de voorraad komen, in de volgorde van het recept. */
export function voorraadRegels(est: Pick<ArticleEstimate, 'nodes'> | null | undefined): EstimateNode[] {
  return (est?.nodes ?? []).filter((n) => n.type === 'material' && !n.exoot && !!n.gradeId)
}

/**
 * Bij welke materiaalregel een reservering of bestelregel hoort.
 *
 * Zonder `materiaalRegelId` is hij van vóór 2026-10-23, toen alleen de eerste
 * regel meedeed: dan die. Een id dat niet meer in het recept staat (regel
 * weggehaald) hoort nergens bij — `undefined`.
 */
export function regelVan(
  materiaalRegelId: string | null | undefined,
  regelIds: (string | null)[],
): string | null | undefined {
  if (regelIds.length === 0) return undefined
  if (materiaalRegelId == null) return regelIds[0]
  return regelIds.includes(materiaalRegelId) ? materiaalRegelId : undefined
}

export interface DekkingReservering {
  materiaalRegelId: string | null
  /** Stuks die uit deze staaf komen. */
  pieces: number
  status: string
}

export interface DekkingTekort {
  materiaalRegelId: string | null
  status: string
}

export interface RegelDekking {
  regelId: string | null
  nodigStuks: number
  /** Gereserveerd of al gezaagd. */
  gedektStuks: number
  /** Er staat een tekort-bestelregel open (nog niet ontvangen). */
  besteld: boolean
  /** Niets meer te kiezen: alles ligt vast, of wat ontbreekt is besteld. */
  klaar: boolean
}

/** Een reservering telt mee zolang hij niet geannuleerd is — ook afgeboekt is gedekt. */
const TELT = new Set(['open', 'in_progress', 'done'])

/**
 * Per materiaalregel: hoeveel stuks er nodig zijn, hoeveel er vastliggen en of
 * de rest besteld is.
 *
 * In stuks en niet in lengtes, omdat de lengtes per stang afhangen van het
 * aantal (gelijk verdeeld, `materiaalBehoefte`): wordt het aantal na het kiezen
 * hoger, dan passen de oude stangen niet meer op de nieuwe verdeling, maar de
 * stuks die al vastliggen blijven gewoon gedekt.
 */
export function dekkingPerRegel(
  regelIds: (string | null)[],
  aantal: number,
  reserveringen: DekkingReservering[],
  tekorten: DekkingTekort[],
): RegelDekking[] {
  const nodig = Math.max(0, Math.floor(aantal || 0))
  return regelIds.map((id) => {
    const hoort = (x: { materiaalRegelId: string | null }) => regelVan(x.materiaalRegelId, regelIds) === id
    const gedektStuks = reserveringen
      .filter((r) => TELT.has(r.status) && hoort(r))
      .reduce((s, r) => s + r.pieces, 0)
    const besteld = tekorten.some((t) => t.status !== 'ontvangen' && hoort(t))
    return {
      regelId: id, nodigStuks: nodig, gedektStuks, besteld,
      klaar: gedektStuks >= nodig || besteld,
    }
  })
}

/** Wat er van een regel nog gekozen moet worden, in stuks. */
export function nogTeKiezen(d: RegelDekking): number {
  return d.klaar ? 0 : Math.max(0, d.nodigStuks - d.gedektStuks)
}
