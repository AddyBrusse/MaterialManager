import { Router } from 'express'
import { prisma } from '../db/client'
import { DOCUMENT_SOORTEN, type DocumentRegel, type DocumentSoort } from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'

// Alle projectdocumenten in één platte lijst. Kan pas sinds de documenten eigen
// tabellen hebben (beslissing 2026-09-09): hiervoor had dit betekend dat elke
// projectrij met al zijn JSONB opgehaald en in geheugen platgeslagen moest
// worden. Nu is het vier gerichte queries.
const router = Router()

// Het project waar het document bij hoort, voor de klant- en naamkolom.
const projectSelect = { select: { naam: true, relatieId: true, klantRef: true } }

function som(regels: { totaal: number }[]): number {
  return Math.round(regels.reduce((s, r) => s + r.totaal, 0) * 100) / 100
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const gevraagd = String(req.query.soort ?? '')
    const wil = (s: DocumentSoort) =>
      !gevraagd || !(DOCUMENT_SOORTEN as readonly string[]).includes(gevraagd) || gevraagd === s

    const [offertes, obs, paklijsten, facturen] = await Promise.all([
      wil('offerte')
        ? prisma.offerte.findMany({
            include: { project: projectSelect, regels: { select: { totaal: true } } },
          })
        : [],
      wil('opdrachtbevestiging')
        ? prisma.opdrachtbevestiging.findMany({
            include: { project: projectSelect, regels: { select: { totaal: true } } },
          })
        : [],
      wil('paklijst')
        ? prisma.paklijst.findMany({
            include: { project: projectSelect, regels: { select: { id: true } } },
          })
        : [],
      wil('factuur')
        ? prisma.factuur.findMany({
            include: { project: projectSelect, regels: { select: { id: true } } },
          })
        : [],
    ])

    const regels: DocumentRegel[] = [
      ...offertes.map(o => ({
        id: o.id,
        soort: 'offerte' as const,
        projectId: o.projectId,
        projectNaam: o.project.naam,
        relatieId: o.project.relatieId,
        klantRef: o.project.klantRef,
        status: o.status,
        datum: o.createdAt.toISOString(),
        verzondenOp: o.verzondenOp,
        bedrag: som(o.regels),
        aantalRegels: o.regels.length,
      })),
      ...obs.map(o => ({
        id: o.id,
        soort: 'opdrachtbevestiging' as const,
        projectId: o.projectId,
        projectNaam: o.project.naam,
        relatieId: o.project.relatieId,
        klantRef: o.project.klantRef,
        status: o.status,
        datum: o.createdAt.toISOString(),
        verzondenOp: o.verzondenOp,
        bedrag: som(o.regels),
        aantalRegels: o.regels.length,
      })),
      // Een paklijst heeft geen eigen statusveld: hij is verstuurd of niet.
      ...paklijsten.map(l => ({
        id: l.id,
        soort: 'paklijst' as const,
        projectId: l.projectId,
        projectNaam: l.project.naam,
        relatieId: l.project.relatieId,
        klantRef: l.project.klantRef,
        status: l.verzondenOp ? 'verzonden' : 'open',
        datum: l.createdAt.toISOString(),
        verzondenOp: l.verzondenOp,
        bedrag: null,
        aantalRegels: l.regels.length,
      })),
      ...facturen.map(f => ({
        id: f.id,
        soort: 'factuur' as const,
        projectId: f.projectId,
        projectNaam: f.project.naam,
        relatieId: f.project.relatieId,
        klantRef: f.project.klantRef,
        status: f.verzondenOp ? 'verzonden' : 'concept',
        datum: f.createdAt.toISOString(),
        verzondenOp: f.verzondenOp,
        bedrag: f.subtotaal,
        aantalRegels: f.regels.length,
      })),
    ]

    regels.sort((a, b) => b.datum.localeCompare(a.datum))
    res.json({ data: regels })
  }),
)

export default router
