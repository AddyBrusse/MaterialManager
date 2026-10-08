import { useState } from 'react'
import { notifications } from '@mantine/notifications'
import type { Blokkade, Herberekening } from '@stockmanager/shared'
import { planningApi } from '../../api/planning'
import { herlaadProjecten } from '../../api/projects'
import { seinPlanning } from '../../utils/planning-sein'
import { foutTekst } from '../../utils/fout-melding'
import type { OrderEffect, Samenvatting } from '../../utils/auto-planning'
import { dagKort } from '../planning-tabel/tabel-logica'

interface Props {
  herberekening: Herberekening | null
  aanleiding: string
  samenvatting: Samenvatting
  geenMachine: string[]
}

/**
 * De melding na automatisch plannen (2026-10-08): wat er ingepland is, of de
 * levering gehaald wordt, wat er voor andere orders verschoof — en ongedaan
 * maken. Houdt de werkvloer dat tegen, dan staat in deze melding wat er
 * gebeurde, en is het met één klik te wissen.
 */
let vorige: string | null = null

export function toonPlanningMelding(p: Props): void {
  // Eén planningsmelding tegelijk: alleen de nieuwste kan terug, en bij elke
  // sleep een nieuwe stapel meldingen helpt niemand. Hij blijft staan tot hij
  // weggeklikt wordt of de volgende komt; terug kan ook via "Laatste".
  if (vorige) notifications.hide(vorige)
  const id = `planning-${p.herberekening?.id ?? Date.now()}`
  vorige = id
  notifications.show({
    id, autoClose: p.herberekening ? false : 6_000, withCloseButton: true,
    title: p.herberekening ? `Planning herberekend · ${p.aanleiding}` : `Planning ongewijzigd · ${p.aanleiding}`,
    message: <MeldingInhoud {...p} />,
  })
}

const MAX = 5

function regel(e: OrderEffect, metOud: boolean) {
  const lev = e.levering ? ` · levering ${dagKort(e.levering)}` : ''
  const stand = e.nieuwTeLaat > 0
    ? <b style={{ color: 'var(--danger)' }}>{e.nieuwTeLaat} wd te laat</b>
    : <b style={{ color: 'var(--success, #2b8a3e)' }}>{e.levering ? 'haalt de levering' : 'geen leverdatum'}</b>
  return (
    <li key={e.orderId}>
      {e.orderId} · {e.artikel}: {metOud && e.oudEind ? `${dagKort(e.oudEind)} → ` : 'klaar '}{dagKort(e.nieuwEind)}{lev} — {stand}
    </li>
  )
}

function MeldingInhoud({ herberekening, samenvatting: s, geenMachine }: Props) {
  const [stand, setStand] = useState<'klaar' | 'bezig' | 'terug' | 'blokkade'>('klaar')
  const [blokkades, setBlokkades] = useState<Blokkade[]>([])
  const [fout, setFout] = useState<string | null>(null)

  const terug = async (wis: boolean) => {
    if (!herberekening) return
    setStand('bezig'); setFout(null)
    try {
      if (!wis) {
        const b = await planningApi.blokkades(herberekening.id)
        if (b.length) { setBlokkades(b); setStand('blokkade'); return }
      }
      await planningApi.ongedaan(herberekening.id, wis)
      await herlaadProjecten()
      seinPlanning()
      setStand('terug')
    } catch (e) {
      const t = foutTekst({ actie: 'Planning ongedaan maken', fout: e, gevolg: 'Er is niets teruggezet: ongedaan maken gebeurt helemaal of niet.' })
      setFout(`${t.wat} ${t.gevolg}`)
      setStand(blokkades.length ? 'blokkade' : 'klaar')
    }
  }

  if (stand === 'terug') return <div style={{ fontSize: 12 }}>Teruggezet: de planning staat weer zoals vóór deze berekening.</div>
  const verloren = blokkades.filter((b) => b.soort === 'gestart').reduce((t, b) => t + (b.seconden ?? 0), 0)

  return (
    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
      {s.ingepland.length > 0 && <ul style={{ margin: '2px 0', paddingLeft: 16 }}>{s.ingepland.slice(0, MAX).map((e) => regel(e, false))}</ul>}
      {s.later.length > 0 && (
        <>
          <div style={{ marginTop: 4 }}>Gevolgen voor andere orders:</div>
          <ul style={{ margin: '2px 0', paddingLeft: 16 }}>{s.later.slice(0, MAX).map((e) => regel(e, true))}</ul>
          {s.later.length > MAX && <div style={{ color: 'var(--text-3)' }}>… en nog {s.later.length - MAX} later</div>}
        </>
      )}
      {s.eerder.length > 0 && <div style={{ color: 'var(--text-3)' }}>{s.eerder.length === 1 ? '1 order komt' : `${s.eerder.length} orders komen`} eerder klaar.</div>}
      {!s.ingepland.length && !s.later.length && !s.eerder.length && <div>Geen order verschuift.</div>}
      {s.teLaat > 0 && <div style={{ marginTop: 4, color: 'var(--danger)' }}>In totaal {s.teLaat === 1 ? 'haalt 1 order zijn' : `halen ${s.teLaat} orders hun`} levering niet.</div>}
      {geenMachine.slice(0, 3).map((r) => <div key={r} style={{ color: 'var(--warning)' }}>{r}</div>)}

      {stand === 'blokkade' && (
        <div style={{ marginTop: 6, padding: 6, border: '1px solid var(--border)', borderRadius: 5 }}>
          <b>Ongedaan maken kan niet zomaar — sindsdien gebeurde er dit:</b>
          <ul style={{ margin: '2px 0', paddingLeft: 16 }}>{blokkades.map((b) => <li key={b.soort + b.stapId}>{b.tekst}</li>)}</ul>
          <div style={{ color: 'var(--text-3)' }}>
            Wissen zet dit terug en daarna de planning
            {verloren > 0 ? `; de gemeten tijd (${Math.round(verloren / 60)} min) gaat verloren` : ''}
            {blokkades.some((b) => b.soort === 'gereed') ? '; een afgeboekte zaagbon gaat terug op voorraad' : ''}.
          </div>
        </div>
      )}
      {fout && <div style={{ marginTop: 4, color: 'var(--danger)' }}>{fout}</div>}
      {herberekening && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {stand === 'blokkade'
            ? <button className="st-btn sm danger" disabled={stand !== 'blokkade'} onClick={() => terug(true)}>Wis dit en zet alles terug</button>
            : <button className="st-btn sm" disabled={stand === 'bezig'} onClick={() => terug(false)}>{stand === 'bezig' ? 'Bezig…' : 'Ongedaan maken'}</button>}
        </div>
      )}
    </div>
  )
}
