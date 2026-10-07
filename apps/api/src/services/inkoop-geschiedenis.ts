import { prijsVanAntwoord, kgVanRegel, type GeschiedenisItem } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'

/**
 * De geschiedenis van één bestelregel (2026-10-07), opgebouwd uit wat er al
 * ligt: aanvragen, antwoorden, keuze, inkooporders en ontvangsten. Er is geen
 * apart logboek, dus hij kan niet uit de pas lopen met de gegevens zelf.
 */

const BRON: Record<string, string> = {
  opdracht_exoot: 'exoot bij de opdracht',
  tekort: 'tekort uit de materiaalselectie',
  handmatig: 'met de hand',
  lage_voorraad: 'lage voorraad',
}

const dd = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`

export async function geschiedenis(regelId: string): Promise<GeschiedenisItem[]> {
  const r = await prisma.bestelRegel.findUnique({
    where: { id: regelId },
    include: {
      grade: true, profile: true, keuzeLeverancier: { select: { naam: true } },
      aanvragen: { include: { prijsaanvraag: { include: { leveranciers: { include: { leverancier: { select: { naam: true } } } } } } } },
      inkoopRegels: { include: { inkooporder: { include: { leverancier: { select: { naam: true } } } }, ontvangsten: true } },
    },
  })
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Deze bestelregel bestaat niet (meer). Ververs de pagina.')
  const antwoorden = await prisma.prijsaanvraagAntwoord.findMany({
    where: { bestelRegelId: regelId }, include: { leverancier: { select: { naam: true } } },
  })
  const kg = kgVanRegel({ dimensions: r.dimensions as Record<string, number>, lengteMm: Number(r.lengteMm), stuks: r.stuks, volumeFormula: r.profile.volumeFormula, densityKgM3: Number(r.grade.densityKgM3) })

  const uit: GeschiedenisItem[] = [
    { datum: r.createdAt.toISOString(), tekst: `Op de lijst — ${BRON[r.bron] ?? r.bron} (${r.toegevoegdDoor})`, document: null },
  ]
  for (const a of r.aanvragen) {
    // Per verzenddatum één regel: "bij Tata en Voestalpine".
    const perDag = new Map<string, string[]>()
    for (const l of a.prijsaanvraag.leveranciers) {
      if (!l.verzondenOp) continue
      const k = l.verzondenOp.toISOString()
      perDag.set(k, [...(perDag.get(k) ?? []), l.leverancier.naam])
    }
    for (const [datum, namen] of perDag) uit.push({ datum, tekst: `Prijs gevraagd · ${a.prijsaanvraagId} bij ${namen.join(' en ')}`, document: a.prijsaanvraagId })
  }
  for (const a of antwoorden) {
    const p = prijsVanAntwoord({ prijsSoort: a.prijsSoort as 'per_kg', prijs: Number(a.prijs), zaagkostenPerSnede: a.zaagkostenPerSnede == null ? null : Number(a.zaagkostenPerSnede) }, { stuks: r.stuks, kg, gradeId: r.gradeId, rawMaterialId: r.rawMaterialId })
    uit.push({
      datum: a.updatedAt.toISOString(),
      tekst: `Antwoord ${a.leverancier.naam}: ${p.uitleg}${a.levertijdDagen != null ? `, ${a.levertijdDagen} werkdagen` : ''}`,
      document: null,
    })
  }
  if (r.keuzeOp && r.keuzeLeverancier) {
    const auto = r.keuzeDoor?.endsWith(' (goedkoopste)')
    const wie = auto ? r.keuzeDoor!.slice(0, -' (goedkoopste)'.length) : (r.keuzeDoor ?? '—')
    uit.push({ datum: r.keuzeOp.toISOString(), tekst: `Leverancier: ${r.keuzeLeverancier.naam}${auto ? ' — de goedkoopste, bij Bestellen' : ''} (${wie})`, document: null })
  }
  for (const ir of r.inkoopRegels) {
    const o = ir.inkooporder
    if (o.verzondenOp) uit.push({ datum: o.verzondenOp.toISOString(), tekst: `Besteld · ${o.id} bij ${o.leverancier.naam} (${o.verzondenDoor ?? '—'})`, document: o.id })
    else if (o.status === 'concept') uit.push({ datum: o.createdAt.toISOString(), tekst: `Klaargezet · ${o.id}, nog niet bevestigd als verstuurd`, document: o.id })
    if (ir.verwachtAangepastOp) {
      uit.push({
        datum: ir.verwachtAangepastOp.toISOString(),
        tekst: ir.verwachtDatum ? `Leverdatum aangepast naar ${dd(ir.verwachtDatum)} (${ir.verwachtAangepastDoor ?? '—'})` : `Leverdatum terug naar de levertijd (${ir.verwachtAangepastDoor ?? '—'})`,
        document: null,
      })
    }
    for (const ov of ir.ontvangsten) {
      const codes = (ov.codes as string[]).join(', ')
      uit.push({ datum: ov.createdAt.toISOString(), tekst: `Binnen: ${ov.stuks} st${codes ? ` (${codes})` : ''}${ov.gereserveerdVoor ? `, vast voor ${ov.gereserveerdVoor}` : ''} — ${ov.door}`, document: null })
    }
    if (o.vervallenOp) uit.push({ datum: o.vervallenOp.toISOString(), tekst: `Ingetrokken · ${o.id}: ${o.vervallenReden ?? ''} (${o.vervallenDoor ?? '—'})`, document: o.id })
  }
  return uit.sort((a, b) => (a.datum < b.datum ? -1 : 1))
}
