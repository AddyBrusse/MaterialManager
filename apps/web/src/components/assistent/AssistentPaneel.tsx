import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { IconSparkles, IconX } from '@tabler/icons-react'
import { assistentApi, type AssistentActie, type AssistentBericht, type ChatBericht } from '../../api/assistent'
import { foutTekst } from '../../utils/fout-melding'
import './assistent.css'

const tijd = (iso: string) => new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Acties({ acties, onKies }: { acties?: AssistentActie[]; onKies: (link: string) => void }) {
  if (!acties?.length) return null
  return (
    <div className="as-acties">
      {acties.map((a) => <button key={a.link} type="button" className="st-btn" onClick={() => onKies(a.link)}>{a.label}</button>)}
    </div>
  )
}

/** Waar de assistent keek: door de server vastgelegd per aanroep, niet wat het model erover zegt. */
function Bronnen({ bronnen }: { bronnen?: string[] }) {
  if (!bronnen?.length) return null
  return (
    <div className="as-bron">
      <span>Bekeken</span>
      <ul>{bronnen.map((b) => <li key={b}>{b}</li>)}</ul>
    </div>
  )
}

/**
 * Het paneel van de assistent (2026-10-09): bovenaan het bericht van het
 * laatste vaste tijdstip, daaronder de chat. Hij leest en stelt voor; een knop
 * opent het scherm waar je het zelf doet. Het gesprek leeft zolang de pagina open is.
 */
export function AssistentPaneel({ naam, bericht, berichtFout, chat, setChat, onSluit }: {
  naam: string
  bericht: AssistentBericht | null | undefined
  berichtFout: unknown
  chat: ChatBericht[]
  setChat: (f: (c: ChatBericht[]) => ChatBericht[]) => void
  onSluit: () => void
}) {
  const navigate = useNavigate()
  const [vraag, setVraag] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  const eind = useRef<HTMLDivElement>(null)
  const kies = (link: string) => { onSluit(); navigate(link) }

  const stuur = useMutation({
    mutationFn: assistentApi.chat,
    onSuccess: (a) => setChat((c) => [...c, { rol: 'assistent', tekst: a.tekst, acties: a.acties, bronnen: a.bronnen }]),
    // Wat/waar/gevolg (CLAUDE.md), in het paneel zelf: daar kijk je op dat moment.
    // De vraag gaat terug in het invoerveld, zodat opnieuw sturen één klik is.
    onError: (f, verstuurd) => {
      const t = foutTekst({ actie: 'Vraag aan de assistent', fout: f, gevolg: 'Er is niets veranderd; je vraag staat weer in het invoerveld.' })
      setFout(`${t.titel}: ${t.wat} ${t.gevolg}`)
      setChat((c) => c.slice(0, -1))
      setVraag(verstuurd[verstuurd.length - 1]?.tekst ?? '')
    },
  })
  useEffect(() => { eind.current?.scrollIntoView({ block: 'end' }) }, [chat.length, stuur.isPending, fout])

  function verstuur() {
    const tekst = vraag.trim()
    if (!tekst || stuur.isPending) return
    const volgende = [...chat, { rol: 'gebruiker' as const, tekst }]
    setChat(() => volgende)
    setVraag('')
    setFout(null)
    stuur.mutate(volgende)
  }

  return (
    <aside className="as-paneel" role="dialog" aria-label="Assistent">
      <div className="as-kop">
        <IconSparkles size={16} />
        <b>Assistent</b>
        <span className="sub">leest mee en stelt voor — wijzigt niets</span>
        <button type="button" className="st-icon-btn sluit" onClick={onSluit} aria-label="Sluiten"><IconX size={16} /></button>
      </div>
      <div className="as-romp">
        {berichtFout ? <div className="as-bericht fout">Het bericht kon niet geladen worden: {(berichtFout as Error).message}</div> : null}
        {bericht && (
          <div className="as-bericht vast">
            <div className="as-meta">Bericht van {tijd(bericht.moment)}{bericht.model ? '' : ' · zonder AI samengesteld'}</div>
            Hé {naam},{'\n'}{bericht.tekst}
            <Acties acties={bericht.acties} onKies={kies} />
          </div>
        )}
        {bericht === null && <div className="as-meta">Het bericht op vaste tijden staat uit (Instellingen → Bedrijf → Assistent).</div>}
        {chat.map((b, i) => (
          <div key={i} className={`as-bericht ${b.rol}`}>
            {b.tekst}
            <Acties acties={b.acties} onKies={kies} />
            <Bronnen bronnen={b.bronnen} />
          </div>
        ))}
        {stuur.isPending && <div className="as-meta">De assistent kijkt het na…</div>}
        {fout && <div className="as-bericht fout">{fout}</div>}
        <div ref={eind} />
      </div>
      <div className="as-voet">
        <textarea className="st-input" rows={2} value={vraag} placeholder="Vraag iets, bijv. “Zijn er vandaag concepten gemaakt?”"
          onChange={(e) => setVraag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); verstuur() } }} />
        <button type="button" className="st-btn primary" disabled={stuur.isPending || !vraag.trim()} onClick={verstuur}>Vraag</button>
      </div>
      <div className="as-uitleg">Wat je vraagt gaat met de gegevens die de assistent erbij zoekt naar Anthropic (Claude).</div>
    </aside>
  )
}
