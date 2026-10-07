import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Drawer, Group, Stack, Textarea, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { openStuks, waaromNietLeverdatum, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { inkoopApi } from '../../../api/inkoop'
import { bestelRegelsApi } from '../../../api/bestellingen'
import { inkoopordersApi, INKOOP_SLEUTELS } from '../../../api/inkooporders'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'
import { aantalTekst, eur } from '../bestellingen/bestel-tekst'
import { useInkoopActies } from '../bestellingen/useInkoopActies'
import { StandChip, ddmm, ddmmjjjj, lokaleDag } from './tekst'
import { toonDocument } from '../../../features/projects/detail/lib/toon-document'
import { inkooporderBestandsnaam, inkooporderPdf } from '../lib/inkooporder-document'

/**
 * Eén bestelregel in detail (2026-10-07): waar hij staat, wanneer hij nodig is,
 * wat er gebeurd is, en wat je er nu mee kunt — leverdatum aanpassen, de order
 * intrekken, of melden dat hij binnen is.
 */
export function RegelPaneel({ r, onSluit, onBinnen }: { r: InkoopOverzichtRegel; onSluit: () => void; onBinnen: (r: InkoopOverzichtRegel) => void }) {
  const qc = useQueryClient()
  const ververs = () => { for (const k of INKOOP_SLEUTELS) qc.invalidateQueries({ queryKey: [k] }) }
  const gesch = useQuery({ queryKey: ['bestel-geschiedenis', r.id], queryFn: () => inkoopApi.geschiedenis(r.id) })
  const orders = useQuery({ queryKey: ['inkooporders'], queryFn: inkoopordersApi.list })
  const order = orders.data?.find((o) => o.id === r.order?.id)
  const orderRegel = order?.regels.find((x) => x.id === r.order?.inkooporderRegelId)
  const acties = useInkoopActies()
  const [notitie, setNotitie] = useState(r.notitie ?? '')
  const [datum, setDatum] = useState<string | null>(null)

  const bewaarNotitie = useMutation({
    mutationFn: () => bestelRegelsApi.update(r.id, { notitie: notitie.trim() || null }),
    onSuccess: () => { ververs(); notifications.show({ color: 'green', message: 'Notitie bewaard' }) },
    onError: (e) => meldFout({ actie: `Notitie bij ${r.materiaal} bewaren`, fout: e, gevolg: 'De notitie is niet bewaard; wat je typte staat nog in het veld.' }),
  })
  const leverdatum = useMutation({
    mutationFn: (d: string | null) => {
      eis(order && orderRegel ? waaromNietLeverdatum(order, orderRegel, d) : 'De inkooporder is nog niet geladen. Probeer het zo opnieuw.')
      return inkoopApi.leverdatum(order!.id, orderRegel!.id, d)
    },
    onSuccess: (_o, d) => { ververs(); setDatum(null); notifications.show({ color: 'green', message: d ? `Verwacht binnen: ${ddmmjjjj(d)}` : 'Leverdatum volgt weer uit de levertijd' }) },
    onError: (e) => meldFout({ actie: `Leverdatum van ${r.materiaal} aanpassen`, fout: e, gevolg: 'De leverdatum is niet veranderd.' }),
  })
  const verwijder = useMutation({
    mutationFn: () => bestelRegelsApi.remove(r.id),
    onSuccess: () => { ververs(); onSluit(); notifications.show({ color: 'green', message: `${r.materiaal} is van de bestellijst` }) },
    onError: (e) => meldFout({ actie: `${r.materiaal} verwijderen`, fout: e, gevolg: 'De regel staat er nog.' }),
  })

  const onderweg = r.order?.status === 'verzonden' && orderRegel && openStuks(orderRegel) > 0
  const l = r.leverancier
  const verwachtUitleg = !r.plan.verwacht ? null
    : r.order?.verwachtAangepast ? 'doorgegeven door de leverancier'
    : `besteld ${r.order?.verzondenOp ? ddmm(lokaleDag(r.order.verzondenOp)) : ''} + ${l?.levertijdDagen ?? 0} werkdagen`

  return (
    <Drawer opened onClose={onSluit} position="right" size={480} title={<span className="cell-strong">{r.materiaal} · {aantalTekst(r)}</span>}>
      <Stack gap="md" className="ib-paneel">
        <div>
          <div className="ib-sub">{[r.projectId ?? 'voorraad', r.klantNaam, r.artikelNaam].filter(Boolean).join(' · ')}</div>
          <div style={{ marginTop: 8 }}><StandChip r={r} /></div>
        </div>
        <dl>
          <dt>Nodig voor productie</dt>
          <dd>{r.nodig.datum ? <><span className="cell-mono">{ddmmjjjj(r.nodig.datum)}</span> <span className="ib-sub">· {r.nodig.bron === 'productie' ? `${r.nodig.machine ?? 'productie'} gepland` : 'levering aan de klant min 2 werkdagen'}</span></> : 'geen datum'}</dd>
          {r.plan.uiterlijk && <><dt>Uiterlijk bestellen</dt><dd className="cell-mono">{ddmmjjjj(r.plan.uiterlijk)}</dd></>}
          {r.order?.status === 'verzonden' && <><dt>Verwacht binnen</dt><dd>{r.plan.verwacht ? <><span className="cell-mono">{ddmmjjjj(r.plan.verwacht)}</span> <span className="ib-sub">· {verwachtUitleg}</span></> : 'levertijd onbekend'}</dd></>}
          <dt>Leverancier · prijs</dt>
          <dd>{l ? <>{l.naam}{l.totaal != null && <> · <span className="cell-mono">{eur(l.totaal)}</span></>}{!l.gekozen && <span className="ib-sub"> (goedkoopste)</span>}</> : 'nog geen prijs'}</dd>
          <dt>Levering klant</dt><dd className="cell-mono">{ddmmjjjj(r.levertijdDatum)}</dd>
          {r.order && <><dt>Inkooporder</dt><dd className="cell-mono">{r.order.referentie}{r.order.status === 'concept' ? ' (klaargezet)' : ''}</dd></>}
        </dl>

        <section aria-label="Geschiedenis">
          <h3 className="ib-kop-klein">Geschiedenis</h3>
          <ol className="ib-tijdlijn">
            {(gesch.data ?? []).map((g, i) => {
              const doc = g.document ? orders.data?.find((o) => o.id === g.document) : undefined
              return (
                <li key={i}>
                  <span className="d">{ddmm(lokaleDag(g.datum))}</span>
                  <span>{g.tekst}{doc && <> · <button type="button" className="ib-lev-knop" onClick={() => toonDocument(`${doc.id} openen`, () => inkooporderPdf(doc), { titel: `Inkooporder ${doc.id}`, bestandsnaam: inkooporderBestandsnaam(doc) })}>pdf</button></>}</span>
                </li>
              )
            })}
            {onderweg && r.plan.verwacht && <li data-toekomst="true"><span className="d">{ddmm(r.plan.verwacht)}</span><span>verwacht binnen</span></li>}
            {gesch.error && <li><span /><span className="bs-waarschuw">De geschiedenis kon niet geladen worden: {(gesch.error as Error).message}</span></li>}
          </ol>
        </section>

        <Textarea size="xs" label="Notitie" autosize minRows={2} value={notitie} onChange={(e) => setNotitie(e.currentTarget.value)}
          onBlur={() => { if ((notitie.trim() || null) !== (r.notitie ?? null)) bewaarNotitie.mutate() }} placeholder="bijv. gebeld: komt donderdag" />

        {datum !== null && (
          <Group gap="xs" align="flex-end">
            <TextInput size="xs" type="date" label="Verwacht binnen (zoals de leverancier zegt)" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
            <Button size="xs" loading={leverdatum.isPending} onClick={() => leverdatum.mutate(datum || null)}>Opslaan</Button>
            {r.order?.verwachtAangepast && <Button size="xs" variant="subtle" onClick={() => leverdatum.mutate(null)}>Terug naar levertijd</Button>}
          </Group>
        )}

        <Group gap="xs">
          {onderweg && datum === null && <Button size="xs" variant="default" onClick={() => setDatum(r.plan.verwacht ?? '')}>Leverdatum aanpassen</Button>}
          {onderweg && order && <Button size="xs" variant="default" onClick={() => acties.intrekken(order)}>Order intrekken</Button>}
          {!r.order && (r.status === 'te_bestellen' || r.status === 'aangevraagd') && (
            <Button size="xs" variant="subtle" color="red" onClick={() => { if (window.confirm(`${r.materiaal} van de bestellijst halen?`)) verwijder.mutate() }}>Van de lijst</Button>
          )}
          <span style={{ flex: 1 }} />
          {onderweg && <Button size="xs" color="green" onClick={() => onBinnen(r)}>Binnen</Button>}
        </Group>
      </Stack>
      {acties.dialoog}
    </Drawer>
  )
}
