import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconX, IconCheck } from '@tabler/icons-react'
import { materiaalPlanApi, type PlanUitkomst } from '../../api/materiaal-plan'
import { machinesApi } from '../../api/machines'

/**
 * Wat gaan we zagen voor dit artikel?
 *
 * Het programma rekent een voorstel uit — welke staven, op welke laderlengte —
 * en laat dat zien vóórdat er iets vastligt. Bevestigen legt de reserveringen
 * aan, vinkt de todo af, en zet bij een tekort een bestel-todo klaar.
 */

function mm(v: number): string {
  return `${Math.round(v).toLocaleString('nl-NL')} mm`
}

export interface MateriaalSelectieProps {
  projectId: string
  artikelId: string
  artikelNaam: string
  aantal: number
  /** Wordt afgevinkt als het plan bevestigd is. */
  todoId?: string
  calculatieNr: string
  onClose: () => void
}

export function MateriaalSelectieModal(props: MateriaalSelectieProps) {
  const qc = useQueryClient()
  const machines = machinesApi.listSync()
  const [machineId, setMachineId] = useState<string>(machines[0]?.id ?? '')
  const machine = machines.find((m) => m.id === machineId) ?? null

  const { data, isLoading, error } = useQuery<PlanUitkomst>({
    queryKey: ['materiaal-plan', props.artikelId, props.aantal, machineId],
    queryFn: () => materiaalPlanApi.plan({
      artikelId: props.artikelId, aantal: props.aantal, machineId: machineId || null,
    }),
  })

  const bevestig = useMutation({
    mutationFn: () => {
      const plan = data!.plan
      return materiaalPlanApi.bevestig({
        artikelId: props.artikelId,
        aantal: props.aantal,
        machineId: machineId || null,
        projectId: props.projectId,
        calculatieNr: props.calculatieNr,
        machine: machine?.name ?? '',
        regels: plan.regels.map((r) => ({
          barId: r.barId, laderstangen: r.laderstangen, stuks: r.stuks, verbruikMm: r.verbruikMm,
        })),
        todoId: props.todoId,
        tekort: plan.tekort > 0 ? { stuks: plan.tekort, mm: plan.tekortMm } : undefined,
      })
    },
    onSuccess: (uit) => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      qc.invalidateQueries({ queryKey: ['todos'] })
      notifications.show({
        color: 'green', title: 'Materiaal vastgelegd',
        message: uit.bestelTodoId
          ? `${uit.reserveringen.length} staaf/staven gereserveerd — er staat een bestel-todo klaar voor het tekort`
          : `${uit.reserveringen.length} staaf/staven gereserveerd`,
      })
      props.onClose()
    },
    onError: (e: unknown) => notifications.show({
      color: 'red', title: 'Vastleggen mislukt',
      message: e instanceof Error ? e.message : 'Onbekende fout',
    }),
  })

  const plan = data?.plan
  const kanVastleggen = !!plan && plan.regels.length > 0 && !bevestig.isPending

  return (
    <div className="zf-overlay" onClick={props.onClose}>
      <div className="zf-modal ms-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ms-kop">
          <div>
            <div className="ms-titel">Materiaal selecteren</div>
            <div className="ms-sub">{props.artikelNaam} · {props.aantal} stuks</div>
          </div>
          <button className="st-icon-btn" onClick={props.onClose}><IconX size={16} /></button>
        </div>

        <div className="ms-body">
          <div className="ms-machine">
            <span>Draaibank</span>
            {machines.map((m) => (
              <button
                key={m.id}
                className="st-btn sm"
                data-actief={m.id === machineId ? 'true' : undefined}
                onClick={() => setMachineId(m.id)}
              >
                {m.name}
              </button>
            ))}
            {machine && (
              <span className="ms-loader">
                lader {machine.barloaderMinMm}–{machine.barloaderMaxMm} mm
              </span>
            )}
          </div>

          {isLoading && <div className="st-empty">Voorstel berekenen…</div>}
          {error && (
            <div className="st-empty" style={{ color: 'var(--danger)' }}>
              {error instanceof Error ? error.message : 'Kon geen voorstel maken'}
            </div>
          )}

          {plan && data && <PlanWeergave plan={plan} gebruikt={data.gebruikt} />}
        </div>

        <div className="ms-voet">
          <button className="st-btn" onClick={props.onClose}>Annuleren</button>
          <button
            className="st-btn primary"
            disabled={!kanVastleggen}
            onClick={() => bevestig.mutate()}
          >
            <IconCheck size={14} />
            {bevestig.isPending ? 'Vastleggen…' : 'Reserveren'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlanWeergave({ plan, gebruikt }: {
  plan: PlanUitkomst['plan']
  gebruikt: PlanUitkomst['gebruikt']
}) {
  if (plan.regels.length === 0) {
    return (
      <div className="ms-tekort">
        <IconAlertTriangle size={16} />
        <div>
          <strong>Geen passend materiaal op voorraad.</strong>
          <div>
            Er is {plan.tekort} × {mm(plan.stukLengteMm)} nodig, in totaal {mm(plan.tekortMm)}.
            Vastleggen kan niet; zet het op de bestellijst.
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="ms-som">
        {/* De laderlengte is de kern van het voorstel: die valt precies op een
            heel aantal stuks, zodat er per stang niets onbenut blijft. */}
        <div><span>Per stuk</span><b>{mm(plan.stukLengteMm)}</b></div>
        <div><span>Laderlengte</span><b>{mm(plan.laderLengteMm)}</b></div>
        <div><span>Stuks per stang</span><b>{plan.stuksPerLaderstang}</b></div>
        <div><span>Gedekt</span><b>{plan.gedekt} van {plan.gedekt + plan.tekort}</b></div>
      </div>

      <div className="ms-uitleg">
        {mm(gebruikt.werkstukLengteMm)} werkstuk + {gebruikt.params.vlakToeslag} vlak
        + {gebruikt.params.afsteek} afsteek + {gebruikt.params.steekbreedte} zaagsnede
        · opspanlengte {gebruikt.params.opspanlengte} mm per stang
      </div>

      <div className="ms-tbl-wrap">
      <table className="st-tbl ms-tbl">
        <thead>
          <tr>
            <th style={{ width: '15%' }}>Staaf</th>
            <th style={{ width: '22%' }}>Locatie</th>
            <th style={{ width: '12%', textAlign: 'right' }}>Stangen</th>
            <th style={{ width: '10%', textAlign: 'right' }}>Stuks</th>
            <th style={{ width: '18%', textAlign: 'right' }}>Verbruik</th>
            {/* Rest draagt ook het schroot-label, dus die krijgt de meeste ruimte. */}
            <th style={{ width: '23%', textAlign: 'right' }}>Rest</th>
          </tr>
        </thead>
        <tbody>
          {plan.regels.map((r) => (
            <tr key={r.barId}>
              <td className="cell-mono">{r.barCode}</td>
              <td className="cell-muted">{r.locatie ?? '—'}</td>
              <td className="cell-mono" style={{ textAlign: 'right' }}>{r.laderstangen}</td>
              <td className="cell-mono" style={{ textAlign: 'right' }}>{r.stuks}</td>
              <td className="cell-mono" style={{ textAlign: 'right' }}>{mm(r.verbruikMm)}</td>
              <td className="cell-mono" style={{ textAlign: 'right' }}>
                {mm(r.restMm)}
                {r.restWordtSchroot && <span className="ms-schroot">schroot</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {plan.tekort > 0 && (
        <div className="ms-tekort">
          <IconAlertTriangle size={16} />
          <div>
            <strong>{plan.tekort} stuks tekort</strong>
            <div>
              Er is nog {mm(plan.tekortMm)} nodig. Vastleggen reserveert wat er ligt en
              zet het tekort op de bestellijst.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
