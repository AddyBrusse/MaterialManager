import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconX, IconCheck } from '@tabler/icons-react'
import { materiaalPlanApi, stangenTekst, type PlanUitkomst } from '../../api/materiaal-plan'
import { meldFout } from '../../utils/fout-melding-toon'
import { VoorstelKaart } from './keuze/VoorstelKaart'
import './materiaal.css'

const nl = (n: number, d = 0) => n.toLocaleString('nl-NL', { maximumFractionDigits: d })

export interface MateriaalSelectieProps {
  projectId: string
  artikelId: string
  artikelNaam: string
  aantal: number
  /** Wordt afgevinkt als het voorstel vastgelegd is. */
  todoId?: string
  /** De orderregel waar het materiaal voor is — komt op de reservering. */
  offerteRegelId?: string
  calculatieNr: string
  onClose: () => void
}

/**
 * Welke staven zagen we voor deze orderregel? (herzien 2026-10-09)
 *
 * De laderstangen (of zonder lader de stukken) uit het recept en het aantal,
 * tegen de voorraad gelegd: een paar voorstellen, het beste bovenaan. Niets
 * wordt vanzelf vastgelegd — de mens kiest, en kan een rest meteen laten
 * afboeken. Sluiten zonder kiezen laat de todo staan; die opent dit scherm weer.
 */
export function MateriaalSelectieModal(props: MateriaalSelectieProps) {
  const qc = useQueryClient()
  const [keuze, setKeuze] = useState(0)
  const [weg, setWeg] = useState<Set<string>>(new Set())

  const { data, isLoading, error } = useQuery<PlanUitkomst>({
    queryKey: ['materiaal-plan', props.artikelId, props.aantal],
    queryFn: () => materiaalPlanApi.plan({ artikelId: props.artikelId, aantal: props.aantal }),
  })
  const voorstel = data?.voorstellen[keuze]

  const bevestig = useMutation({
    mutationFn: () => {
      const v = voorstel!
      return materiaalPlanApi.bevestig({
        artikelId: props.artikelId, aantal: props.aantal, projectId: props.projectId, calculatieNr: props.calculatieNr,
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
    onSuccess: (uit) => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      qc.invalidateQueries({ queryKey: ['todos'] })
      notifications.show({
        color: 'green', title: 'Materiaal vastgelegd',
        message: `${uit.reserveringen.length} ${uit.reserveringen.length === 1 ? 'staaf' : 'staven'} gereserveerd voor ${props.artikelNaam}`
          + (uit.bestelTodoId ? ' — er staat een bestel-todo klaar voor het tekort' : ''),
      })
      props.onClose()
    },
    onError: (fout) => meldFout({
      actie: `Materiaal vastleggen voor ${props.artikelNaam}`, fout,
      gevolg: 'Er is niets gereserveerd en de todo staat nog open. Kies opnieuw — de voorraad kan intussen veranderd zijn.',
    }),
  })

  const vastleggen = () => {
    if (!voorstel || voorstel.regels.length === 0) {
      notifications.show({
        color: 'orange', title: 'Er ligt niets op voorraad om te reserveren',
        message: 'Bestel het materiaal eerst (Inkoop → Te bestellen). De todo blijft staan, zodat je hier terugkomt als het binnen is.',
      })
      return
    }
    bevestig.mutate()
  }

  const schaal = Math.max(1, ...(data?.kandidaten.map((k) => k.vrijMm) ?? [1]))
  const inVoorstel = new Set(voorstel?.regels.map((r) => r.barId))
  const b = data?.behoefte
  const lader = data?.gebruikt.lader

  return (
    <div className="mk-overlay" onClick={props.onClose}>
      <div className="mk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Materiaal kiezen">
        <div className="mk-kop">
          <b>Materiaal kiezen · {props.artikelNaam} · {props.aantal} st</b>
          {data && <span className="sub">{data.gebruikt.materiaal} · werkstuk {nl(data.gebruikt.werkstukLengteMm, 1)} mm</span>}
          <button type="button" className="st-icon-btn sluit" onClick={props.onClose} aria-label="Sluiten"><IconX size={16} /></button>
        </div>
        {b && (
          <div className="hk-behoefte">
            <span>{lader ? <>Stangenlader <b>{lader.machineNaam}</b> · {b.stuksPerStang} st per volle stang</> : <>Alleen lengte, elk stuk gezaagd</>}</span>
            <span>Nodig: <b>{stangenTekst(b.stangen)}</b></span>
            <span>Totaal te zagen <b>{nl(b.totaalMm)} mm</b> · per stuk <b>{nl(b.perStukMm, 1)} mm</b></span>
            {b.aangevuldTotMin && <span style={{ color: 'var(--warning)' }}>Kortste stang opgerekt tot het minimum van de lader ({nl(lader?.barloaderMinMm ?? 0)} mm)</span>}
          </div>
        )}
        <div className="hk-romp">
          {isLoading && <div className="k">Voorstellen berekenen…</div>}
          {error && <div className="hk-tekort">{error instanceof Error ? error.message : 'Kon geen voorstel maken'}</div>}
          {data && (
            <>
              <div className="hk-voorraad mk-tabel" style={{ border: 0 }}>
                <div className="k" style={{ marginBottom: 4 }}>Vrije voorraad van {data.gebruikt.materiaal}</div>
                <table>
                  <thead><tr><th>Nr.</th><th className="n">Vrij</th><th>Locatie</th><th /></tr></thead>
                  <tbody>
                    {[...data.kandidaten].sort((x, y) => x.vrijMm - y.vrijMm).map((k) => (
                      <tr key={k.id} data-gekozen={inVoorstel.has(k.id) || undefined}>
                        <td className="mono">{k.code}</td>
                        <td className="n">{nl(k.vrijMm)}</td>
                        <td className="dim">{k.locatie ?? '—'}</td>
                        <td>{inVoorstel.has(k.id) && <span className="mk-tag">in voorstel {String.fromCharCode(65 + keuze)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.kandidaten.length === 0 && <div className="voet">Geen vrije staven van dit materiaal.</div>}
                <div className="voet">Rest onder {nl(data.gebruikt.schrootDrempelMm)} mm = schroot: de staaf is daarna op.</div>
              </div>
              <div className="hk-voorstellen">
                {data.voorstellen.map((v, i) => (
                  <VoorstelKaart key={v.sleutel || i} v={v} letter={String.fromCharCode(65 + i)} gekozen={i === keuze}
                    weg={weg} schaalMm={schaal} zaagsnedeMm={data.gebruikt.zaagsnedeMm}
                    onKies={() => setKeuze(i)}
                    onWeg={(id, aan) => setWeg((s) => { const n = new Set(s); if (aan) n.add(id); else n.delete(id); return n })} />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="mk-voet">
          <div className="som">Niets wordt vanzelf vastgelegd. Sluit je zonder kiezen, dan blijft de todo staan en kom je hier later terug.</div>
          <button type="button" className="st-btn" onClick={props.onClose}>Later kiezen</button>
          <button type="button" className="st-btn primary" onClick={vastleggen} disabled={bevestig.isPending}>
            <IconCheck size={14} />{bevestig.isPending ? 'Vastleggen…' : `Gebruik voorstel ${String.fromCharCode(65 + keuze)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
