import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { IconMail } from '@tabler/icons-react'
import { mailReferentie, type MailImport, type MailKoppeling, type Project } from '@stockmanager/shared'
import { mailImportsApi } from '../../../../api/mail-imports'
import { relatiesApi } from '../../../../api/relaties'
import { articlesApi } from '../../../../api/articles'
import { projectsApi } from '../../../../api/projects'
import { meldFout } from '../../../../utils/fout-melding-toon'
import { MailDropzone } from '../../../../components/projecten/MailDropzone'
import { MailImportReview } from '../../../../components/projecten/MailImportReview'
import { Card } from './Card'

/** Voor het koppelen van mailregels aan artikelen (§3.5 van 60-mail-import). */
function artikelOpties() {
  return articlesApi
    .list()
    .map((a) => ({ value: a.id, label: a.tekening ? `${a.tekening} · ${a.naam}` : a.naam }))
}

/**
 * Mail-import op de Algemeen-tab (§5.1, punt 3).
 *
 * Hing eerder aan de oude projectpagina. Die is vervangen, en zonder deze
 * kaart zou een binnengekomen aanvraag nergens meer te koppelen zijn — de
 * hele leesroute uit `features/60-mail-import.md` was dan onbereikbaar.
 *
 * De dropzone verschijnt alleen op een project dat nog niets heeft: zodra er
 * een offerte ligt, is de aanvraag al verwerkt en zou een sleepvlak alleen
 * verwarren. Hangt er al een mail aan, dan staat er wáár het vandaan komt.
 *
 * Het lezen van de gekoppelde mail faalt stil: een project blijft bruikbaar als
 * de mail-route onbereikbaar is.
 */
export function MailImportKaart({
  project,
  geblokkeerd,
  onGewijzigd,
}: {
  project: Project
  geblokkeerd: boolean
  onGewijzigd: () => void
}) {
  const qc = useQueryClient()
  const [gekoppeld, setGekoppeld] = useState<MailImport | null>(null)
  const [review, setReview] = useState<MailImport | null>(null)

  // De server schreef project, offerte, artikelen en taken in één keer; hier
  // komt dat in de kopieën van deze browser.
  const naKoppelen = async ({ mailImport, project: nieuw, overname }: MailKoppeling) => {
    setGekoppeld(mailImport)
    projectsApi.vanServer(nieuw)
    onGewijzigd()
    qc.invalidateQueries({ queryKey: ['todos'] })
    const artikelen = overname?.nieuweArtikelen ?? []
    try {
      await Promise.all(artikelen.map((id) => articlesApi.haal(id)))
    } catch (fout) {
      meldFout({
        actie: 'Nieuwe artikelen ophalen',
        fout,
        gevolg: 'De artikelen staan op de server, maar nog niet in de lijst van deze browser. Ververs de pagina om ze te zien.',
      })
    }
  }

  useEffect(() => {
    let gestopt = false
    mailImportsApi
      .list({ projectId: project.id })
      .then((rows) => {
        if (!gestopt) setGekoppeld(rows[0] ?? null)
      })
      .catch(() => {})
    return () => {
      gestopt = true
    }
  }, [project.id])

  const toonDropzone = !geblokkeerd && !gekoppeld && project.offertes.length === 0
  if (!toonDropzone && !gekoppeld) return null

  return (
    <>
      <Card
        titel="Mail-import"
        teller={
          gekoppeld
            ? [gekoppeld.afzenderEmail, `${gekoppeld.bijlagen?.length ?? 0} bijlagen`]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        acties={
          gekoppeld ? (
            <button type="button" className="pdv2-btn s" onClick={() => setReview(gekoppeld)}>
              Regels bekijken
            </button>
          ) : undefined
        }
      >
        {gekoppeld ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11.5 }}>
            <IconMail size={14} style={{ color: 'var(--text3)', marginTop: 1 }} />
            <div>
              <div>
                Uit mail: <strong>{gekoppeld.onderwerp || '(geen onderwerp)'}</strong>
              </div>
              {/* Dezelfde regel die de offerte als referentie krijgt als de klant geen nummer noemt. */}
              <div className="mono" style={{ color: 'var(--text3)', marginTop: 2 }}>{mailReferentie(gekoppeld)}</div>
            </div>
          </div>
        ) : (
          <MailDropzone projectId={project.id} onImported={setReview} />
        )}
      </Card>

      {review && (
        <MailImportReview
          opened
          mailImport={review}
          projectId={project.id}
          relaties={relatiesApi.listSync()}
          articleOptions={artikelOpties()}
          project={project}
          onClose={() => setReview(null)}
          onUnlinked={() => {
            // Alleen de koppeling verdwijnt; aan het project zelf verandert
            // niets, dus relatie en ordergegevens blijven staan.
            setGekoppeld(null)
            onGewijzigd()
          }}
          onLinked={naKoppelen}
        />
      )}
    </>
  )
}
