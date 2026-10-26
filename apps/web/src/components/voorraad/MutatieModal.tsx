import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { SegmentedControl, NumberInput, Textarea, Stack, Button, Text } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { waaromNietMutatie } from '@stockmanager/shared'
import { rawMaterialsApi, formatDimensions, formatLocation, type RawMaterialRow } from '../../api/raw-materials'
import { ApiFout } from '../../api/client'
import { RESERVERINGEN_KEY, useOpenReserveringen } from '../../hooks/useReserveringen'
import { eis } from '../../utils/fout-melding'
import { meldFout } from '../../utils/fout-melding-toon'
import { MutatieZaagbonnen } from './MutatieZaagbonnen'
import { mutatieReden, nieuweLengte, waaromNietInvoer, type MutatieType } from './mutatie'
import { fmm } from './weergave'

const LABEL: Record<MutatieType, string> = { toevoegen: 'Toevoegen', afboeken: 'Afboeken', correctie: 'Corrigeren' }

/**
 * Voorraadmutatie met de hand. Zakt de staaf onder wat er vastligt, dan gaat hij
 * niet door (2026-10-19): eerst afboeken in de Zaagflow of de reservering
 * annuleren. Het venster zegt het al tijdens het intypen; de server nog eens.
 */
export function MutatieModal({ row, onClose }: { row: RawMaterialRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [type, setType]     = useState<MutatieType>('toevoegen')
  const [lengte, setLengte] = useState<number | string>('')
  const [reden, setReden]   = useState('')
  const { data: open } = useOpenReserveringen()

  const resterendMm = Number(row?.currentStock ?? 0)
  const nieuweMm = nieuweLengte(type, resterendMm, Number(lengte) || 0)
  const bonnen = row ? open.filter((r) => r.barId === row.id) : []
  const geweigerd = Number(lengte) > 0 ? waaromNietMutatie(resterendMm, nieuweMm, bonnen) : null

  function sluit() {
    setLengte(''); setReden('')
    onClose()
  }

  const adjustMut = useMutation({
    mutationFn: async (r: RawMaterialRow) => {
      eis(waaromNietInvoer(Number(lengte)))
      eis(waaromNietMutatie(resterendMm, nieuweMm, bonnen))
      await rawMaterialsApi.adjustStock(r.id, nieuweMm, mutatieReden(type), reden || undefined)
      return nieuweMm
    },
    onSuccess: (nieuw) => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      notifications.show({
        color: 'green',
        title: 'Mutatie verwerkt',
        message: `${type === 'correctie' ? 'Correctie' : LABEL[type]}: nieuw resterend ${fmm(nieuw)}`,
      })
      sluit()
    },
    onError: (e) => {
      // Kan er intussen een zaagbon bij gekomen zijn: haal ze opnieuw, zodat
      // het venster toont waarover de server viel.
      qc.invalidateQueries({ queryKey: RESERVERINGEN_KEY })
      meldFout({
        actie: `Voorraadmutatie ${row?.code ?? ''}`.trim(),
        fout: e,
        gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
          ? 'Onbekend of de mutatie is verwerkt: de server antwoordde niet op tijd. Kijk in de historie van de staaf voor je het opnieuw doet.'
          : 'De voorraad is niet veranderd.',
      })
    },
  })

  if (!row) return null
  const originalMm = Number(row.lengthMm)

  return (
    <>
      <div className="st-drawer-scrim" onClick={sluit} />
      <aside className="st-drawer" style={{ width: 420 }}>
        <div className="st-drawer-hd">
          <div style={{ flex: 1 }}>
            <div className="ttl">Voorraadmutatie</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {row.code} · {row.profile.name} {formatDimensions(row.profile, row.dimensions)}
            </div>
          </div>
          <button className="st-icon-btn" onClick={sluit}><IconX size={16} /></button>
        </div>

        <div className="st-drawer-bd">
          <Stack gap="md">
            <div className="st-field">
              <label style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)' }}>
                Type mutatie
              </label>
              <SegmentedControl
                value={type}
                onChange={(v) => setType(v as MutatieType)}
                data={[
                  { label: 'Toevoegen', value: 'toevoegen' },
                  { label: 'Afboeken',  value: 'afboeken'  },
                  { label: 'Correctie', value: 'correctie' },
                ]}
                fullWidth
                mt={6}
              />
            </div>

            <div style={{ background: 'var(--bg-sidebar)', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', marginBottom: 4 }}>
                Resterend
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--text)' }}>
                {fmm(resterendMm)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                van {fmm(originalMm)} origineel · {Math.round(resterendMm / originalMm * 100)}% over
              </div>
            </div>

            <NumberInput
              label={type === 'correctie' ? 'Nieuwe totaallengte (mm)' : 'Lengte (mm)'}
              description={type !== 'correctie' ? `Voer de lengte in meters: 1 m = 1000 mm` : undefined}
              placeholder="bijv. 6000"
              value={lengte}
              onChange={setLengte}
              min={0}
              allowDecimal
              decimalScale={1}
              size="sm"
              suffix=" mm"
            />

            {geweigerd && <MutatieZaagbonnen reden={geweigerd} bonnen={bonnen} />}

            <div className="st-field">
              <label style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)' }}>
                Locatie
              </label>
              <Text size="sm" mt={4}>{formatLocation(row.locationSlot)}</Text>
              <Text size="xs" c="dimmed" mt={2}>Wijzig de locatie via "Bewerken" op het materiaal.</Text>
            </div>

            <Textarea
              label="Reden / opmerking"
              placeholder="Bijv. ontvangst van leverancier, correctie na telling…"
              value={reden}
              onChange={(e) => setReden(e.currentTarget.value)}
              autosize
              minRows={2}
              size="sm"
            />
          </Stack>
        </div>

        <div className="st-drawer-ft">
          <Button variant="default" size="xs" onClick={sluit}>Annuleren</Button>
          <Button size="xs" loading={adjustMut.isPending} onClick={() => adjustMut.mutate(row)}>{LABEL[type]}</Button>
        </div>
      </aside>
    </>
  )
}
