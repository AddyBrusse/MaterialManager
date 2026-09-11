import type { MovementKind, MovementReason } from '@stockmanager/shared'
import { apiFetch } from './client'

/**
 * Voorraadmutaties: het logboek van alles wat er met de voorraad gebeurd is.
 *
 * Elke wijziging van `currentStock` hoort hier een regel te hebben — zo is
 * achteraf te zien wie wat wanneer en waarom veranderde. Het afboeken bij het
 * zagen schrijft er één, in dezelfde transactie als de wijziging zelf.
 */
export interface StockMovementRow {
  id: string
  itemType: 'raw' | 'finished'
  itemId: string
  userId: string
  kind: MovementKind
  amount: string | number
  previousStock: string | number
  newStock: string | number
  reason: MovementReason
  note: string | null
  createdAt: string
  user: { id: string; name: string }
}

export const MOVEMENT_REASON_LABELS: Record<MovementReason, string> = {
  received: 'Binnen geboekt',
  used: 'Uitgegeven',
  scrapped: 'Naar schroot',
  correction: 'Correctie',
  other: 'Overig',
}

export const movementsApi = {
  /** Nieuwste eerst; de server geeft er maximaal 200 terug. */
  listVoorItem: (itemId: string) =>
    apiFetch<StockMovementRow[]>(`/movements?itemId=${encodeURIComponent(itemId)}`)
      .then((r) => r.data),
}
