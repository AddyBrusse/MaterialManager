import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { meldFout } from '../utils/fout-melding-toon'
import {
  articlesApi, inferAttachmentKind, uploadArticleAttachmentFile, deleteArticleAttachmentFile,
  type Article, type ArticleAttachment,
} from '../api/articles'

/**
 * Single source of truth for attaching/removing article files — shared by
 * the Bestanden tab's own dropzone and the whole-article-page drop target
 * (ArtikelDetailPage), so both report the same `uploading` state and never
 * diverge in how an attachment gets built.
 */
export function useArticleAttachmentUpload(article: Article | null) {
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)

  /**
   * De bijlagenlijst opslaan en op de server wachten (2026-10-23). Lukt dat
   * niet, dan een melding: het bestand staat dan wel op de server, maar hangt
   * niet aan het artikel — en dat zie je anders pas als iemand het zoekt.
   */
  async function persist(next: ArticleAttachment[], actie: string, gevolg: string): Promise<boolean> {
    if (!article) return false
    try {
      const nieuw = await articlesApi.opslaan(article.id, { attachments: next })
      qc.setQueryData(['article', article.id], nieuw)
      qc.invalidateQueries({ queryKey: ['articles'] })
      return true
    } catch (fout) {
      meldFout({ actie, fout, gevolg })
      return false
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!article) return
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    const uploaded: ArticleAttachment[] = []
    // Sequential, not parallel — a handful of files for a 4-user shop tool,
    // and it keeps upload order == drop order without id/timestamp races.
    for (const f of list) {
      try {
        const { path, sizeBytes } = await uploadArticleAttachmentFile(article.id, f)
        uploaded.push({
          id: `att_${Date.now()}_${uploaded.length}`,
          kind: inferAttachmentKind(f.name),
          name: f.name,
          sizeBytes,
          machine: null,
          note: null,
          path,
          uploadedAt: new Date().toISOString(),
        })
      } catch (fout) {
        meldFout({ actie: `${f.name} uploaden`, fout, gevolg: 'Dit bestand staat niet bij het artikel; de andere gaan gewoon door.' })
      }
    }
    if (uploaded.length > 0) {
      const gelukt = await persist(
        [...article.attachments, ...uploaded], 'Bestanden aan het artikel hangen',
        'De bestanden staan op de server, maar hangen niet aan het artikel. Voeg ze opnieuw toe.',
      )
      if (gelukt) notifications.show({ message: `${uploaded.length} bestand${uploaded.length === 1 ? '' : 'en'} toegevoegd` })
    }
    setUploading(false)
  }

  function removeAttachment(attId: string) {
    if (!article) return
    const att = article.attachments.find(a => a.id === attId)
    // Het bestand pas weghalen als het artikel er niet meer naar wijst.
    void persist(
      article.attachments.filter(a => a.id !== attId), 'Bestand verwijderen',
      'Het bestand hangt nog aan het artikel; er is niets verwijderd.',
    ).then(gelukt => { if (gelukt && att?.path) deleteArticleAttachmentFile(article.id, att.path) })
  }

  function setMachine(attId: string, machine: string | null) {
    if (!article) return
    void persist(
      article.attachments.map(a => a.id === attId ? { ...a, machine } : a), 'Machine bij een bestand zetten',
      'De machine bij dit bestand is niet opgeslagen.',
    )
  }

  return { uploading, uploadFiles, removeAttachment, setMachine }
}
