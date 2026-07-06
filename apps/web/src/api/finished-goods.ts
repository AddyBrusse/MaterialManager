import { apiFetch } from './client'

export type FinishedGoodRow = {
  id: string
  artNo: string
  name: string
  customer: string | null
  minStock: string | null
  currentStock: string
  createdAt: string
  updatedAt: string
}

export const finishedGoodsApi = {
  list: () => apiFetch<FinishedGoodRow[]>('/finished-goods'),
}
