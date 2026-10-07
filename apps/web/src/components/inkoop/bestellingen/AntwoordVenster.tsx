import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, NumberInput, Select, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { prijsVanAntwoord, type AntwoordSoort, type BestelRegel, type Prijsaanvraag, type PrijsaanvraagLeverancier } from '@stockmanager/shared'
import { prijsaanvragenApi } from '../../../api/bestellingen'
import { ApiFout } from '../../../api/client'
import { meldFout } from '../../../utils/fout-melding-toon'
import { aantalTekst, eur } from './bestel-tekst'

type Rij = { soort: AntwoordSoort; prijs: number | string; zagen: number | string; dagen: number | string }
const leeg = (v: number | string) => v === '' || v == null

/**
 * Het antwoord van één leverancier op een prijsaanvraag invullen (2026-10-06):
 * per regel hoe ze rekenen, de prijs, zagen per snede en de levertijd. Laat je
 * de prijs leeg, dan heeft die leverancier op die regel (nog) niet geantwoord.
 */
export function AntwoordVenster({ aanvraag, leverancier, regels, onSluit }: {
  aanvraag: Prijsaanvraag; leverancier: PrijsaanvraagLeverancier; regels: BestelRegel[]; onSluit: () => void
}) {
  const qc = useQueryClient()
  const eigen = regels.filter((r) => aanvraag.regelIds.includes(r.id))
  const [rijen, setRijen] = useState<Record<string, Rij>>(() => Object.fromEntries(eigen.map((r) => {
    const a = aanvraag.antwoorden.find((x) => x.bestelRegelId === r.id && x.leverancierId === leverancier.leverancierId)
    return [r.id, { soort: a?.prijsSoort ?? 'per_kg', prijs: a?.prijs ?? '', zagen: a?.zaagkostenPerSnede ?? '', dagen: a?.levertijdDagen ?? '' }]
  })))
  const zet = (id: string, p: Partial<Rij>) => setRijen((o) => ({ ...o, [id]: { ...o[id], ...p } }))

  // De server vervangt alle antwoorden van deze leverancier op deze aanvraag.
  // Regels die hier niet in beeld zijn, gaan dus ongewijzigd mee.
  const buiten = aanvraag.antwoorden
    .filter((a) => a.leverancierId === leverancier.leverancierId && !eigen.some((r) => r.id === a.bestelRegelId))
    .map((a) => ({ bestelRegelId: a.bestelRegelId, prijsSoort: a.prijsSoort, prijs: a.prijs, zaagkostenPerSnede: a.zaagkostenPerSnede, levertijdDagen: a.levertijdDagen, notitie: a.notitie }))
  const opslaan = useMutation({
    mutationFn: () => prijsaanvragenApi.antwoorden(aanvraag.id, leverancier.leverancierId, [...buiten, ...eigen
      .filter((r) => Number(rijen[r.id].prijs) > 0)
      .map((r) => {
        const x = rijen[r.id]
        return {
          bestelRegelId: r.id, prijsSoort: x.soort, prijs: Number(x.prijs),
          zaagkostenPerSnede: leeg(x.zagen) ? null : Number(x.zagen), levertijdDagen: leeg(x.dagen) ? null : Number(x.dagen),
        }
      })]),
    onSuccess: () => {
      for (const key of ['prijsaanvragen', 'vergelijk', 'inkoop', 'bestel-geschiedenis']) qc.invalidateQueries({ queryKey: [key] })
      notifications.show({ color: 'green', message: `Antwoord van ${leverancier.naam} opgeslagen` })
      onSluit()
    },
    onError: (e) => meldFout({
      actie: `Antwoord van ${leverancier.naam} opslaan`,
      fout: e,
      gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
        ? 'Onbekend of het antwoord is opgeslagen. Open het venster opnieuw om te kijken.'
        : 'Er is niets opgeslagen; wat je invulde staat nog in het venster.',
    }),
  })

  return (
    <Modal opened onClose={onSluit} title={`Antwoord van ${leverancier.naam} — ${aanvraag.id}`} size={980}>
      <Stack gap="xs">
        <div className="bs-antw">
          <div className="bs-antw-kop"><span>Regel</span><span>Prijs als</span><span>Prijs</span><span>Zagen / snede</span><span>Levertijd</span><span className="ta-r">Totaal</span></div>
          {eigen.map((r) => {
            const x = rijen[r.id]
            const totaal = Number(x.prijs) > 0
              ? prijsVanAntwoord({ prijsSoort: x.soort, prijs: Number(x.prijs), zaagkostenPerSnede: leeg(x.zagen) ? null : Number(x.zagen) }, r)
              : null
            return (
              <div key={r.id} className="bs-antw-rij">
                <div><div className="cell-strong">{r.materiaal}</div><div className="bs-sub">{aantalTekst(r)}</div></div>
                <Select size="xs" allowDeselect={false} value={x.soort} onChange={(v) => zet(r.id, { soort: v as AntwoordSoort })}
                  data={[{ value: 'per_kg', label: 'per kg' }, { value: 'per_stuk', label: 'per stuk' }, { value: 'totaal', label: 'totaal' }]} />
                <NumberInput size="xs" prefix="€ " decimalSeparator="," thousandSeparator="." decimalScale={2} min={0} placeholder="geen antwoord" value={x.prijs} onChange={(v) => zet(r.id, { prijs: v })} />
                <NumberInput size="xs" prefix="€ " decimalSeparator="," decimalScale={2} min={0} placeholder={x.soort === 'totaal' ? 'in totaal' : 'in prijs'} disabled={x.soort === 'totaal'} value={x.soort === 'totaal' ? '' : x.zagen} onChange={(v) => zet(r.id, { zagen: v })} />
                <NumberInput size="xs" suffix=" werkdagen" allowDecimal={false} min={0} value={x.dagen} onChange={(v) => zet(r.id, { dagen: v })} />
                <div className="ta-r">
                  <div className="cell-mono cell-strong">{totaal ? eur(totaal.totaal) : '—'}</div>
                  {totaal && <div className="bs-sub">{totaal.uitleg}</div>}
                </div>
              </div>
            )
          })}
        </div>
        <Text size="xs" c="dimmed">Bij "totaal" is alles inbegrepen, dus geen aparte zaagkosten. Een lege prijs betekent: nog geen antwoord op die regel.</Text>
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" loading={opslaan.isPending} onClick={() => opslaan.mutate()}>Opslaan</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
