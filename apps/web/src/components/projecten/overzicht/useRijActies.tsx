import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { waaromNietProjectVerwijderen, type Project } from '@stockmanager/shared'
import { projectsApi, wachtOpOpslag } from '../../../api/projects'
import { meldFout } from '../../../utils/fout-melding-toon'
import { Weigering } from '../../../utils/fout-melding'
import { ApiFout } from '../../../api/client'

type Stop = 'on_hold' | 'geannuleerd'

const stilgezet = (p: Project) => p.status === 'on_hold' || p.status === 'geannuleerd'
/** Wie het al is, slaan we over: de server weigert "al on hold" met een 409. */
const kanStoppen = (p: Project, s: Stop) => p.status !== s && !(s === 'on_hold' && p.status === 'geannuleerd')

export interface RijActies {
  nieuwProject: (voor?: Project) => void
  kopieerNummers: (ps: Project[]) => void
  stop: (ps: Project[], s: Stop) => void
  hervat: (ps: Project[]) => void
  verwijder: (ps: Project[]) => void
  kanStoppen: typeof kanStoppen
  stilgezet: typeof stilgezet
  /** De vensters (reden, bevestigen); ergens op de pagina renderen. */
  dialoog: ReactNode
}

/**
 * Wat het rechtermuisknopmenu en het ⋯-menu met één of meer projecten doen
 * (2026-10-05). Elke handeling meldt pas groen als de server het bevestigd
 * heeft (`wachtOpOpslag`), en een fout volgens de afspraak: wat, waar, gevolg.
 */
export function useRijActies(onVerwijderd: (ids: string[]) => void): RijActies {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [stopVraag, setStopVraag] = useState<{ ps: Project[]; s: Stop } | null>(null)
  const [reden, setReden] = useState('')
  const [weg, setWeg] = useState<{ mag: Project[]; niet: { p: Project; reden: string }[] } | null>(null)
  const [bezig, setBezig] = useState(false)

  const ververs = () => qc.invalidateQueries({ queryKey: ['projects'] })

  /** Groen als alles bevestigd is; de fouten zelf meldt syncProject al. */
  const naOpslaan = async (ids: string[], gelukt: string) => {
    ververs()
    const ok = await Promise.all(ids.map((id) => wachtOpOpslag(id)))
    ververs()
    const n = ok.filter(Boolean).length
    if (n === ids.length) notifications.show({ color: 'green', message: gelukt })
    else if (n > 0) notifications.show({ color: 'orange', message: `${n} van ${ids.length} gelukt; zie de rode melding voor de rest.` })
  }

  // Wacht op de server: die geeft het projectnummer (per jaar, 2026-10-05).
  const nieuwProject = (voor?: Project) => {
    projectsApi.create({
      naam: 'Nieuw project', relatieId: voor?.relatieId ?? null, contactId: voor?.contactId ?? null,
      klantRef: null, levertijdDatum: null, notities: '',
    }).then(
      (p) => {
        ververs()
        navigate(`/projecten/${p.id}`)
      },
      (fout) => meldFout({
        actie: 'Nieuw project aanmaken',
        fout,
        gevolg: fout instanceof ApiFout && fout.code === 'TIMEOUT'
          ? 'Onbekend of het project is aangemaakt: de server antwoordde niet op tijd. Ververs de lijst voor je het opnieuw doet.'
          : 'Er is geen project aangemaakt. Probeer het opnieuw.',
      }),
    )
  }

  const kopieerNummers = (ps: Project[]) => {
    const tekst = ps.map((p) => p.id).join('\n')
    kopieer(tekst).then(
      () => notifications.show({ color: 'green', message: ps.length === 1 ? `${ps[0].id} gekopieerd` : `${ps.length} projectnummers gekopieerd` }),
      (fout) => meldFout({ actie: 'Projectnummer kopiëren', fout, gevolg: `Er staat niets op het klembord. Het nummer is ${tekst.split('\n')[0]}${ps.length > 1 ? ' …' : ''}.` }),
    )
  }

  const stop = (ps: Project[], s: Stop) => {
    const doel = ps.filter((p) => kanStoppen(p, s))
    if (doel.length === 0) {
      meldFout({
        actie: s === 'on_hold' ? 'On hold zetten' : 'Annuleren',
        fout: new Weigering(ps.length === 1 ? `${ps[0].id} staat al ${s === 'on_hold' ? 'stil' : 'op geannuleerd'}.` : 'Alle geselecteerde projecten staan hier al.'),
        gevolg: 'Er is niets veranderd.',
      })
      return
    }
    setReden('')
    setStopVraag({ ps: doel, s })
  }

  const bevestigStop = () => {
    if (!stopVraag) return
    const { ps, s } = stopVraag
    setStopVraag(null)
    ps.forEach((p) => projectsApi.stopProject(p.id, s, reden.trim()))
    const wat = s === 'on_hold' ? 'on hold gezet' : 'geannuleerd'
    void naOpslaan(ps.map((p) => p.id), ps.length === 1 ? `${ps[0].id} ${wat}` : `${ps.length} projecten ${wat}`)
  }

  const hervat = (ps: Project[]) => {
    const doel = ps.filter(stilgezet)
    doel.forEach((p) => projectsApi.hervatProject(p.id))
    void naOpslaan(doel.map((p) => p.id), doel.length === 1 ? `${doel[0].id} hervat` : `${doel.length} projecten hervat`)
  }

  const verwijder = (ps: Project[]) => {
    const niet = ps.flatMap((p) => {
      const r = waaromNietProjectVerwijderen(p)
      return r ? [{ p, reden: r }] : []
    })
    const mag = ps.filter((p) => !niet.some((x) => x.p.id === p.id))
    // Eén project dat niet mag: meteen de oranje melding, geen venster ertussen.
    if (mag.length === 0 && niet.length === 1) {
      meldFout({ actie: `${niet[0].p.id} verwijderen`, fout: new Weigering(niet[0].reden), gevolg: 'Er is niets verwijderd.' })
      return
    }
    setWeg({ mag, niet })
  }

  const bevestigWeg = async () => {
    if (!weg) return
    setBezig(true)
    const uitslag = await Promise.allSettled(weg.mag.map((p) => projectsApi.remove(p.id)))
    setBezig(false)
    setWeg(null)
    const gelukt = weg.mag.filter((_, i) => uitslag[i].status === 'fulfilled').map((p) => p.id)
    uitslag.forEach((u, i) => {
      if (u.status === 'rejected') {
        meldFout({ actie: `${weg.mag[i].id} verwijderen`, fout: u.reason, gevolg: 'Dit project is niet verwijderd en staat nog in de lijst.' })
      }
    })
    onVerwijderd(gelukt)
    ververs()
    if (gelukt.length) notifications.show({ color: 'orange', message: gelukt.length === 1 ? `${gelukt[0]} verwijderd` : `${gelukt.length} projecten verwijderd` })
  }

  const dialoog = (
    <>
      <Modal
        opened={!!stopVraag}
        onClose={() => setStopVraag(null)}
        title={stopVraag?.s === 'on_hold' ? 'On hold zetten' : 'Annuleren'}
        size="sm"
      >
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {stopVraag && (stopVraag.ps.length === 1 ? `${stopVraag.ps[0].id} · ${stopVraag.ps[0].naam}` : `${stopVraag.ps.length} projecten`)}.
            {' '}De reden komt op de meldingsbalk van het project en blijft bewaard, ook na hervatten.
            Documenten en afgevinkte stappen blijven staan; het project gaat uit de planning.
          </Text>
          <Textarea
            size="xs" label="Reden" autosize minRows={2} data-autofocus
            value={reden} onChange={(e) => setReden(e.currentTarget.value)}
            error={reden.length > 0 && reden.trim().length < 3 ? 'Vul minstens 3 tekens in.' : undefined}
          />
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setStopVraag(null)}>Terug</Button>
            <Button size="xs" color={stopVraag?.s === 'geannuleerd' ? 'red' : undefined} disabled={reden.trim().length < 3} onClick={bevestigStop}>
              {stopVraag?.s === 'on_hold' ? 'On hold zetten' : 'Annuleren'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!weg} onClose={() => !bezig && setWeg(null)} title={weg && weg.mag.length + weg.niet.length === 1 ? 'Project verwijderen' : 'Projecten verwijderen'} size="md">
        {weg && (
          <Stack gap="xs">
            {weg.mag.length > 0 && (
              <>
                <Text size="xs">
                  {weg.mag.length === 1 ? 'Dit project gaat' : `Deze ${weg.mag.length} projecten gaan`} definitief weg, met
                  alles wat erin staat. Dat is niet terug te draaien.
                </Text>
                <ul className="prj-weg-lijst">
                  {weg.mag.map((p) => <li key={p.id}><b>{p.id}</b> · {p.naam}</li>)}
                </ul>
              </>
            )}
            {weg.niet.length > 0 && (
              <>
                <Text size="xs" c="orange.8" fw={500}>
                  {weg.niet.length === 1 ? 'Dit project blijft staan:' : `Deze ${weg.niet.length} blijven staan:`}
                </Text>
                <ul className="prj-weg-lijst niet">
                  {weg.niet.map(({ p, reden: r }) => (
                    <li key={p.id}><b>{p.id}</b> · {r.replace(/^Kan \S+ niet verwijderen: /, '').replace(/ Annuleer het project.*$/, '')}</li>
                  ))}
                </ul>
                <Text size="xs" c="dimmed">
                  Annuleer {weg.niet.length === 1 ? 'het' : 'ze'} in plaats van te verwijderen: dan blijft alles bewaard en
                  {weg.niet.length === 1 ? ' gaat het' : ' gaan ze'} uit de planning.
                </Text>
              </>
            )}
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="default" disabled={bezig} onClick={() => setWeg(null)}>
                {weg.mag.length ? 'Terug' : 'Sluiten'}
              </Button>
              {weg.mag.length > 0 && (
                <Button size="xs" color="red" loading={bezig} onClick={() => void bevestigWeg()}>
                  {weg.mag.length === 1 ? 'Verwijderen' : `${weg.mag.length} verwijderen`}
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )

  return { nieuwProject, kopieerNummers, stop, hervat, verwijder, kanStoppen, stilgezet, dialoog }
}

/**
 * Naar het klembord. `navigator.clipboard` bestaat alleen op https of
 * localhost — en de werkplekken openen de app via http://<ip>, dus daar valt
 * het terug op de oude manier.
 */
async function kopieer(tekst: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(tekst)
  const ta = document.createElement('textarea')
  ta.value = tekst
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  if (!ok) throw new Error('De browser liet het kopiëren niet toe.')
}
