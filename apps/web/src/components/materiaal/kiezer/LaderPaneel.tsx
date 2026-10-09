import { NumberInput, Select, Switch } from '@mantine/core'
import type { Machine } from '../../../api/machines'
import {
  brutoLengte, computeWeightKg, laderVoorRegel, materialCostPerPiece, ZAAG_STANDAARD, type EstimateCtx,
} from '../../../api/estimate'
import type { MateriaalGroep } from '../materiaal-groepen'
import { LaderStangBalk } from '../Balken'

const nl = (n: number, d = 0) => n.toLocaleString('nl-NL', { maximumFractionDigits: d })
const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export interface Keuze {
  lengthMm: number | null
  laderMachineId: string | null
}

/**
 * Rechts in de materiaalkiezer (2026-10-09): werkstuklengte, stangenlader
 * aan/uit met de machine, en het rekenscherm — hoeveel stuks er uit één
 * laderstang komen, op schaal in kleur. De maten van de lader horen bij de
 * machine (Instellingen → Machines); hier alleen tonen.
 */
export function LaderPaneel({ groep, keuze, machines, ctx, onKeuze }: {
  groep: MateriaalGroep
  keuze: Keuze
  machines: Machine[]
  ctx: EstimateCtx
  onKeuze: (k: Keuze) => void
}) {
  const metLader = machines.filter((m) => m.heeftStangenlader)
  const node = {
    gradeId: groep.rij.gradeId, profileId: groep.rij.profileId, dimensions: groep.rij.dimensions,
    lengthMm: keuze.lengthMm, laderMachineId: keuze.laderMachineId,
  }
  const lader = laderVoorRegel(node, machines)
  const netto = keuze.lengthMm ?? 0
  const bruto = brutoLengte(netto, lader)
  const prijs = materialCostPerPiece(node, ctx)
  const formule = ctx.profiles?.find((p) => p.id === groep.rij.profileId)?.volumeFormula
  const dichtheid = ctx.grades.find((g) => g.id === groep.rij.gradeId)?.densityKgM3 ?? 0
  const kg = formule ? computeWeightKg(formule as 'round', groep.rij.dimensions, bruto.brutoMm, dichtheid) : 0

  return (
    <>
      <div>
        <h3>{groep.kwaliteit} {groep.vorm} {groep.afmeting}{groep.afwerking ? ` · ${groep.afwerking}` : ''}</h3>
        <div className="k">
          {groep.exoot ? 'exoot — op maat besteld, zonder lader' : `${groep.staven} ${groep.staven === 1 ? 'staaf' : 'staven'} · ${nl(groep.vrijMm)} mm vrij · langste ${nl(groep.langsteMm)} mm`}
        </div>
      </div>

      <div className="mk-velden">
        <NumberInput size="xs" label="Werkstuklengte (netto)" suffix=" mm" min={0} value={keuze.lengthMm ?? ''}
          onChange={(v) => onKeuze({ ...keuze, lengthMm: Number(v) > 0 ? Number(v) : null })} />
        <div style={{ gridColumn: 'span 2' }}>
          <Switch size="xs" mt={22} disabled={groep.exoot || metLader.length === 0}
            label={metLader.length === 0 ? 'Stangenlader (geen machine met lader)' : 'Met stangenlader'}
            checked={!!keuze.laderMachineId}
            onChange={(e) => onKeuze({ ...keuze, laderMachineId: e.currentTarget.checked ? metLader[0]?.id ?? null : null })} />
        </div>
      </div>

      {lader ? (
        <>
          <Select size="xs" label="Draaibank met lader" allowDeselect={false}
            data={metLader.map((m) => ({ value: m.id, label: m.name }))}
            value={keuze.laderMachineId} onChange={(v) => onKeuze({ ...keuze, laderMachineId: v })} />
          <div className="k">
            Maten van de {lader.machineNaam}: vlak {nl(ZAAG_STANDAARD.vlakToeslag / 2, 1)} + {nl(ZAAG_STANDAARD.vlakToeslag / 2, 1)} ·
            afsteek {nl(lader.afsteekMm, 1)} · grijp {nl(lader.opspanlengteMm)} · laderstang {nl(lader.barloaderMinMm)}–{nl(lader.barloaderMaxMm)} mm ·
            zaagsnede {ZAAG_STANDAARD.steekbreedte} per stang. Aanpassen bij Instellingen → Machines.
          </div>
          {netto > 0 && <LaderStangBalk werkstukMm={netto} lader={lader} breedte={520} />}
          {netto > 0 && (
            <div className="mk-cijfers">
              <div data-nadruk><span>Stuks per stang</span><b>{bruto.stuksPerLaderstang}</b></div>
              <div><span>Laderstang</span><b>{nl(bruto.laderstangMm ?? 0)} mm</b></div>
              <div><span>Per stuk (bruto)</span><b>{nl(bruto.brutoMm, 1)} mm</b></div>
              <div><span>Materiaal/stuk</span><b>{eur(prijs)}</b></div>
            </div>
          )}
          <div className="k">
            Bij een offerte rekent hij met het echte aantal: hele laderstangen, de stuks gelijk verdeeld.
          </div>
        </>
      ) : (
        netto > 0 && (
          <>
            <div className="k">
              Alleen lengtemateriaal: {nl(netto, 1)} werkstuk + {ZAAG_STANDAARD.vlakToeslag} vlak + {ZAAG_STANDAARD.steekbreedte} zaagsnede per stuk.
            </div>
            <div className="mk-cijfers">
              <div data-nadruk><span>Per stuk (bruto)</span><b>{nl(bruto.brutoMm, 1)} mm</b></div>
              <div><span>Gewicht/stuk</span><b>{nl(kg, 2)} kg</b></div>
              <div><span>Materiaal/stuk</span><b>{eur(prijs)}</b></div>
              <div><span>Uit vrije voorraad</span><b>≈ {bruto.brutoMm > 0 ? nl(Math.floor(groep.vrijMm / bruto.brutoMm)) : 0} st</b></div>
            </div>
          </>
        )
      )}
    </>
  )
}
