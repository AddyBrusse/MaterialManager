import { ATTACHMENT_KIND_LABELS, type Article } from '../../api/articles'

export interface HistoryEvent {
  when: string
  title: string
  desc?: string
}

/** Derive a chronological history from the article's own timestamps — no separate audit log exists yet. */
export function buildHistory(article: Article): HistoryEvent[] {
  const events: HistoryEvent[] = [
    { when: article.createdAt, title: 'Artikel aangemaakt', desc: article.naam },
  ]
  for (const att of article.attachments) {
    events.push({ when: att.uploadedAt, title: `Bestand toegevoegd: ${att.name}`, desc: ATTACHMENT_KIND_LABELS[att.kind] })
  }
  if (article.estimate?.updatedAt && article.estimate.updatedAt !== article.createdAt) {
    events.push({ when: article.estimate.updatedAt, title: 'Calculatie bijgewerkt' })
  }
  if (article.updatedAt !== article.createdAt) {
    events.push({ when: article.updatedAt, title: 'Artikel bijgewerkt' })
  }
  return events.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function ArticleHistoryTab({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) {
    return <div className="st-empty">Nog geen geschiedenis voor dit artikel.</div>
  }
  return (
    <div className="timeline">
      {events.map((e, i) => (
        <div className="tl-item" key={i}>
          <div className="tl-rail">
            <div className="tl-dot" />
            {i < events.length - 1 && <div className="tl-line" />}
          </div>
          <div className="tl-body">
            <div className="tl-title">{e.title}</div>
            <div className="tl-time">{fmtDateTime(e.when)}</div>
            {e.desc && <div className="tl-desc">{e.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
