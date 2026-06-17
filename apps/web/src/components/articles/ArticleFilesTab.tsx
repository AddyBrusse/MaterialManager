import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Select } from '@mantine/core'
import {
  IconFileCode, IconPhoto, IconFileText, IconPaperclip, IconTrash, IconUpload,
} from '@tabler/icons-react'
import {
  articlesApi, inferAttachmentKind, NC_MACHINES, ATTACHMENT_KIND_LABELS,
  type Article, type ArticleAttachment, type AttachmentKind,
} from '../../api/articles'
import { useUserStore } from '../../stores/user'

function fmtSize(b: number | null): string {
  if (b == null) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

const KIND_ICON: Record<AttachmentKind, React.ReactNode> = {
  nc: <IconFileCode size={16} />, image: <IconPhoto size={16} />,
  drawing: <IconFileText size={16} />, document: <IconFileText size={16} />, other: <IconPaperclip size={16} />,
}

export function ArticleFilesTab({ article }: { article: Article }) {
  const qc = useQueryClient()
  const isAdmin = useUserStore(s => s.user?.role === 'admin')
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function saveAttachments(next: ArticleAttachment[]) {
    articlesApi.update(article.id, { attachments: next })
    qc.invalidateQueries({ queryKey: ['articles'] })
  }
  function onFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return
    const added: ArticleAttachment[] = Array.from(files).map((f, i) => ({
      id: `att_${Date.now()}_${i}`,
      kind: inferAttachmentKind(f.name),
      name: f.name,
      sizeBytes: f.size,
      machine: null,
      note: null,
      path: null, // metadata only — bytes uploaded once the backend exists
      uploadedAt: new Date().toISOString(),
    }))
    saveAttachments([...article.attachments, ...added])
    if (fileRef.current) fileRef.current.value = ''
  }
  function setMachine(attId: string, machine: string | null) {
    saveAttachments(article.attachments.map(a => a.id === attId ? { ...a, machine } : a))
  }
  function removeAttachment(attId: string) {
    saveAttachments(article.attachments.filter(a => a.id !== attId))
  }

  // group attachments for display
  const ncByMachine = new Map<string, ArticleAttachment[]>()
  const otherGroups: Record<string, ArticleAttachment[]> = { image: [], drawing: [], document: [], other: [] }
  for (const a of article.attachments) {
    if (a.kind === 'nc') {
      const k = a.machine ?? '—'
      if (!ncByMachine.has(k)) ncByMachine.set(k, [])
      ncByMachine.get(k)!.push(a)
    } else {
      otherGroups[a.kind].push(a)
    }
  }

  function AttRow({ a, showMachine }: { a: ArticleAttachment; showMachine?: boolean }) {
    return (
      <div className="art-att-row">
        <span className="art-att-icon">{KIND_ICON[a.kind]}</span>
        <span className="art-att-name">{a.name}</span>
        {a.sizeBytes != null && <span className="art-att-size">{fmtSize(a.sizeBytes)}</span>}
        {showMachine && isAdmin && (
          <Select
            size="xs" placeholder="Machine" w={110} clearable
            data={NC_MACHINES.map(m => ({ value: m, label: m }))}
            value={a.machine}
            onChange={v => setMachine(a.id, v)}
          />
        )}
        {showMachine && !isAdmin && a.machine && <span className="st-badge info">{a.machine}</span>}
        {isAdmin && (
          <button className="st-icon-btn danger" title="Verwijderen" onClick={() => removeAttachment(a.id)}>
            <IconTrash size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="st-grid-2" style={{ marginBottom: 16 }}>
        <div>
          <div className="art-note-lbl">Opspanning</div>
          <div className="art-note-body">{article.notes.workholding || <span className="cell-muted">—</span>}</div>
        </div>
        <div>
          <div className="art-note-lbl">Algemene notities</div>
          <div className="art-note-body">{article.notes.general || <span className="cell-muted">—</span>}</div>
        </div>
      </div>

      {isAdmin && (
        <div
          className={`art-dropzone${dragOver ? ' over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); onFilesPicked(e.dataTransfer.files) }}
        >
          <input ref={fileRef} type="file" multiple hidden onChange={e => onFilesPicked(e.target.files)} />
          <IconUpload size={18} />
          <span>Sleep bestanden hierheen of klik om te uploaden</span>
        </div>
      )}

      {article.attachments.length === 0 ? (
        <div className="cell-muted" style={{ fontSize: 13, marginTop: 12 }}>Nog geen bestanden gekoppeld.</div>
      ) : (
        <div className="art-att-groups" style={{ marginTop: 14 }}>
          {ncByMachine.size > 0 && (
            <div>
              <div className="art-att-grouptitle">NC-programma's</div>
              {[...ncByMachine.entries()].map(([machine, list]) => (
                <div key={machine} style={{ marginBottom: 4 }}>
                  <div className="art-att-machine">{machine === '—' ? 'Geen machine' : machine}</div>
                  {list.map(a => <AttRow key={a.id} a={a} showMachine />)}
                </div>
              ))}
            </div>
          )}
          {(['drawing', 'image', 'document', 'other'] as AttachmentKind[]).map(kind =>
            otherGroups[kind].length > 0 && (
              <div key={kind}>
                <div className="art-att-grouptitle">{ATTACHMENT_KIND_LABELS[kind]}</div>
                {otherGroups[kind].map(a => <AttRow key={a.id} a={a} />)}
              </div>
            )
          )}
        </div>
      )}
      <div className="cell-muted" style={{ fontSize: 11, marginTop: 12 }}>
        Bestanden worden nu als verwijzing (naam/grootte) opgeslagen — de echte upload volgt met de server.
      </div>
    </div>
  )
}
