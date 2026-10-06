import type { Prisma } from '@prisma/client'
import {
  kgVanRegel, maatTekst, celVoor, celBronnenVoor, antwoordAlsPrijs, waaromNietKiezen,
  type BestelRegel, type BestelStatus, type BestelBron, type KeuzeInvoer, type VergelijkData, type Antwoord,
  type LeverancierPrijs,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'

/**
 * Inkoop (2026-10-06): bestelregels en de keuze van een leverancier. Zie de
 * rekenregels in `packages/shared/calc/bestelling.ts` — de vergelijking op het
 * scherm en de prijs die hier wordt vastgelegd komen uit dezelfde functies.
 */

type Db = typeof prisma | Prisma.TransactionClient
const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d))

export const REGEL_INCLUDE = {
  grade: true,
  profile: true,
  keuzeLeverancier: { select: { naam: true } },
  rawMaterial: { select: { exoot: true } },
  aanvragen: { include: { prijsaanvraag: { include: { leveranciers: { select: { verzondenOp: true } } } } } },
} as const
type Rij = Prisma.BestelRegelGetPayload<{ include: typeof REGEL_INCLUDE }>

/** Rijen naar het schermformaat, met project, klant en artikel erbij. */
export async function naarRegels(db: Db, rijen: Rij[]): Promise<BestelRegel[]> {
  const projectIds = [...new Set(rijen.map((r) => r.projectId).filter((x): x is string => !!x))]
  const artikelIds = [...new Set(rijen.map((r) => r.artikelId).filter((x): x is string => !!x))]
  const [projecten, artikelen] = await Promise.all([
    db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, naam: true, relatieId: true, levertijdDatum: true } }),
    db.article.findMany({ where: { id: { in: artikelIds } }, select: { id: true, naam: true } }),
  ])
  const relaties = await db.relatie.findMany({
    where: { id: { in: projecten.map((p) => p.relatieId).filter((x): x is string => !!x) } }, select: { id: true, naam: true },
  })
  const pr = new Map(projecten.map((p) => [p.id, p]))
  const ar = new Map(artikelen.map((a) => [a.id, a.naam]))
  const rel = new Map(relaties.map((r) => [r.id, r.naam]))

  return rijen.map((r) => {
    const dims = r.dimensions as Record<string, number>
    const maat = { dimensions: dims, lengteMm: Number(r.lengteMm), stuks: r.stuks, volumeFormula: r.profile.volumeFormula, densityKgM3: Number(r.grade.densityKgM3) }
    const p = r.projectId ? pr.get(r.projectId) : undefined
    const aanvragen = r.aanvragen
      .map((a) => {
        const op = a.prijsaanvraag.leveranciers.map((l) => l.verzondenOp).filter((d): d is Date => !!d).sort((x, y) => +y - +x)[0]
        return { id: a.prijsaanvraagId, verzondenOp: op ? op.toISOString() : null }
      })
      .sort((x, y) => (x.id < y.id ? 1 : -1))
    return {
      id: r.id, status: r.status as BestelStatus, bron: r.bron as BestelBron,
      gradeId: r.gradeId, profileId: r.profileId, dimensions: dims, lengteMm: maat.lengteMm, stuks: r.stuks,
      rawMaterialId: r.rawMaterialId, exoot: !!r.rawMaterial?.exoot,
      projectId: r.projectId, artikelId: r.artikelId, offerteRegelId: r.offerteRegelId, notitie: r.notitie,
      materiaal: `${r.grade.name} ${r.profile.name} ${maatTekst(r.profile.volumeFormula, dims)}`,
      gradeNaam: r.grade.name, profielNaam: r.profile.name,
      volumeFormula: r.profile.volumeFormula, densityKgM3: maat.densityKgM3,
      kg: kgVanRegel(maat),
      projectNaam: p?.naam ?? null,
      klantNaam: p?.relatieId ? (rel.get(p.relatieId) ?? null) : null,
      artikelNaam: r.artikelId ? (ar.get(r.artikelId) ?? null) : null,
      nodigVoor: p?.levertijdDatum ?? null,
      aanvragen,
      keuze: r.keuzeLeverancierId && r.keuzeBron && r.keuzeOp
        ? {
            leverancierId: r.keuzeLeverancierId, leverancierNaam: r.keuzeLeverancier?.naam ?? '—',
            bron: r.keuzeBron as 'prijslijst' | 'antwoord', antwoordId: r.keuzeAntwoordId,
            totaal: Number(r.keuzeTotaal ?? 0), uitleg: r.keuzeUitleg ?? '', levertijdDagen: r.keuzeLevertijdDagen,
            gekozenOp: r.keuzeOp.toISOString(), gekozenDoor: r.keuzeDoor,
          }
        : null,
      toegevoegdDoor: r.toegevoegdDoor,
      createdAt: r.createdAt.toISOString(),
    }
  })
}

export async function leesRegels(db: Db, where: Prisma.BestelRegelWhereInput): Promise<BestelRegel[]> {
  const rijen = await db.bestelRegel.findMany({ where, include: REGEL_INCLUDE, orderBy: { createdAt: 'desc' } })
  return naarRegels(db, rijen)
}

export async function leesRegel(db: Db, id: string): Promise<BestelRegel> {
  const [r] = await leesRegels(db, { id })
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Deze bestelregel bestaat niet (meer). Ververs de pagina.')
  return r
}

const dimsGelijk = (a: unknown, b: Record<string, number>) => {
  const x = a as Record<string, number>
  const k = Object.keys(b)
  return k.length > 0 && k.length === Object.keys(x ?? {}).length && k.every((s) => Number(x[s]) === Number(b[s]))
}

export const naarPrijs = (r: Prisma.LeverancierPrijsGetPayload<{ include: { leverancier: { select: { naam: true } } } }>): LeverancierPrijs => ({
  id: r.id, leverancierId: r.leverancierId, leverancierNaam: r.leverancier.naam,
  rawMaterialId: r.rawMaterialId, gradeId: r.gradeId, prijsSoort: r.prijsSoort as LeverancierPrijs['prijsSoort'],
  prijs: Number(r.prijs), zaagkostenPerSnede: num(r.zaagkostenPerSnede), minimumBedrag: num(r.minimumBedrag),
  levertijdDagen: r.levertijdDagen, notitie: r.notitie, bijgewerktDoor: r.bijgewerktDoor, updatedAt: r.updatedAt.toISOString(),
})

export const naarAntwoord = (a: Prisma.PrijsaanvraagAntwoordGetPayload<object>): Antwoord => ({
  id: a.id, prijsaanvraagId: a.prijsaanvraagId, bestelRegelId: a.bestelRegelId, leverancierId: a.leverancierId,
  prijsSoort: a.prijsSoort as Antwoord['prijsSoort'], prijs: Number(a.prijs), zaagkostenPerSnede: num(a.zaagkostenPerSnede),
  levertijdDagen: a.levertijdDagen, notitie: a.notitie, bijgewerktDoor: a.bijgewerktDoor, updatedAt: a.updatedAt.toISOString(),
})

/** Alles voor de vergelijking van deze regels: prijslijst, antwoorden, wie er gevraagd is. */
export async function vergelijkData(db: Db, regelIds: string[]): Promise<VergelijkData> {
  const regels = await leesRegels(db, { id: { in: regelIds } })
  const kandidaten = await db.rawMaterial.findMany({
    where: { OR: regels.map((r) => ({ gradeId: r.gradeId, profileId: r.profileId })) },
    select: { id: true, gradeId: true, profileId: true, dimensions: true },
  })
  const gelijk: Record<string, string[]> = {}
  for (const r of regels) {
    gelijk[r.id] = kandidaten
      .filter((m) => m.gradeId === r.gradeId && m.profileId === r.profileId && dimsGelijk(m.dimensions, r.dimensions))
      .map((m) => m.id)
  }
  const materiaalIds = [...new Set(Object.values(gelijk).flat().concat(regels.map((r) => r.rawMaterialId).filter((x): x is string => !!x)))]
  const [prijzen, antwoorden, gevraagdRijen] = await Promise.all([
    db.leverancierPrijs.findMany({
      where: { OR: [{ gradeId: { in: [...new Set(regels.map((r) => r.gradeId))] } }, { rawMaterialId: { in: materiaalIds } }] },
      include: { leverancier: { select: { naam: true } } },
    }),
    db.prijsaanvraagAntwoord.findMany({ where: { bestelRegelId: { in: regelIds } } }),
    db.prijsaanvraagRegel.findMany({
      where: { bestelRegelId: { in: regelIds } },
      include: { prijsaanvraag: { include: { leveranciers: { select: { leverancierId: true } } } } },
      orderBy: { prijsaanvraagId: 'desc' },
    }),
  ])
  const gevraagd: VergelijkData['gevraagd'] = {}
  for (const g of gevraagdRijen) {
    const perLev = (gevraagd[g.bestelRegelId] ??= {})
    for (const l of g.prijsaanvraag.leveranciers) (perLev[l.leverancierId] ??= []).push(g.prijsaanvraagId)
  }
  const levIds = new Set([...prijzen.map((p) => p.leverancierId), ...gevraagdRijen.flatMap((g) => g.prijsaanvraag.leveranciers.map((l) => l.leverancierId))])
  const leveranciers = await db.relatie.findMany({ where: { id: { in: [...levIds] } }, select: { id: true, naam: true }, orderBy: { naam: 'asc' } })
  return { regels, leveranciers, prijzen: prijzen.map(naarPrijs), antwoorden: antwoorden.map(naarAntwoord), gelijk, gevraagd }
}

/**
 * Een leverancier kiezen voor een regel. De server rekent de prijs zelf uit
 * met dezelfde regels als het scherm, en legt hem vast zoals hij nu is.
 */
export async function kies(regelId: string, invoer: KeuzeInvoer, door: string) {
  return prisma.$transaction(async (tx) => {
    const v = await vergelijkData(tx, [regelId])
    const regel = v.regels[0]
    if (!regel) throw new AppError(404, 'NOT_FOUND', 'Deze bestelregel bestaat niet (meer). Ververs de pagina.')
    const cel = celVoor(regel, invoer.leverancierId, celBronnenVoor(v, regel))
    const reden = waaromNietKiezen(regel, cel)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    if (cel.soort !== 'prijs') throw new AppError(409, 'VOORWAARDE', 'Er is nog geen prijs van deze leverancier.')
    if (cel.bron !== invoer.bron || (invoer.antwoordId && cel.antwoordId !== invoer.antwoordId)) {
      throw new AppError(409, 'VOORWAARDE', 'De prijs van deze leverancier is intussen veranderd. Ververs de vergelijking en kies opnieuw.')
    }
    await tx.bestelRegel.update({
      where: { id: regelId },
      data: {
        keuzeLeverancierId: invoer.leverancierId, keuzeBron: cel.bron, keuzeAntwoordId: cel.antwoordId,
        keuzeTotaal: cel.totaal, keuzeUitleg: cel.uitleg, keuzeLevertijdDagen: cel.levertijdDagen,
        keuzeOp: new Date(), keuzeDoor: door,
      },
    })

    let prijsBewaard: { gelukt: boolean; reden?: string } | null = null
    if (invoer.bewaarPrijs && cel.bron === 'antwoord' && cel.antwoordId) {
      const a = v.antwoorden.find((x) => x.id === cel.antwoordId)!
      const doel = antwoordAlsPrijs(a, regel)
      if ('reden' in doel) {
        prijsBewaard = { gelukt: false, reden: doel.reden }
      } else {
        // Een eigen prijs voor een materiaal van deze maat gaat in de vergelijking
        // voor de kwaliteitsprijs; werk dan díe bij, anders zie je er niets van.
        const bestaand = await tx.leverancierPrijs.findFirst({
          where: doel.rawMaterialId
            ? { leverancierId: a.leverancierId, rawMaterialId: doel.rawMaterialId }
            : { leverancierId: a.leverancierId, OR: [{ rawMaterialId: { in: v.gelijk[regel.id] ?? [] }, prijsSoort: 'per_kg' }, { gradeId: doel.gradeId }] },
          orderBy: { rawMaterialId: { sort: 'asc', nulls: 'last' } },
        })
        const data = {
          prijsSoort: doel.prijsSoort, prijs: doel.prijs, zaagkostenPerSnede: doel.zaagkostenPerSnede,
          levertijdDagen: doel.levertijdDagen, bijgewerktDoor: door,
          notitie: `Uit antwoord op ${a.prijsaanvraagId}`,
        }
        if (bestaand) await tx.leverancierPrijs.update({ where: { id: bestaand.id }, data })
        else await tx.leverancierPrijs.create({ data: { ...data, leverancierId: a.leverancierId, rawMaterialId: doel.rawMaterialId, gradeId: doel.gradeId } })
        prijsBewaard = { gelukt: true }
      }
    }
    return { regel: await leesRegel(tx, regelId), prijsBewaard }
  })
}

// ── Waar bestelregels vandaan komen ──

/**
 * Bij het omzetten naar een opdracht: per exoot in de calculatie van het
 * artikel een bestelregel. Stuks = ⌈orderaantal × aantal per stuk ÷ stuks uit
 * één exoot⌉. Nooit twee keer voor dezelfde orderregel en exoot.
 */
export async function exootRegelsBijOpdracht(
  db: Db, ctx: { projectId: string; regels: { id: string; artikelId: string | null; qty: number }[]; door: string },
): Promise<number> {
  const artikelIds = [...new Set(ctx.regels.map((r) => r.artikelId).filter((x): x is string => !!x))]
  if (artikelIds.length === 0) return 0
  const artikelen = await db.article.findMany({ where: { id: { in: artikelIds } }, select: { id: true, estimate: true } })
  const nodesVan = new Map(artikelen.map((a) => [a.id, ((a.estimate as { nodes?: unknown[] } | null)?.nodes ?? []) as {
    type?: string; exoot?: boolean; rawMaterialId?: string | null; qty?: number; stuksUitEen?: number | null
  }[]]))
  const exootIds = [...new Set([...nodesVan.values()].flat().filter((n) => n.exoot && n.rawMaterialId).map((n) => n.rawMaterialId!))]
  if (exootIds.length === 0) return 0
  const exoten = new Map((await db.rawMaterial.findMany({ where: { id: { in: exootIds } } })).map((m) => [m.id, m]))
  const bestaand = await db.bestelRegel.findMany({
    where: { projectId: ctx.projectId, offerteRegelId: { in: ctx.regels.map((r) => r.id) }, rawMaterialId: { in: exootIds } },
    select: { offerteRegelId: true, rawMaterialId: true },
  })
  const al = new Set(bestaand.map((b) => `${b.offerteRegelId}|${b.rawMaterialId}`))
  let n = 0
  for (const regel of ctx.regels) {
    for (const node of (regel.artikelId ? nodesVan.get(regel.artikelId) : undefined) ?? []) {
      const m = node.exoot && node.rawMaterialId ? exoten.get(node.rawMaterialId) : undefined
      if (!m || al.has(`${regel.id}|${m.id}`)) continue
      const perExoot = Math.max(1, Math.floor(node.stuksUitEen ?? 1) || 1)
      await db.bestelRegel.create({
        data: {
          bron: 'opdracht_exoot', gradeId: m.gradeId, profileId: m.profileId, dimensions: m.dimensions as object,
          lengteMm: m.lengthMm, stuks: Math.ceil((regel.qty * (node.qty ?? 1)) / perExoot), rawMaterialId: m.id,
          projectId: ctx.projectId, artikelId: regel.artikelId, offerteRegelId: regel.id, toegevoegdDoor: ctx.door,
        },
      })
      n++
    }
  }
  return n
}

/**
 * Een tekort uit de materiaalselectie: één stuk van de lengte die ontbreekt,
 * naar het recept van het artikel. Lengte en stuks zijn daarna aan te passen.
 */
export async function tekortRegel(
  db: Db, ctx: { projectId: string; artikelId: string; offerteRegelId: string | null; tekortMm: number; door: string },
): Promise<string | null> {
  const artikel = await db.article.findUnique({ where: { id: ctx.artikelId }, select: { recipe: true } })
  const recept = artikel?.recipe as { gradeId?: string; profileId?: string; dimensions?: Record<string, number> } | null
  if (!recept?.gradeId || !recept.profileId || !recept.dimensions || ctx.tekortMm <= 0) return null
  const open = await db.bestelRegel.findFirst({
    where: { bron: 'tekort', projectId: ctx.projectId, artikelId: ctx.artikelId, status: 'te_bestellen' }, select: { id: true },
  })
  if (open) return null
  const r = await db.bestelRegel.create({
    data: {
      bron: 'tekort', gradeId: recept.gradeId, profileId: recept.profileId, dimensions: recept.dimensions,
      lengteMm: Math.ceil(ctx.tekortMm), stuks: 1, projectId: ctx.projectId, artikelId: ctx.artikelId,
      offerteRegelId: ctx.offerteRegelId, toegevoegdDoor: ctx.door,
    },
  })
  return r.id
}
