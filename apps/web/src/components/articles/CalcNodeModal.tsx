import { Select, NumberInput, Modal, TextInput, Button, Group, Stack, Divider } from '@mantine/core'
import type { EstimateNode } from '../../api/articles'
import type { Machine } from '../../api/machines'
import { eur } from './calc-helpers'

export type NodeModalState = { type: 'machine' | 'external'; mode: 'add' | 'edit'; draft: EstimateNode }

const TITELS = {
  machine: { add: 'Machine toevoegen', edit: 'Machine wijzigen' },
  external: { add: 'Uitbesteding toevoegen', edit: 'Uitbesteding wijzigen' },
} as const

function MachineVelden({ draft, machines, onChange }: {
  draft: EstimateNode
  machines: Machine[]
  onChange: (p: Partial<EstimateNode>) => void
}) {
  const m = machines.find(x => x.id === draft.machineId)
  return (
    <Stack gap="sm">
      {/* Geen vrij naamveld: de naam van een machineknoop is de naam van de
          machine. Die naam reist door naar de offerteregel (`bewerkingenVan`)
          en vandaar naar de productiestap, waar de terminal en de planning hem
          moeten kunnen herleiden tot een machine uit de lijst. */}
      <Select
        label="Machine" size="sm"
        data={machines.map(x => ({ value: x.id, label: x.name }))}
        value={draft.machineId ?? null}
        onChange={v => onChange({ machineId: v, name: machines.find(x => x.id === v)?.name ?? draft.name, rateOverride: null })}
      />
      {m && (
        <div className="acalc-modal-info">
          <b>{m.name}</b>
          <span className="cell-muted">
            {eur(m.machineRatePerHour)}/u machine + {eur(m.operatorRatePerHour)}/u operator = {eur(m.machineRatePerHour + m.operatorRatePerHour)}/u · standaard insteltijd {m.defaultSetupMin} min
          </span>
        </div>
      )}
      <Divider label="Insteltijd & tarief" labelPosition="left" />
      <Group grow>
        <NumberInput label="Insteltijd (min)" size="sm" min={0} decimalSeparator="," value={draft.setupMin ?? 0}
          onChange={v => onChange({ setupMin: v === '' ? 0 : Number(v) })} />
        <NumberInput label="Vast tarief (€/u)" size="sm" min={0} step={0.5} decimalSeparator="," placeholder="van de machine"
          value={draft.rateOverride ?? ''}
          onChange={v => onChange({ rateOverride: v === '' ? null : Number(v) })} />
      </Group>
    </Stack>
  )
}

function UitbestedingVelden({ draft, onChange }: { draft: EstimateNode; onChange: (p: Partial<EstimateNode>) => void }) {
  return (
    <Stack gap="sm">
      <TextInput label="Naam" size="sm" value={draft.name} onChange={e => onChange({ name: e.currentTarget.value })} />
      <TextInput label="Omschrijving" size="sm" value={draft.note ?? ''} onChange={e => onChange({ note: e.currentTarget.value })} />
      <Divider label="Aantal & kosten" labelPosition="left" />
      <Group grow>
        <NumberInput label="Aantal" size="sm" min={0} decimalSeparator="," value={draft.qty ?? 1}
          onChange={v => onChange({ qty: v === '' ? 0 : Number(v) })} />
        <NumberInput label="Kosten (€/stuk)" size="sm" min={0} step={0.01} decimalSeparator="," value={draft.externalCost ?? 0}
          onChange={v => onChange({ externalCost: v === '' ? 0 : Number(v) })} />
      </Group>
    </Stack>
  )
}

/**
 * Venster om een machine of uitbesteding toe te voegen of te wijzigen. Een
 * materiaalregel gaat sinds 2026-10-23 altijd via de materiaalkiezer.
 */
export function CalcNodeModal({ state, machines, onChange, onConfirm, onCancel }: {
  state: NodeModalState | null
  machines: Machine[]
  onChange: (p: Partial<EstimateNode>) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!state) return null
  return (
    <Modal opened title={TITELS[state.type][state.mode]} onClose={onCancel} closeOnClickOutside={false} closeOnEscape={false}
      size={520} centered radius="md">
      {state.type === 'machine'
        ? <MachineVelden draft={state.draft} machines={machines} onChange={onChange} />
        : <UitbestedingVelden draft={state.draft} onChange={onChange} />}
      <Group justify="flex-end" mt="lg">
        <Button variant="default" size="sm" onClick={onCancel}>Annuleren</Button>
        <Button size="sm" onClick={onConfirm}>OK</Button>
      </Group>
    </Modal>
  )
}
