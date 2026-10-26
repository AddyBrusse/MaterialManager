import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconX, IconCheck } from '@tabler/icons-react'
import { materiaalPlanApi, type PlanRegel, type PlanUitkomst, type Voorstel } from '../../api/materiaal-plan'
import { meldFout } from '../../utils/fout-melding-toon'
import { RegelKeuze, dekkingTekst } from './keuze/RegelKeuze'
import './materiaal.css'

const nl = (n: number, d = 0) => n.toLocaleString('nl-NL', { maximumFractionDigits: d })
const letter = (i: number) => String.fromCharCode(65 + i)

interface MateriaalSelectieProps {
  projectId: string
  artikelId: string
  artikelNaam: string
  aantal: number
  /** Wordt afgevinkt als elke materiaalregel geregeld is. */
  todoId?: string
  /** De orderregel waar het materiaal voor is — komt op de reservering. */
  offerteRegelId?: string
  calculatieNr: string
  /** Elke materiaalregel geregeld, vóór `onClose` (in productie geven gaat dan verder). */
  onVastgelegd?: () => void
  /** Tekst van de knop om te sluiten zonder te kiezen. */
  sluitTekst?: string
  /** Wat er gebeurt als je sluit zonder te kiezen — voor de onderregel. */
  sluitUitleg?: string
  onClose: () => void
}

const nogOpen = (r: PlanRegel) => !r.fout && !r.dekking.klaar

/**
 * Welke staven zagen we voor deze orderregel? (herzien 2026-10-09, per
 * materiaalregel sinds 2026-10-23)
 *
 * Per materiaalregel van het artikel de laderstangen (of zonder lader de
 * stukken) tegen de voorraad gelegd: een paar voorstellen, het beste bovenaan.
 * Elke regel wordt apart vastgelegd; daarna springt het venster naar de
 * volgende, en de todo gaat pas dicht als alles geregeld is. Niets wordt
 * vanzelf vastgelegd. Sluiten zonder kiezen laat de todo staan.
 */
export function MateriaalSelectieModal(props: MateriaalSelectieProps) {
  const qc = useQueryClient()
  const [actief, setActief] = useState<number | null>(null)
  const [keuze, setKeuze] = useState(0)
  const [weg, setWeg] = useState<Set<string>>(new Set())

  const sleutel = ['materiaal-plan', props.artikelId, props.aantal, props.projectId, props.offerteRegelId]
  const { data, isLoading, error } = useQuery<PlanUitkomst>({
    queryKey: sleutel,
    queryFn: () => materiaalPlanApi.plan({
      artikelId: props.artikelId, aantal: props.aantal, projectId: props.projectId, offerteRegelId: props.offerteRegelId,
    }),
  })
  const regels = data?.regels ?? []
  // Standaard de eerste regel waar nog iets te kiezen is.
  const index = actief ?? Math.max(0, regels.findIndex(nogOpen))
  const regel = regels[index]
  const voorstel = regel?.voorstellen[keuze]
  const kiesRegel = (i: number | null) => { setActief(i); setKeuze(0); setWeg(new Set()) }

  const bevestig = useMutation({
    mutationFn: ({ regel, v }: { regel: PlanRegel; v: Voorstel }) => {
      return materiaalPlanApi.bevestig({
        artikelId: props.artikelId, aantal: props.aantal, projectId: props.projectId, calculatieNr: props.calculatieNr,
        materiaalRegelId: regel.regelId,
        regels: v.regels.map((r) => ({
          barId: r.barId, stangen: r.stangen, stuks: r.stuks, verbruikMm: r.verbruikMm,
          // Een rest onder de schrootgrens is "staaf op": die gaat bij het afboeken mee.
          restAfboeken: r.restWordtSchroot || weg.has(r.barId),
        })),
        todoId: props.todoId,
        offerteRegelId: props.offerteRegelId,
        tekort: v.tekortStuks > 0 ? { stuks: v.tekortStuks, mm: v.tekortMm } : undefined,
      })
    },
    onSuccess: async (uit, { regel, v }) => {
      for (const k of ['reservations', 'raw-materials', 'todos', 'materiaal-dekking', 'bestellingen',
        'materiaal-stand', 'projects', 'inkoop', 'bestel-regels', 'meldingen']) {
        void qc.invalidateQueries({ queryKey: [k] })
      }
      const n = uit.reserveringen.length
      const nog = uit.dekking.filter((d) => !d.klaar).length
      notifications.show({
        color: 'green', title: `Materiaal vastgelegd · ${regel.materiaal}`,
        message: [
          n > 0 ? `${n} ${n === 1 ? 'staaf' : 'staven'} gereserveerd voor ${props.artikelNaam}` : null,
          v.tekortStuks > 0 ? 'het tekort staat op de bestellijst' : null,
          nog > 0 ? `nog ${nog} ${nog === 1 ? 'materiaalregel' : 'materiaalregels'} te kiezen` : null,
        ].filter(Boolean).join(' — '),
      })
      if (nog === 0) { props.onVastgelegd?.(); props.onClose(); return }
      await qc.refetchQueries({ queryKey: sleutel })
      kiesRegel(null)
    },
    onError: (fout, { regel }) => meldFout({
      actie: `Materiaal vastleggen voor ${props.artikelNaam} (${regel.materiaal})`, fout,
      gevolg: 'Voor deze materiaalregel is niets gereserveerd en niets besteld; de todo staat nog open. Kies opnieuw — de voorraad kan intussen veranderd zijn.',
    }),
  })

  const volgende = regels.findIndex((r, i) => i !== index && nogOpen(r))
  const knop = !regel ? null
    : regel.fout ? 'Eerst de calculatie aanvullen'
    : !regel.behoefte ? (volgende >= 0 ? `Naar ${regels[volgende].materiaal}` : 'Sluiten')
    : voorstel && voorstel.regels.length === 0 ? 'Op bestellijst zetten'
    : `Gebruik voorstel ${letter(keuze)}`
  const doeKnop = () => {
    if (!regel) return
    if (regel.fout) {
      notifications.show({ color: 'orange', title: 'Deze materiaalregel is niet compleet', message: `${regel.fout}. Er is niets vastgelegd.` })
      return
    }
    if (!regel.behoefte) {
      if (volgende >= 0) { kiesRegel(volgende); return }
      // Niets meer te kiezen: alles geregeld (een regel die niet compleet is, telt als open).
      if (!regels.some(nogOpen) && !regels.some((r) => r.fout)) props.onVastgelegd?.()
      props.onClose()
      return
    }
    if (!voorstel) return
    bevestig.mutate({ regel, v: voorstel })
  }

  const meer = regels.length > 1 || (data?.exoten.length ?? 0) > 0
  return (
    <div className="mk-overlay" onClick={props.onClose}>
      <div className="mk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Materiaal kiezen">
        <div className="mk-kop">
          <b>Materiaal kiezen · {props.artikelNaam} · {props.aantal} st</b>
          {regel && <span className="sub">{regel.materiaal} · werkstuk {nl(regel.gebruikt.werkstukLengteMm, 1)} mm</span>}
          <button type="button" className="st-icon-btn sluit" onClick={props.onClose} aria-label="Sluiten"><IconX size={16} /></button>
        </div>
        {meer && (
          <div className="hk-strook" role="tablist" aria-label="Materiaalregels">
            {regels.map((r, i) => (
              <button key={r.regelId ?? i} type="button" role="tab" aria-selected={i === index}
                className="hk-strook-regel" data-actief={i === index || undefined}
                data-stand={r.fout ? 'fout' : r.dekking.klaar ? 'klaar' : 'open'} onClick={() => kiesRegel(i)}>
                <b>{r.materiaal || r.naam}</b>
                <span>{r.fout ? 'niet compleet' : dekkingTekst(r)}</span>
              </button>
            ))}
            {data?.exoten.map((x) => (
              <span key={x} className="hk-strook-regel" data-stand="exoot" title="Op maat besteld: komt via de bestelling en wordt bij ontvangst gereserveerd">
                <b>{x}</b><span>exoot · via de bestelling</span>
              </span>
            ))}
          </div>
        )}
        {isLoading && <div className="hk-romp"><div className="k">Voorstellen berekenen…</div></div>}
        {error && <div className="hk-romp"><div className="hk-tekort">{error instanceof Error ? error.message : 'Kon geen voorstel maken'}</div></div>}
        {data && regels.length === 0 && (
          <div className="hk-romp"><div className="hk-klaar">Dit artikel heeft alleen exoten: die komen via de bestelling binnen en worden dan gereserveerd. Er valt niets uit de voorraad te kiezen.</div></div>
        )}
        {regel && (
          <RegelKeuze regel={regel} keuze={keuze} weg={weg} onKies={setKeuze}
            onWeg={(id, aan) => setWeg((s) => { const n = new Set(s); if (aan) n.add(id); else n.delete(id); return n })} />
        )}
        <div className="mk-voet">
          <div className="som">{props.sluitUitleg ?? 'Niets wordt vanzelf vastgelegd. Sluit je zonder kiezen, dan blijft de todo staan en kom je hier later terug.'}</div>
          <button type="button" className="st-btn" onClick={props.onClose}>{props.sluitTekst ?? 'Later kiezen'}</button>
          {knop && (
            <button type="button" className="st-btn primary" onClick={doeKnop} disabled={bevestig.isPending}>
              <IconCheck size={14} />{bevestig.isPending ? 'Vastleggen…' : knop}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
