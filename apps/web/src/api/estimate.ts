/**
 * De calculatiekern woont in `@stockmanager/shared` — de API rekent er ook mee
 * (prijssnapshot bij het accepteren van een offerte). Dit bestand blijft
 * bestaan zodat de bestaande schermen hun import niet hoeven te wijzigen.
 */
export {
  computeWeightKg,
  materialCostPerPiece,
  machineRatePerHour,
  buildEstimateCtx,
  machineMinutes,
  computeEstimateTotals,
  minToHm,
} from '@stockmanager/shared'
export type { EstimateCtx, EstimateTotals } from '@stockmanager/shared'
