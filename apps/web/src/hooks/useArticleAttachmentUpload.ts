import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
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

  function persist(next: ArticleAttachment[]) {
    if (!article) return
    articlesApi.update(article.id, { attachments: next })
    qc.invalidateQueries({ queryKey: ['articles'] })
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
      } catch {
        notifications.show({ color: 'red', message: `Uploaden mislukt: ${f.name}` })
      }
    }
    if (uploaded.length > 0) {
      persist([...article.attachments, ...uploaded])
      notifications.show({ message: `${uploaded.length} bestand${uploaded.length === 1 ? '' : 'en'} toegevoegd` })
    }
    setUploading(false)
  }

  function removeAttachment(attId: string) {
    if (!article) return
    const att = article.attachments.find(a => a.id === attId)
    persist(article.attachments.filter(a => a.id !== attId))
    if (att?.path) deleteArticleAttachmentFile(article.id, att.path)
  }

  function setMachine(attId: string, machine: string | null) {
    if (!article) return
    persist(article.attachments.map(a => a.id === attId ? { ...a, machine } : a))
  }

  return { uploading, uploadFiles, removeAttachment, setMachine }
}
