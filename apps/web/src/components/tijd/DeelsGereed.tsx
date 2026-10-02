import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconCheck, IconMinus, IconPlus, IconX } from '@tabler/icons-react'
import { waaromNietDeelsGereed, type ProductieOrder } from '@stockmanager/shared'
import { projectsApi } from '../../api/projects'
import { ApiFout } from '../../api/client'

interface Props {
  projectId: string
  order: Pick<ProductieOrder, 'id' | 'qty' | 'eenheid' | 'aantalGereed' | 'status'>
  /** Gelukt of mislukt: de terminal toont het in zijn eigen melding. */
  onMelding: (kleur: 'green' | 'red', titel: string, bericht: string) => void
}

/**
 * "10 van de 20 zijn klaar" op de laatste stap (besloten 2026-10-02). Zo kan
 * kantoor die 10 op een pakbon zetten zonder zelf iets in te vullen.
 *
 * Het getal is het totaal dat nu klaar is, niet wat erbij kwam: dat is wat je
 * telt als je naar de kist kijkt. Alleen omhoog; lager gaat via kantoor.
 */
export function DeelsGereed({ projectId, order, onMelding }: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [aantal, setAantal] = useState(Math.min(order.qty - 1, order.aantalGereed + 1))
  const reden = waaromNietDeelsGereed(order as ProductieOrder, aantal)

  const meld = useMutation({
    mutationFn: () => projectsApi.meldDeelsGereed(projectId, order.id, aantal),
    onSuccess: () => {
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['projects'] })
      onMelding('green', 'Deels gereedgemeld', `${aantal} van de ${order.qty} ${order.eenheid} staan klaar voor levering. De stap blijft open.`)
    },
    onError: (e) => onMelding(
      'red', 'Deels gereedmelden mislukt',
      `${e instanceof Error ? e.message : 'Onbekende fout'} — ` + (e instanceof ApiFout && e.code === 'TIMEOUT'
        ? 'onbekend of het is opgeslagen; kijk over 10 seconden of het aantal is bijgewerkt.'
        : `er is niets gewijzigd; er staan er nog ${order.aantalGereed} gereed.`),
    ),
  })

  if (!open) {
    return (
      <button className="tr-tbtn" onClick={() => setOpen(true)}>
        deels klaar{order.aantalGereed > 0 ? ` (nu ${order.aantalGereed} van ${order.qty})` : ''}
      </button>
    )
  }

  const zet = (n: number) => setAantal(Math.max(0, Math.min(order.qty - 1, n)))
  return (
    <div className="tr-bevestig">
      <div className="tr-bevestig-t">Hoeveel zijn er nu in totaal klaar?</div>
      <div className="tr-deels">
        <button className="tr-tbtn" onClick={() => zet(aantal - 1)} aria-label="Een minder"><IconMinus size={24} /></button>
        <input
          className="tr-deels-getal"
          inputMode="numeric"
          value={aantal}
          onChange={(e) => zet(Number(e.currentTarget.value.replace(/\D/g, '')) || 0)}
        />
        <span className="tr-deels-van">van {order.qty} {order.eenheid}</span>
        <button className="tr-tbtn" onClick={() => zet(aantal + 1)} aria-label="Een meer"><IconPlus size={24} /></button>
      </div>
      <div className="tr-bevestig-s">
        {reden ?? 'Die stuks kunnen dan op een pakbon. De stap blijft open en de klok loopt door.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <button className="tr-tbtn" onClick={() => setOpen(false)}>
          <IconX size={22} stroke={1.8} /> terug
        </button>
        <button className="tr-tbtn is-primair" disabled={!!reden || meld.isPending} onClick={() => meld.mutate()}>
          <IconCheck size={22} stroke={2.2} />
          {meld.isPending ? 'bezig…' : `ja, ${aantal} klaar`}
        </button>
      </div>
    </div>
  )
}
