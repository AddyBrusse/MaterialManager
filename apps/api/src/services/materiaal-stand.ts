// Ligt het materiaal van een order vast? (2026-10-09, per materiaalregel sinds 2026-10-26)
//
// "Vast" = voor elke materiaalregel van het artikel (behalve een exoot) is
// alles gereserveerd of het tekort staat op de bestellijst — dezelfde
// `dekkingPerRegel` als het selectievenster en de todo "materiaal selecteren".
// Een order waarvoor dat niet zo is, mag niet de hal in (`waaromNietVrijgeven`,
// besluit van Addy 2026-10-26: streng). Orders zonder artikel, of met een
// artikel zonder materiaal uit voorraad (geen materiaalregel, alleen exoten),
// hebben niets nodig.
import type { Prisma } from '@prisma/client'
import type { Project } from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { dekkingVanOrderRegel, materialenVanArtikel } from './materiaal-selectie'

type Db = Prisma.TransactionClient

interface OrderMateriaal {
  orderId: string
  offerteRegelId: string
  artikelNaam: string
  /** Heeft dit artikel materiaal uit voorraad nodig? */
  nodig: boolean
  gereserveerd: { barCode: string; stuks: number; status: string }[]
  bestelRegels: { id: string; status: string; materiaal: string; stuks: number; lengteMm: number }[]
  /** Per materiaalregel: geregeld of niet, en wat er eerst moet als hij niet compleet is. */
  regels: { naam: string; materiaal: string; klaar: boolean; fout: string | null }[]
  vastgelegd: boolean
}

export async function materiaalStand(db: Db, p: Project): Promise<OrderMateriaal[]> {
  const [bonnen, bestel] = await Promise.all([
    db.zaagReservering.findMany({
      where: { projectId: p.id, status: { not: 'geannuleerd' } },
      select: { offerteRegelId: true, artikelId: true, barCode: true, pieces: true, status: true },
    }),
    db.bestelRegel.findMany({
      where: { projectId: p.id },
      select: { id: true, offerteRegelId: true, artikelId: true, status: true, stuks: true, lengteMm: true, dimensions: true },
    }),
  ])
  const uit: OrderMateriaal[] = []
  for (const o of p.productieOrders) {
    // Oude bonnen en regels zonder orderregel tellen mee als er maar één order met dat artikel is.
    const enige = o.artikelId !== null && p.productieOrders.filter((x) => x.artikelId === o.artikelId).length === 1
    const hoort = (x: { offerteRegelId: string | null; artikelId: string | null }) =>
      x.offerteRegelId === o.offerteRegelId || (enige && !x.offerteRegelId && x.artikelId === o.artikelId)
    const gereserveerd = bonnen.filter(hoort).map((b) => ({ barCode: b.barCode, stuks: b.pieces, status: b.status }))
    const bestelRegels = bestel.filter(hoort).map((r) => ({
      id: r.id, status: r.status, stuks: r.stuks, lengteMm: Number(r.lengteMm),
      materiaal: Object.values(r.dimensions as Record<string, number>).join('×'),
    }))
    const regels = o.artikelId ? await regelsVanOrder(db, p.id, o.artikelId, o.offerteRegelId, o.qty) : []
    const nodig = regels.length > 0
    uit.push({
      orderId: o.id, offerteRegelId: o.offerteRegelId, artikelNaam: o.artikelNaam, nodig,
      gereserveerd, bestelRegels, regels, vastgelegd: regels.every((r) => r.klaar),
    })
  }
  return uit
}

async function regelsVanOrder(
  db: Db, projectId: string, artikelId: string, offerteRegelId: string, aantal: number,
): Promise<OrderMateriaal['regels']> {
  let alles: Awaited<ReturnType<typeof materialenVanArtikel>>
  try {
    alles = await materialenVanArtikel(db, artikelId)
  } catch (e) {
    // Artikel weg of zonder materiaal in het recept: dan is er niets uit voorraad nodig.
    if (e instanceof AppError) return []
    throw e
  }
  if (alles.regels.length === 0) return []
  const dekking = await dekkingVanOrderRegel(db,
    { projectId, offerteRegelId, artikelId }, alles.regels.map((r) => r.regelId), aantal)
  return alles.regels.map((m, i) => ({
    naam: m.naam, materiaal: m.omschrijving, fout: m.fout,
    // Een regel die niet compleet is, valt niet te kiezen en ligt dus niet vast.
    klaar: !m.fout && !!dekking[i]?.klaar,
  }))
}

/** De orders uit `orderIds` waarvan het materiaal nog niet vastligt. */
export async function zonderMateriaal(db: Db, p: Project, orderIds: string[]): Promise<string[]> {
  const stand = await materiaalStand(db, p)
  return stand.filter((s) => orderIds.includes(s.orderId) && !s.vastgelegd).map((s) => s.orderId)
}
