import { useState } from 'react'
import { Modal, Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import { ApiFout } from '../../api/client'
import { meldFout } from '../../utils/fout-melding-toon'
import { MailRegelsTable } from './MailRegelsTable'
import { MailDebugPaneel } from './MailDebugPaneel'
import { relatiesApi } from '../../api/relaties'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { koppelMelding } from './mail-koppel-melding'
import type { MailKoppeling, Project, Relatie } from '@stockmanager/shared'
import {
  MAIL_INTENTS, mailAfzender, offerteReferentieUitMail, type MailImport, type MailIntent,
} from '@stockmanager/shared'

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
  /** Om te zien of de offerte nog leeg is: alleen dan worden de regels overgenomen. */
  project: Project
  onClose: () => void
  /** Gekoppeld: de server gaf het bijgewerkte project en de mail terug. */
  onLinked: (koppeling: MailKoppeling) => void
  /**
   * De koppeling met het project is verbroken. Apart van `onLinked`, want bij
   * koppelen krijgt het project klant, referentie en levertijd — bij
   * loskoppelen hoort er juist niets aan het project te veranderen.
   */
  onUnlinked: (mailImport: MailImport) => void
}

const INTENT_LABELS: Record<MailIntent, string> = {
  offerteaanvraag: 'Offerteaanvraag',
  opdrachtbevestiging: 'Opdrachtbevestiging',
  onbekend: 'Nog onbekend',
}

export function MailImportReview({
  opened, mailImport, projectId, relaties, articleOptions, project, onClose, onLinked, onUnlinked,
}: Props) {
  const [relatieId, setRelatieId] = useState<string | null>(mailImport.relatieId ?? project.relatieId)
  const [contactId, setContactId] = useState<string | null>(mailImport.contactId)
  const [intent, setIntent] = useState<MailIntent>(mailImport.intent)
  const [current, setCurrent] = useState<MailImport>(mailImport)
  const [busy, setBusy] = useState(false)
  // Een klant die hier net is aangemaakt: de lijst van het project kent hem pas
  // na verversen, en een Select toont geen waarde die niet in zijn lijst staat.
  const [nieuweKlant, setNieuweKlant] = useState<Relatie | null>(null)
  const alleRelaties = nieuweKlant && !relaties.some((r) => r.id === nieuweKlant.id)
    ? [...relaties, nieuweKlant]
    : relaties

  const relatieOptions = alleRelaties
    .filter((r) => r.type !== 'leverancier')
    .map((r) => ({ value: r.id, label: r.naam }))
  const gekozenRelatie = alleRelaties.find((r) => r.id === relatieId) ?? null
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

  /**
   * Koppelen, en bij een lege offerte de regels overnemen. Eén verzoek: de
   * server doet het in één transactie, dus het staat er helemaal of niet.
   */
  async function link() {
    if (!relatieId) return
    setBusy(true)
    try {
      const koppeling = await mailImportsApi.koppel(current.id, { projectId, relatieId, contactId, intent })
      notifications.show(koppelMelding(koppeling))
      onLinked(koppeling)
      onClose()
    } catch (fout) {
      meldFout({
        actie: overTeNemen > 0 && offerteIsLeeg ? 'Mail koppelen en regels overnemen' : 'Mail koppelen aan project',
        fout,
        gevolg:
          fout instanceof ApiFout && fout.code === 'TIMEOUT'
            ? 'Onbekend of het gelukt is: de server antwoordde niet op tijd. Sluit dit venster en ververs de pagina om te zien of de regels op de offerte staan.'
            : 'Er is niets gekoppeld: het project, de offerte en de artikelen zijn niet veranderd.',
      })
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
      const vers = await mailImportsApi.reread(current.id)
      setCurrent(vers)
      // Lukt het model niet, dan antwoordt de server gewoon 200 met de reden in
      // het rapport. Groen zou dan "gelukt" zeggen boven "niets uitgelezen".
      const mislukt = vers.extractie?.foutmelding ?? null
      notifications.show(
        mislukt
          ? { color: 'orange', title: 'Opnieuw uitgelezen, maar er kwam niets uit', message: mislukt }
          : { color: 'green', title: 'Opnieuw uitgelezen', message: 'De mail is vers bekeken.' }
      )
    } catch (fout) {
      meldFout({
        actie: 'Mail opnieuw uitlezen',
        fout,
        gevolg:
          fout instanceof ApiFout && fout.code === 'TIMEOUT'
            ? 'Onbekend: de server kan nog aan het lezen zijn. Sluit deze mail over een minuut en open hem opnieuw om de uitkomst te zien.'
            : 'Er is niets veranderd: de vorige uitkomst staat er nog.',
      })
    } finally {
      setBusy(false)
    }
  }

  /**
   * De tekeningen alsnog aan de al bestaande artikelen hangen.
   *
   * Voor een mail die al gekoppeld is: opnieuw uitlezen kan dan niet (dat gooit
   * de regels weg die de offerte al heeft overgenomen) en opnieuw slepen ook
   * niet. Dit raakt alleen de bijlagen van de artikelen.
   */
  async function tekeningenAlsnog() {
    setBusy(true)
    try {
      const r = await mailImportsApi.tekeningenNaarArtikelen(current.id)
      setCurrent(r.mailImport)
      const totaal = r.artikelen.reduce((n, a) => n + a.toegevoegd, 0)
      notifications.show({
        color: totaal > 0 ? 'green' : r.overgeslagen.length > 0 ? 'red' : 'orange',
        title: totaal > 0
          ? `${totaal} tekening${totaal === 1 ? '' : 'en'} gekoppeld`
          : 'Geen tekening toegevoegd',
        message: [
          totaal > 0
            ? `Verdeeld over ${r.artikelen.length} artikel${r.artikelen.length === 1 ? '' : 'en'}.`
            : 'De artikelen hadden ze al, of er hing geen bestand aan deze regels.',
          r.overgeslagen.length > 0
            ? `Niet gelukt: ${r.overgeslagen.map((o) => `${o.naam} (${o.reden})`).join(', ')}.`
            : null,
        ].filter(Boolean).join(' '),
      })
    } catch (fout) {
      meldFout({
        actie: 'Tekeningen alsnog koppelen',
        fout,
        gevolg: 'Mogelijk hangt een deel van de tekeningen al aan de artikelen. Nog eens proberen voegt niets dubbel toe.',
      })
    } finally {
      setBusy(false)
    }
  }

  /**
   * De mail losmaken van het project.
   *
   * Bestond niet, terwijl twee foutmeldingen er wél naar verwezen ("maak die
   * koppeling eerst ongedaan") — een doodlopende weg: opnieuw uitlezen werd
   * geweigerd, verwijderen ook, en de knop om het op te lossen was er niet.
   *
   * Wat dit NIET doet: het project, de offerte en de artikelen blijven staan,
   * inclusief regels die al zijn overgenomen. Alleen de mail hoort er niet meer
   * bij. Dat staat ook in de bevestiging, want "loskoppelen" klinkt gevaarlijker
   * dan het is en het omgekeerde misverstand is nog erger.
   */
  async function ontkoppel() {
    if (
      !window.confirm(
        'De mail losmaken van dit project?\n\n' +
          'Het project, de offerte en de artikelen blijven staan — ook regels die al zijn ' +
          'overgenomen. Alleen de koppeling met deze mail gaat weg, zodat je hem opnieuw kunt ' +
          'laten uitlezen of aan een ander project kunt hangen.'
      )
    ) {
      return
    }
    setBusy(true)
    try {
      // Terug naar 'nieuw': koppelen zette hem op 'verwerkt', en een mail die
      // nergens meer bij hoort is niet verwerkt.
      const saved = await mailImportsApi.update(current.id, { projectId: null, status: 'nieuw' })
      setCurrent(saved)
      onUnlinked(saved)
      notifications.show({
        color: 'green',
        title: 'Losgekoppeld',
        message: 'De mail hoort niet meer bij dit project. Het project zelf is niet veranderd.',
      })
    } catch (fout) {
      meldFout({ actie: 'Mail loskoppelen van project', fout, gevolg: 'De mail hoort nog bij dit project; er is niets veranderd.' })
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
    } catch (fout) {
      meldFout({ actie: 'Mail negeren', fout, gevolg: 'De mail staat nog zoals hij stond.' })
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
    let aangemaakt: string | null = null
    try {
      // `aanmaken`, niet `create`: die valt bij een fout stil terug op een kopie
      // in deze browser, en dan wijst de mail naar een klant die de server niet kent.
      const data = await relatiesApi.aanmaken({
        naam: naam.trim(),
        type: 'klant',
        email: current.afzenderEmail,
        contacten: current.afzenderNaam
          ? [{ id: `c${Date.now()}`, naam: mailAfzender(current) ?? current.afzenderNaam, email: current.afzenderEmail }]
          : [],
      } as Parameters<typeof relatiesApi.aanmaken>[0])
      aangemaakt = data.naam
      setNieuweKlant(data)
      setRelatieId(data.id)
      setContactId(data.contacten[0]?.id ?? null)
      setCurrent(await mailImportsApi.update(current.id, { relatieId: data.id }))
      notifications.show({ color: 'green', message: `${data.naam} aangemaakt en gekoppeld.` })
    } catch (fout) {
      meldFout({
        actie: `Nieuwe klant "${naam.trim()}" aanmaken`,
        fout,
        gevolg: aangemaakt
          ? `${aangemaakt} is wél aangemaakt en gekozen, maar de regels zijn nog niet langs de artikelen van deze klant gelegd. Koppelen slaat de klant alsnog op.`
          : 'Er is geen klant aangemaakt.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      // Op een smal scherm knijpt 1180px terug tot de vensterbreedte en wordt
      // de regeltabel onleesbaar krap; zo houdt hij altijd wat lucht.
      size="min(1180px, 96vw)"
      centered
      title={current.onderwerp || 'Mail controleren'}
    >
      {/* Wie is de klant — de enige vraag die vóór alles beantwoord moet zijn. */}
      <div className="mi-card">
        <div className="mi-card-hd"><span className="title">Klant</span></div>
        <div className="mi-card-body mi-klantgrid">
          <div>
            <Select
              size="sm"
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
                } catch (fout) {
                  meldFout({
                    actie: 'Klant van de mail wijzigen',
                    fout,
                    gevolg: 'De keuze staat op het scherm, maar de regels zijn niet opnieuw langs de artikelen van deze klant gelegd. Koppelen slaat de klant alsnog op.',
                  })
                }
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
            size="sm"
            label="Contact"
            placeholder={relatieId ? 'Kies een contact' : 'Kies eerst een klant'}
            data={contactOptions}
            value={contactId}
            onChange={setContactId}
            disabled={!relatieId}
            searchable
            clearable
          />
          {/* Wat er bij het koppelen in de kolom Referentie van de offerte komt
              (2026-10-28): het nummer van de klant, anders de mail zelf. */}
          <div
            className="mi-kerngetal"
            title={current.klantRef
              ? 'Het aanvraag- of ordernummer van de klant. Komt op de offerte en bij "Uw referentie" op het project.'
              : 'Geen nummer van de klant gevonden: de mail zelf wordt de referentie op de offerte.'}
          >
            <div className="k">Referentie op offerte</div>
            <div className="v mono">{offerteReferentieUitMail(current)}</div>
          </div>
          <div className="mi-kerngetal">
            <div className="k">Gevraagde levering</div>
            <div className="v">
              {current.leverdatum ? new Date(current.leverdatum).toLocaleDateString('nl-NL') : '—'}
            </div>
          </div>
          <Select
            size="sm"
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
        <button className="st-btn sm ghost" onClick={tekeningenAlsnog} disabled={busy}
          title="Hangt de tekeningen uit deze mail alsnog aan de artikelen die er al zijn. Raakt het project en de offerte niet aan.">
          Tekeningen alsnog koppelen
        </button>
        {current.projectId && (
          <button className="st-btn sm ghost" onClick={ontkoppel} disabled={busy}
            title="Maakt de mail los van dit project. Het project, de offerte en de artikelen blijven staan.">
            Loskoppelen van project
          </button>
        )}
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
