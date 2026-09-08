import { useState } from 'react'
import { Modal, Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import { MailRegelsTable } from './MailRegelsTable'
import { MailDebugPaneel } from './MailDebugPaneel'
import { relatiesApi } from '../../api/relaties'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { neemRegelsOver } from './mail-naar-offerte'
import type { Project, Relatie } from '@stockmanager/shared'
import { MAIL_INTENTS, type MailImport, type MailIntent } from '@stockmanager/shared'

/**
 * Controlescherm — features/60-mail-import.md §3.7.
 *
 * De import stelt een relatie en een intent voor; hier bevestigt of corrigeert
 * een mens dat. Pas op "Koppelen" verandert er iets aan het project. Er gaat
 * nooit iets naar de klant zonder deze stap.
 */

interface Props {
  opened: boolean
  mailImport: MailImport
  projectId: string
  /** Volledige relaties: nodig voor de contactpersonen bij de gekozen klant. */
  relaties: Relatie[]
  articleOptions: { value: string; label: string }[]
  /** Nodig om de regels op de offerte te kunnen zetten. */
  project: Project
  onClose: () => void
  onLinked: (mailImport: MailImport, relatieId: string | null) => void
  onOfferteChanged: () => void
}

const INTENT_LABELS: Record<MailIntent, string> = {
  offerteaanvraag: 'Offerteaanvraag',
  opdrachtbevestiging: 'Opdrachtbevestiging',
  onbekend: 'Nog onbekend',
}

export function MailImportReview({
  opened, mailImport, projectId, relaties, articleOptions, project, onClose, onLinked, onOfferteChanged,
}: Props) {
  const [relatieId, setRelatieId] = useState<string | null>(mailImport.relatieId)
  const [contactId, setContactId] = useState<string | null>(mailImport.contactId)
  const [intent, setIntent] = useState<MailIntent>(mailImport.intent)
  const [current, setCurrent] = useState<MailImport>(mailImport)
  const [busy, setBusy] = useState(false)

  const relatieOptions = relaties
    .filter((r) => r.type !== 'leverancier')
    .map((r) => ({ value: r.id, label: r.naam }))
  const gekozenRelatie = relaties.find((r) => r.id === relatieId) ?? null
  const contactOptions = (gekozenRelatie?.contacten ?? []).map((c) => ({
    value: c.id,
    label: [c.naam, c.functie].filter(Boolean).join(' · '),
  }))
  const bronnen = {
    grades: gradesApi.listSync(),
    profiles: profilesApi.listSync(),
    machines: machinesApi.listSync(),
  }

  // Al regels op de offerte? Dan niet nog eens overnemen — dat zou de offerte
  // stilletjes verdubbelen. De knop verdwijnt dan gewoon.
  const laatsteOfferte = project.offertes[project.offertes.length - 1]
  const offerteIsLeeg = !laatsteOfferte || laatsteOfferte.regels.length === 0
  const overTeNemen = current.kandidaten.length

  async function link() {
    setBusy(true)
    try {
      const saved = await mailImportsApi.update(current.id, {
        relatieId,
        contactId,
        intent,
        projectId,
        status: 'verwerkt',
      })

      if (overTeNemen > 0 && offerteIsLeeg) {
        const klantNaam = gekozenRelatie?.naam ?? null
        const r = await neemRegelsOver({ project, mailImport: saved, klantNaam })
        onOfferteChanged()

        const nieuw = r.nieuweArtikelen.length
        notifications.show({
          color: r.zonderPrijs > 0 ? 'orange' : 'green',
          title: `${r.aantalRegels} regel${r.aantalRegels === 1 ? '' : 's'} op offerte ${r.offerteId}`,
          message: [
            nieuw > 0
              ? `${nieuw} nieuw artikel${nieuw === 1 ? '' : 'en'} aangemaakt (${r.nieuweArtikelen.join(', ')}) met de meegestuurde tekeningen.`
              : null,
            r.zonderPrijs > 0
              ? `${r.zonderPrijs} regel(s) staan op € 0 — daar moet nog een calculatie onder.`
              : 'Prijzen komen uit de calculatie van het artikel.',
          ]
            .filter(Boolean)
            .join(' '),
        })
      }

      onLinked(saved, relatieId)
      onClose()
    } catch (err) {
      notifications.show({ color: 'red', title: 'Opslaan mislukt', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  /**
   * Opnieuw laten uitlezen. Waarschuwen als er al keuzes in staan: die gaan
   * weg, en dat is precies wat je soms wilt maar nooit per ongeluk.
   */
  async function reread() {
    const handmatig = current.kandidaten.filter((k) => k.handmatig).length
    if (
      handmatig > 0 &&
      !window.confirm(
        `Er ${handmatig === 1 ? 'staat 1 handmatige koppeling' : `staan ${handmatig} handmatige koppelingen`} in deze mail. ` +
          'Opnieuw uitlezen gooit die weg. Doorgaan?'
      )
    ) {
      return
    }
    setBusy(true)
    try {
      setCurrent(await mailImportsApi.reread(current.id))
      notifications.show({ color: 'green', title: 'Opnieuw uitgelezen', message: 'De mail is vers bekeken.' })
    } catch (err) {
      notifications.show({ color: 'red', title: 'Opnieuw uitlezen mislukt', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function ignore() {
    setBusy(true)
    try {
      await mailImportsApi.update(mailImport.id, { status: 'genegeerd' })
      notifications.show({ color: 'gray', message: 'Mail genegeerd.' })
      onClose()
    } catch (err) {
      notifications.show({ color: 'red', title: 'Opslaan mislukt', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }


  /**
   * De klant aanmaken die er nog niet is.
   *
   * Bij de eerste mail van een nieuwe klant liep je vast: koppelen is
   * geblokkeerd zonder relatie, en de relatie moest ergens anders aangemaakt
   * worden. Naam en adres van de afzender zijn hier al bekend, dus die vullen
   * we vast in — de rest doet de gebruiker later op de relatiepagina.
   */
  async function maakRelatie() {
    const naam = window.prompt(
      'Naam van de nieuwe klant:',
      current.afzenderNaam?.split('<')[0].trim() ||
        current.afzenderEmail?.split('@')[1]?.split('.')[0] ||
        ''
    )
    if (!naam?.trim()) return
    setBusy(true)
    try {
      const { data } = await relatiesApi.create({
        naam: naam.trim(),
        type: 'klant',
        email: current.afzenderEmail,
        contacten: current.afzenderNaam
          ? [{ id: `c${Date.now()}`, naam: current.afzenderNaam, email: current.afzenderEmail }]
          : [],
      } as Parameters<typeof relatiesApi.create>[0])
      setRelatieId(data.id)
      setContactId(data.contacten[0]?.id ?? null)
      setCurrent(await mailImportsApi.update(current.id, { relatieId: data.id }))
      notifications.show({ color: 'green', message: `${data.naam} aangemaakt en gekoppeld.` })
    } catch (err) {
      notifications.show({ color: 'red', title: 'Aanmaken mislukt', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="1180px"
      centered
      title={current.onderwerp || 'Mail controleren'}
    >
      {/* Wie is de klant — de enige vraag die vóór alles beantwoord moet zijn. */}
      <div className="mi-card">
        <div className="mi-card-hd"><span className="title">Klant</span></div>
        <div className="mi-card-body mi-klantgrid">
          <div>
            <Select
              size="xs"
              label="Klant"
              placeholder="Kies een klant"
              data={relatieOptions}
              value={relatieId}
              onChange={async (v) => {
                setRelatieId(v)
                setContactId(null)
                try {
                  // Andere klant = andere geleerde koppelingen, dus de server
                  // legt de regels opnieuw langs de artikelen.
                  setCurrent(await mailImportsApi.update(current.id, { relatieId: v }))
                } catch { /* de keuze blijft staan; koppelen slaat hem opnieuw op */ }
              }}
              searchable
              clearable
            />
            {!relatieId && (
              <button className="st-btn sm ghost" style={{ marginTop: 6 }} onClick={maakRelatie} disabled={busy}>
                <IconPlus size={13} /> Nieuwe klant aanmaken
              </button>
            )}
          </div>
          <Select
            size="xs"
            label="Contact"
            placeholder={relatieId ? 'Kies een contact' : 'Kies eerst een klant'}
            data={contactOptions}
            value={contactId}
            onChange={setContactId}
            disabled={!relatieId}
            searchable
            clearable
          />
          <div className="mi-kerngetal">
            <div className="k">Referentie klant</div>
            <div className="v mono">{current.klantRef ?? '—'}</div>
          </div>
          <div className="mi-kerngetal">
            <div className="k">Gevraagde levering</div>
            <div className="v">
              {current.leverdatum ? new Date(current.leverdatum).toLocaleDateString('nl-NL') : '—'}
            </div>
          </div>
          <Select
            size="xs"
            label="Soort bericht"
            data={MAIL_INTENTS.map((i) => ({ value: i, label: INTENT_LABELS[i] }))}
            value={intent}
            onChange={(v) => setIntent((v as MailIntent) ?? 'onbekend')}
          />
        </div>
      </div>

      <MailRegelsTable
        mailImport={current}
        articleOptions={articleOptions}
        bronnen={bronnen}
        onChanged={setCurrent}
      />

      <MailDebugPaneel mailImport={current} />

      {overTeNemen > 0 && !offerteIsLeeg && (
        <div className="mi-alarm" style={{ marginBottom: 10 }}>
          <IconAlertTriangle size={14} />
          <span>De offerte heeft al regels — deze mailregels worden niet nog eens toegevoegd.</span>
        </div>
      )}

      <div className="mi-acties">
        <button className="st-btn sm ghost" onClick={reread} disabled={busy}
          title="Laat de AI opnieuw naar deze mail kijken. Kost een nieuwe aanroep van het model.">
          Opnieuw uitlezen
        </button>
        <button className="st-btn sm ghost" onClick={ignore} disabled={busy}>Negeren</button>
        <button className="st-btn primary sm" onClick={link} disabled={busy || !relatieId}>
          {busy
            ? 'Bezig…'
            : overTeNemen > 0 && offerteIsLeeg
            ? `Koppelen en ${overTeNemen} regel${overTeNemen === 1 ? '' : 's'} overnemen`
            : 'Koppelen aan project'}
        </button>
      </div>
    </Modal>
  )
}
