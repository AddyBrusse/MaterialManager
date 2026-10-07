import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { waaromNietBestellen, type Inkooporder, type InkoopOverzicht, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { inkoopApi } from '../../../api/inkoop'
import { inkoopordersApi, INKOOP_SLEUTELS } from '../../../api/inkooporders'
import { useUserStore } from '../../../stores/user'
import { downloadEml } from '../../../services/eml'
import { meldFout } from '../../../utils/fout-melding-toon'
import { Weigering, eis } from '../../../utils/fout-melding'
import { inkooporderBestandsnaam, inkooporderMail } from '../lib/inkooporder-document'
import { eur } from '../bestellingen/bestel-tekst'
import { ddmm } from './tekst'

/** Wat je met een klaargezette (nog niet bevestigde) inkooporder doet. */
export interface ConceptActies {
  bevestig: (orderIds: string[]) => void
  opnieuw: (orderId: string) => void
  weg: (orderId: string) => void
}

/**
 * Bestellen in één keer (2026-10-07): per leverancier een inkooporder met de
 * mail erbij, en één vraag "Heb je ze verstuurd?" voor allemaal. Pas bij "Ja"
 * staan de regels als besteld. "Nog niet" laat ze klaarstaan op de pagina.
 */
export function useBestellen(ov: InkoopOverzicht | undefined) {
  const qc = useQueryClient()
  const gebruiker = useUserStore((s) => s.user)
  const [keuze, setKeuze] = useState<InkoopOverzichtRegel[] | null>(null)
  const [klaar, setKlaar] = useState<Inkooporder[] | null>(null)
  const ververs = () => { for (const k of INKOOP_SLEUTELS) qc.invalidateQueries({ queryKey: [k] }) }

  /** Zet de mails klaar; geeft terug welke niet lukten. */
  const mails = (orders: Inkooporder[]) => {
    const mis: string[] = []
    for (const o of orders) {
      try { downloadEml(inkooporderMail(o, gebruiker), inkooporderBestandsnaam(o).replace(/\.pdf$/, '.eml')) }
      catch (fout) { mis.push(o.id); meldFout({ actie: `Mail voor ${o.id} klaarzetten`, fout, gevolg: `${o.id} staat klaar op de pagina maar is niet gemaild. Gebruik daar "Mail opnieuw".` }) }
    }
    return mis
  }

  const bestel = useMutation({
    mutationFn: (regels: InkoopOverzichtRegel[]) => {
      eis(waaromNietBestellen(regels, ov?.leveranciers ?? []))
      return inkoopApi.bestellen(regels.map((r) => r.id))
    },
    onSuccess: (orders) => { ververs(); setKeuze(null); mails(orders); setKlaar(orders) },
    onError: (e) => meldFout({ actie: 'Bestellen', fout: e, gevolg: 'Er is geen inkooporder gemaakt en niets gemaild.' }),
  })
  const verzonden = useMutation({
    mutationFn: (ids: string[]) => inkoopApi.verzondenAlle(ids),
    onSuccess: (orders) => { ververs(); setKlaar(null); notifications.show({ color: 'green', message: `${orders.map((o) => o.id).join(', ')} staan als verstuurd; de regels zijn onderweg` }) },
    onError: (e) => meldFout({ actie: 'Inkooporders als verstuurd vastleggen', fout: e, gevolg: 'Ze staan nog klaar op de pagina; druk daar op "Ja, verstuurd" als ze echt de deur uit zijn.' }),
  })
  const weg = useMutation({
    mutationFn: (id: string) => inkoopordersApi.verwijder(id),
    onSuccess: (_d, id) => { ververs(); notifications.show({ color: 'green', message: `${id} is weggegooid; de regels staan weer te bestellen` }) },
    onError: (e, id) => meldFout({ actie: `${id} weggooien`, fout: e, gevolg: 'Hij staat er nog.' }),
  })

  const concept: ConceptActies = {
    bevestig: (ids) => verzonden.mutate(ids),
    weg: (id) => { if (window.confirm(`${id} weggooien? Hij is nog niet bevestigd als verstuurd. Heb je de mail wél verstuurd, laat het de leverancier dan weten.`)) weg.mutate(id) },
    opnieuw: async (id) => {
      try {
        const o = await qc.fetchQuery({ queryKey: ['inkooporders'], queryFn: inkoopordersApi.list }).then((l) => l.find((x) => x.id === id))
        if (!o) throw new Weigering(`${id} bestaat niet meer. Ververs de pagina.`)
        if (mails([o]).length === 0) setKlaar([o])
      } catch (fout) { meldFout({ actie: `Mail voor ${id} klaarzetten`, fout, gevolg: 'Er is niets gemaild of vastgelegd.' }) }
    },
  }

  const groepen = keuze ? perLeverancier(keuze, ov) : []
  const dialoog: ReactNode = (
    <>
      {keuze && (
        <Modal opened onClose={() => setKeuze(null)} title={`Bestellen — ${groepen.length} inkooporder${groepen.length === 1 ? '' : 's'}`} size="lg">
          <Stack gap="sm">
            <div className="ib-bestel-tbl">
              <span className="kop">Leverancier</span><span className="kop">Regels</span><span className="kop ta-r">Totaal</span><span className="kop">Mail naar</span>
              {groepen.map((g) => (
                <GroepRij key={g.id} g={g} />
              ))}
            </div>
            {groepen.filter((g) => g.waarschuwing).map((g) => <div key={g.id} className="ib-melding">{g.waarschuwing}</div>)}
            <Text size="xs" c="dimmed">Elke leverancier krijgt een eigen mail met de inkooporder-pdf erin; ze komen in je downloads.</Text>
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="default" onClick={() => setKeuze(null)}>Annuleren</Button>
              <Button size="xs" loading={bestel.isPending} onClick={() => bestel.mutate(keuze)}>Mails klaarzetten in Outlook</Button>
            </Group>
          </Stack>
        </Modal>
      )}
      {klaar && (
        <Modal opened onClose={() => setKlaar(null)} title="Heb je ze verstuurd?" size="md">
          <Stack gap="xs">
            <Text size="sm">
              {klaar.length === 1 ? 'De mail staat' : `${klaar.length} mails staan`} in je downloads ({klaar.map((o) => `${o.id} aan ${o.leverancierNaam}`).join(', ')}), elk met de inkooporder-pdf erin. Open ze en druk in Outlook op Verzenden.
            </Text>
            <Text size="sm">Bij <b>Ja, {klaar.length === 1 ? 'verstuurd' : klaar.length === 2 ? 'allebei verstuurd' : 'allemaal verstuurd'}</b> staan de regels bij <b>Besteld</b>, met de verwachte leverdatum. Bij <b>Nog niet</b> blijven ze klaarstaan in de inkoopbuffer.</Text>
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="default" onClick={() => setKlaar(null)}>Nog niet</Button>
              <Button size="xs" loading={verzonden.isPending} onClick={() => verzonden.mutate(klaar.map((o) => o.id))}>
                Ja, {klaar.length === 1 ? 'verstuurd' : klaar.length === 2 ? 'allebei verstuurd' : 'allemaal verstuurd'}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </>
  )

  return {
    open: (regels: InkoopOverzichtRegel[]) => {
      const nee = waaromNietBestellen(regels, ov?.leveranciers ?? [])
      if (nee) { meldFout({ actie: 'Bestellen', fout: new Weigering(nee), gevolg: 'Er is niets besteld.' }); return }
      setKeuze(regels)
    },
    concept,
    dialoog,
  }
}

interface BestelGroep { id: string; naam: string; email: string | null; regels: number; totaal: number; waarschuwing: string | null }

function perLeverancier(regels: InkoopOverzichtRegel[], ov: InkoopOverzicht | undefined): BestelGroep[] {
  const m = new Map<string, InkoopOverzichtRegel[]>()
  for (const r of regels) m.set(r.leverancier!.leverancierId, [...(m.get(r.leverancier!.leverancierId) ?? []), r])
  return [...m.entries()].map(([id, rs]) => {
    const lev = ov?.leveranciers.find((l) => l.id === id)
    const totaal = Math.round(rs.reduce((t, r) => t + (r.leverancier?.totaal ?? 0), 0) * 100) / 100
    const naam = lev?.naam ?? rs[0].leverancier!.naam
    let waarschuwing: string | null = null
    if (lev?.francoBedrag && totaal < lev.francoBedrag) {
      const ids = new Set(rs.map((r) => r.id))
      const andere = (ov?.regels ?? []).filter((r) => !ids.has(r.id) && !r.order && r.status === 'buffer' && r.leverancier?.leverancierId === id)
      const vroegst = andere.map((r) => r.plan.uiterlijk).filter((d): d is string => !!d).sort()[0]
      waarschuwing = `${naam} zit onder de franco-grens (${eur(lev.francoBedrag)}): nog ${eur(lev.francoBedrag - totaal)} tot gratis verzending.`
        + (andere.length ? ` Er staan nog ${andere.length} andere regel${andere.length === 1 ? '' : 's'} voor ${naam}${vroegst ? ` (uiterlijk ${ddmm(vroegst)})` : ''}; die kunnen mee.` : '')
    }
    return { id, naam, email: lev?.email ?? null, regels: rs.length, totaal, waarschuwing }
  })
}

function GroepRij({ g }: { g: BestelGroep }) {
  return (
    <>
      <span className="cell-strong">{g.naam}</span>
      <span>{g.regels}</span>
      <span className="cell-mono ta-r">{eur(g.totaal)}</span>
      <span>{g.email ?? <span className="bs-waarschuw">geen e-mailadres</span>}</span>
    </>
  )
}
