import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconFileTypePdf, IconPaperclip, IconX } from '@tabler/icons-react'
import { inkoopBijlagenApi, type BijlageDoel, type InkoopBijlage } from '../../../api/inkoop-bijlagen'
import { meldFout } from '../../../utils/fout-melding-toon'
import { BijlageVenster } from './BijlageVenster'
import './bijlagen.css'

/**
 * Documenten van de leverancier bij een cel (2026-10-09): de offerte bij een
 * aanvraag, of een orderbevestiging bij een inkooporder. Klik = bekijken,
 * ✕ = weghalen, "+ pdf" of een bestand erop slepen = toevoegen.
 */
export function Bijlagen({ bijlagen, doel, wat, leeg = '+ pdf' }: {
  bijlagen: InkoopBijlage[]
  /** Waar een nieuw document bij komt; zonder doel alleen bekijken. */
  doel?: BijlageDoel
  /** "offerte van Van den Berg bij PA-2026-004" — voor de meldingen. */
  wat: string
  leeg?: string
}) {
  const qc = useQueryClient()
  const kiezer = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<InkoopBijlage | null>(null)
  const [erop, setErop] = useState(false)
  const ververs = () => { for (const k of ['inkoop', 'bestel-regels', 'prijsaanvragen']) qc.invalidateQueries({ queryKey: [k] }) }

  const toevoegen = useMutation({
    mutationFn: async (files: File[]) => { for (const f of files) await inkoopBijlagenApi.upload(f, doel!) },
    onSuccess: ververs,
    onError: (fout) => { ververs(); meldFout({ actie: `Document toevoegen: ${wat}`, fout, gevolg: 'Wat hiervoor al stond is bewaard; dit bestand niet. Probeer het opnieuw.' }) },
  })
  const weg = useMutation({
    mutationFn: (b: InkoopBijlage) => inkoopBijlagenApi.verwijder(b.id),
    onSuccess: ververs,
    onError: (fout) => meldFout({ actie: `Document weghalen: ${wat}`, fout, gevolg: 'Het document staat er nog.' }),
  })

  const neem = (lijst: FileList | null) => { if (doel && lijst?.length) toevoegen.mutate([...lijst]) }

  return (
    <span className="ibj" data-erop={erop || undefined} onClick={(e) => e.stopPropagation()}
      onDragOver={(e) => { if (doel) { e.preventDefault(); setErop(true) } }}
      onDragLeave={() => setErop(false)}
      onDrop={(e) => { e.preventDefault(); setErop(false); neem(e.dataTransfer.files) }}>
      {bijlagen.map((b) => (
        <span key={b.id} className="ibj-chip" title={`${b.naam} · ${b.door ?? ''} ${b.createdAt.slice(0, 10)}`}>
          <button type="button" className="ibj-naam" onClick={() => setOpen(b)}>
            <IconFileTypePdf size={13} />{b.naam}
          </button>
          {doel && (
            <button type="button" className="ibj-x" aria-label={`${b.naam} weghalen`}
              onClick={() => { if (window.confirm(`${b.naam} weghalen?`)) weg.mutate(b) }}><IconX size={11} /></button>
          )}
        </span>
      ))}
      {doel && (
        <button type="button" className="ibj-plus" disabled={toevoegen.isPending} onClick={() => kiezer.current?.click()}>
          <IconPaperclip size={12} />{toevoegen.isPending ? 'bezig…' : bijlagen.length ? '+' : leeg}
        </button>
      )}
      {!doel && bijlagen.length === 0 && <span className="ib-sub">—</span>}
      <input ref={kiezer} type="file" hidden multiple accept="application/pdf,image/*,.eml,.msg"
        onChange={(e) => { neem(e.currentTarget.files); e.currentTarget.value = '' }} />
      {open && <BijlageVenster bijlage={open} onSluit={() => setOpen(null)} />}
    </span>
  )
}
