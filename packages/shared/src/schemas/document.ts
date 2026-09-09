import { z } from 'zod'

// Eén regel op de documentenpagina: offertes, opdrachtbevestigingen,
// paklijsten en facturen door elkaar, zodat je op nummer kunt zoeken zonder te
// weten bij welk project het hoort. Zie punt 2 in
// features/61-orderproces-backlog.md.

export const DOCUMENT_SOORTEN = ['offerte', 'opdrachtbevestiging', 'paklijst', 'factuur'] as const
export type DocumentSoort = typeof DOCUMENT_SOORTEN[number]

export const DOCUMENT_SOORT_LABEL: Record<DocumentSoort, string> = {
  offerte: 'Offerte',
  opdrachtbevestiging: 'Opdrachtbevestiging',
  paklijst: 'Paklijst',
  factuur: 'Factuur',
}

export const DocumentRegelSchema = z.object({
  id: z.string(),                       // OFF-2026-001, PL-2026-004, …
  soort: z.enum(DOCUMENT_SOORTEN),
  projectId: z.string(),
  projectNaam: z.string(),
  relatieId: z.string().nullable(),
  klantRef: z.string().nullable(),
  // De statuswaarde van het document zelf; die verschilt per soort (een
  // paklijst kent er geen en is 'verzonden' of 'open').
  status: z.string(),
  datum: z.string(),                    // aangemaakt, ISO
  verzondenOp: z.string().nullable(),
  // Exclusief btw. Een paklijst draagt geen bedrag.
  bedrag: z.number().nullable(),
  aantalRegels: z.number().int(),
})
export type DocumentRegel = z.infer<typeof DocumentRegelSchema>
