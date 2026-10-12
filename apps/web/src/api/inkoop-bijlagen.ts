import type { InkoopBijlage } from '@stockmanager/shared'
import { apiFetch, apiUpload } from './client'

export type { InkoopBijlage }

/** Waar een document bij hoort: zijn offerte bij een aanvraag, of los bij een regel of inkooporder. */
export type BijlageDoel =
  | { prijsaanvraagId: string; leverancierId: string }
  | { bestelRegelId: string }
  | { inkooporderId: string }

export const inkoopBijlagenApi = {
  upload: (file: File, doel: BijlageDoel) =>
    apiUpload<InkoopBijlage>('/inkoop-bijlagen', file, doel as Record<string, string>).then((r) => r.data),
  verwijder: (id: string) => apiFetch<{ ok: true }>(`/inkoop-bijlagen/${id}`, { method: 'DELETE' }).then((r) => r.data),
}
