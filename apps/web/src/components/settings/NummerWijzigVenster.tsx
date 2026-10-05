import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Group, Modal, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { gatInFactuurnummers, waaromNietNummerZetten, type DocReeksStand } from '@stockmanager/shared'
import { nummeringApi } from '../../api/nummering'
import { meldFout } from '../../utils/fout-melding-toon'
import { ApiFout } from '../../api/client'

/**
 * Het volgende nummer van een reeks met de hand zetten (2026-10-05) — voor als
 * er intern iets misging. Dezelfde regels als de server: niet lager dan wat er
 * al bestaat, en bij facturen een gat alleen na bevestiging. Reden verplicht;
 * alles komt in het logboek eronder.
 */
export function NummerWijzigVenster({ reeks, onSluit }: { reeks: DocReeksStand; onSluit: () => void }) {
  const qc = useQueryClient()
  const [waarde, setWaarde] = useState(String(reeks.volgendeN))
  const [reden, setReden] = useState('')
  const [gatAkkoord, setGatAkkoord] = useState(false)

  const n = Number(waarde.trim())
  const fout = waaromNietNummerZetten(reeks, n)
  const gat = fout ? null : gatInFactuurnummers(reeks, n)
  const ongewijzigd = n === reeks.volgendeN
  const kan = !fout && !ongewijzigd && reden.trim().length >= 3 && (!gat || gatAkkoord)
  const voorbeeld = `${reeks.prefix}-${reeks.jaar}-${String(Number.isInteger(n) && n > 0 ? n : 0).padStart(3, '0')}`

  const opslaan = useMutation({
    mutationFn: () => nummeringApi.zet(reeks.prefix, { volgende: n, reden: reden.trim(), gatAkkoord: gat ? true : undefined }),
    onSuccess: (stand) => {
      qc.invalidateQueries({ queryKey: ['nummering'] })
      notifications.show({ color: 'green', message: `Volgende ${reeks.naam.toLowerCase()} wordt ${stand.volgende}` })
      onSluit()
    },
    onError: (e) =>
      meldFout({
        actie: `Nummerreeks ${reeks.naam.toLowerCase()} wijzigen`,
        fout: e,
        gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
          ? 'Onbekend of het nummer is gewijzigd: de server antwoordde niet op tijd. Kijk in het overzicht voor je het opnieuw doet.'
          : 'Er is niets veranderd aan de nummering.',
      }),
  })

  return (
    <Modal opened onClose={onSluit} title={`Volgend nummer — ${reeks.naam}`} size="sm">
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Nu: het volgende document wordt <b>{reeks.volgende}</b>
          {reeks.hoogsteBestaand > 0 ? `; het hoogste dat er dit jaar is, is ${String(reeks.hoogsteBestaand).padStart(3, '0')}` : ''}.
          Alleen voor als er iets fout ging — normaal telt de server zelf.
        </Text>
        <TextInput
          size="xs" label="Volgend volgnummer" inputMode="numeric" data-autofocus
          leftSection={<Text size="xs" c="dimmed">{reeks.prefix}-{reeks.jaar}-</Text>} leftSectionWidth={80}
          value={waarde} onChange={(e) => setWaarde(e.currentTarget.value)}
          error={fout ?? undefined}
        />
        {!fout && !ongewijzigd && <Text size="xs">Het volgende document wordt <b>{voorbeeld}</b>.</Text>}
        {gat && (
          <Checkbox
            size="xs" color="orange" checked={gatAkkoord} onChange={(e) => setGatAkkoord(e.currentTarget.checked)}
            label={<Text size="xs" c="orange.8">{gat} Ik weet het, en kan het uitleggen.</Text>}
          />
        )}
        <Textarea
          size="xs" label="Reden" autosize minRows={2} placeholder="bijv. teller teruggezet na herstel van een backup"
          value={reden} onChange={(e) => setReden(e.currentTarget.value)}
          error={reden.length > 0 && reden.trim().length < 3 ? 'Vul minstens 3 tekens in.' : undefined}
        />
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" disabled={!kan} loading={opslaan.isPending} onClick={() => opslaan.mutate()}>Opslaan</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
