// Ligt het materiaal van een order vast? (2026-10-09)
//
// "Vast" = er is iets gereserveerd (zaagbon) of het tekort staat op de
// bestellijst (bestelregel). Een order waarvoor dat niet zo is, mag niet de hal
// in (`waaromNietVrijgeven`): een tekort moet altijd zichtbaar en geregeld
// zijn. Orders zonder artikel, of met een artikel zonder materiaal in het
// recept, hebben niets nodig.
import type { Prisma } from '@prisma/client'
import type { ArticleEstimate, Project } from '@stockmanager/shared'

type Db = Prisma.TransactionClient

export interface OrderMateriaal {
  orderId: string
  offerteRegelId: string
  artikelNaam: string
  /** Heeft dit artikel materiaal uit voorraad nodig? */
  nodig: boolean
  gereserveerd: { barCode: string; stuks: number; status: string }[]
  bestelRegels: { id: string; status: string; materiaal: string; stuks: number; lengteMm: number }[]
  vastgelegd: boolean
}

/** Materiaal uit voorraad: een materiaalregel in de calculatie die geen exoot is, of het oude recept-veld. */
export function heeftVoorraadMateriaal(artikel: { estimate: unknown; recipe: unknown } | null): boolean {
  if (!artikel) return false
  const est = artikel.estimate as ArticleEstimate | null
  if (est?.nodes?.some((n) => n.type === 'material' && !n.exoot && n.gradeId)) return true
  const recept = artikel.recipe as { gradeId?: string } | null
  return !!recept?.gradeId
}

export async function materiaalStand(db: Db, p: Project): Promise<OrderMateriaal[]> {
  const artikelIds = [...new Set(p.productieOrders.map((o) => o.artikelId).filter((x): x is string => !!x))]
  const [artikelen, bonnen, regels] = await Promise.all([
    db.article.findMany({ where: { id: { in: artikelIds } }, select: { id: true, estimate: true, recipe: true } }),
    db.zaagReservering.findMany({
      where: { projectId: p.id, status: { not: 'geannuleerd' } },
      select: { offerteRegelId: true, artikelId: true, barCode: true, pieces: true, status: true },
    }),
    db.bestelRegel.findMany({
      where: { projectId: p.id },
      select: { id: true, offerteRegelId: true, artikelId: true, status: true, stuks: true, lengteMm: true, gradeId: true, profileId: true, dimensions: true },
    }),
  ])
  const perArtikel = new Map(artikelen.map((a) => [a.id, a]))
  return p.productieOrders.map((o) => {
    // Oude bonnen en regels zonder orderregel tellen mee als er maar één order met dat artikel is.
    const enige = o.artikelId !== null && p.productieOrders.filter((x) => x.artikelId === o.artikelId).length === 1
    const hoort = (x: { offerteRegelId: string | null; artikelId: string | null }) =>
      x.offerteRegelId === o.offerteRegelId || (enige && !x.offerteRegelId && x.artikelId === o.artikelId)
    const gereserveerd = bonnen.filter(hoort).map((b) => ({ barCode: b.barCode, stuks: b.pieces, status: b.status }))
    const bestelRegels = regels.filter(hoort).map((r) => ({
      id: r.id, status: r.status, stuks: r.stuks, lengteMm: Number(r.lengteMm),
      materiaal: Object.values(r.dimensions as Record<string, number>).join('×'),
    }))
    const nodig = !!o.artikelId && heeftVoorraadMateriaal(perArtikel.get(o.artikelId) ?? null)
    return {
      orderId: o.id, offerteRegelId: o.offerteRegelId, artikelNaam: o.artikelNaam, nodig,
      gereserveerd, bestelRegels, vastgelegd: !nodig || gereserveerd.length > 0 || bestelRegels.length > 0,
    }
  })
}

/** De orders uit `orderIds` waarvan het materiaal nog niet vastligt. */
export async function zonderMateriaal(db: Db, p: Project, orderIds: string[]): Promise<string[]> {
  const stand = await materiaalStand(db, p)
  return stand.filter((s) => orderIds.includes(s.orderId) && !s.vastgelegd).map((s) => s.orderId)
}
