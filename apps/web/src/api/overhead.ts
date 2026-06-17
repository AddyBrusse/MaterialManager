// Overhead cost calculator — shop-level and per-machine cost breakdown.
// Stored in localStorage; no backend required in the current phase.

const LS_KEY = 'sm_overhead'

// ── Shop-level config ─────────────────────────────────────────────────────────
export interface ShopConfig {
  // Floor & building
  totalFloorM2: number
  annualRentEur: number
  annualInsuranceEur: number            // general/building/liability insurance
  annualBuildingMaintenanceEur: number  // building upkeep (roof, HVAC, cleaning…)
  // Staff overhead
  annualStaffOverheadEur: number        // indirect staff (management, admin, HR)
  // Electricity
  electricityRateKwh: number            // peak tariff (day shift)
  electricityDalRateKwh: number         // off-peak / dal tariff (nights, weekends)
  // Working calendar
  weeksPerYear: number
  daysPerWeek: number
  hoursPerDay: number                   // default shift length; machines can override
}

// ── Per-machine inputs ────────────────────────────────────────────────────────
export interface MachineOverheadRow {
  machineId: string
  floorM2: number
  powerKw: number
  purchasePrice: number
  usefulLifeYears: number
  maintenanceHoursPerYear: number   // planned maintenance hours/year (service visits, downtime)
  maintenanceCostPerHour: number    // cost per maintenance hour (technician + parts, €/hr)
  annualMachineInsuranceEur: number
  utilizationPct: number
  hoursPerDayOverride: number | null
}

// ── Computed result per machine ───────────────────────────────────────────────
export interface MachineOverheadResult {
  machineId: string
  availableHours: number
  productiveHours: number
  depreciationPerHour: number
  housingPerHour: number          // rent + building insurance + building maintenance, by floor%
  powerPerHour: number            // blended peak/dal based on shift hours
  maintenancePerHour: number
  machineInsurancePerHour: number
  staffCostsPerHour: number       // indirect staff, split equally across machines
  totalOverheadPerHour: number
}

export interface OverheadConfig {
  shop: ShopConfig
  machines: MachineOverheadRow[]
}

// ── Defaults ──────────────────────────────────────────────────────────────────
export const DEFAULT_SHOP: ShopConfig = {
  totalFloorM2: 500,
  annualRentEur: 48000,
  annualInsuranceEur: 0,
  annualBuildingMaintenanceEur: 0,
  annualStaffOverheadEur: 0,
  electricityRateKwh: 0.22,
  electricityDalRateKwh: 0.12,
  weeksPerYear: 52,
  daysPerWeek: 5,
  hoursPerDay: 8,
}

export const DEFAULT_MACHINE_ROW: Omit<MachineOverheadRow, 'machineId'> = {
  floorM2: 20,
  powerKw: 15,
  purchasePrice: 80000,
  usefulLifeYears: 5,
  maintenanceHoursPerYear: 40,   // ~1 week/year planned service
  maintenanceCostPerHour: 80,    // typical service technician rate
  annualMachineInsuranceEur: 0,
  utilizationPct: 70,
  hoursPerDayOverride: null,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function shopAnnualHours(shop: ShopConfig): number {
  return shop.weeksPerYear * shop.daysPerWeek * shop.hoursPerDay
}

export function machineAvailableHours(row: MachineOverheadRow, shop: ShopConfig): number {
  const hpd = row.hoursPerDayOverride != null && row.hoursPerDayOverride > 0
    ? row.hoursPerDayOverride
    : shop.hoursPerDay
  return shop.weeksPerYear * shop.daysPerWeek * hpd
}

// ── Core calculation ──────────────────────────────────────────────────────────
export function computeMachineOverhead(
  row: MachineOverheadRow,
  shop: ShopConfig,
  machineCount: number,      // for equal-share staff allocation
): MachineOverheadResult {
  const effectiveHpd    = row.hoursPerDayOverride != null && row.hoursPerDayOverride > 0
    ? row.hoursPerDayOverride : shop.hoursPerDay
  const availableHours  = shop.weeksPerYear * shop.daysPerWeek * effectiveHpd
  const productiveHours = availableHours * (Math.min(100, Math.max(0, row.utilizationPct)) / 100)
  const safe            = productiveHours > 0 ? productiveHours : 1

  // Depreciation
  const depreciationPerHour = row.usefulLifeYears > 0
    ? (row.purchasePrice / row.usefulLifeYears) / safe
    : 0

  // Housing (rent + building insurance + building maintenance) — by floor space %
  const annualHousing     = shop.annualRentEur + shop.annualInsuranceEur + shop.annualBuildingMaintenanceEur
  const shopRatePerM2     = shop.totalFloorM2 > 0 ? annualHousing / shop.totalFloorM2 : 0
  const housingPerHour    = (row.floorM2 * shopRatePerM2) / safe

  // Electricity — blend peak/dal based on hours beyond standard shift
  const stdHpd     = shop.hoursPerDay
  const normalHrs  = shop.weeksPerYear * shop.daysPerWeek * Math.min(effectiveHpd, stdHpd)
  const dalHrs     = shop.weeksPerYear * shop.daysPerWeek * Math.max(0, effectiveHpd - stdHpd)
  const annualPower = row.powerKw * (normalHrs * shop.electricityRateKwh + dalHrs * shop.electricityDalRateKwh)
  const powerPerHour = annualPower / safe

  // Machine maintenance: hours × cost per hour, spread over productive hours
  const annualMaintenanceCost = (row.maintenanceHoursPerYear ?? 0) * (row.maintenanceCostPerHour ?? 0)
  const maintenancePerHour    = annualMaintenanceCost / safe

  // Machine insurance
  const machineInsurancePerHour = row.annualMachineInsuranceEur / safe

  // Staff overhead — equal share per machine
  const safeCount = machineCount > 0 ? machineCount : 1
  const staffCostsPerHour = shop.annualStaffOverheadEur / safeCount / safe

  const totalOverheadPerHour =
    depreciationPerHour + housingPerHour + powerPerHour +
    maintenancePerHour + machineInsurancePerHour + staffCostsPerHour

  return {
    machineId: row.machineId,
    availableHours,
    productiveHours,
    depreciationPerHour,
    housingPerHour,
    powerPerHour,
    maintenancePerHour,
    machineInsurancePerHour,
    staffCostsPerHour,
    totalOverheadPerHour,
  }
}

// ── localStorage store ────────────────────────────────────────────────────────
function load(): OverheadConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as any
      // migrate v1: flat annualHours → weeksPerYear/daysPerWeek/hoursPerDay
      if (parsed.shop && 'annualHours' in parsed.shop) {
        parsed.shop.weeksPerYear = 52
        parsed.shop.daysPerWeek  = 5
        parsed.shop.hoursPerDay  = 8
        delete parsed.shop.annualHours
      }
      // migrate machine rows: normalize all fields, handle any undefined/NaN stored values
      if (Array.isArray(parsed.machines)) {
        parsed.machines = parsed.machines.map((m: any) => {
          const base: any = { hoursPerDayOverride: null, annualMachineInsuranceEur: 0, ...m }
          // v3: maintenancePct → maintenanceHoursPerYear + maintenanceCostPerHour
          if (typeof base.maintenancePct === 'number') {
            const annualCost = (base.purchasePrice ?? 80000) * (base.maintenancePct / 100)
            base.maintenanceCostPerHour  = 80
            base.maintenanceHoursPerYear = Math.round(annualCost / 80)
            delete base.maintenancePct
          }
          // ensure all numeric fields are valid numbers (guard against undefined/NaN from bad storage)
          const num = (v: unknown, def: number) =>
            (typeof v === 'number' && !isNaN(v)) ? v : def
          base.maintenanceHoursPerYear   = num(base.maintenanceHoursPerYear, 40)
          base.maintenanceCostPerHour    = num(base.maintenanceCostPerHour, 80)
          base.annualMachineInsuranceEur = num(base.annualMachineInsuranceEur, 0)
          base.utilizationPct            = num(base.utilizationPct, 70)
          base.purchasePrice             = num(base.purchasePrice, 0)
          base.usefulLifeYears           = num(base.usefulLifeYears, 5)
          base.floorM2                   = num(base.floorM2, 0)
          base.powerKw                   = num(base.powerKw, 0)
          return base
        })
      }
      return {
        shop:     { ...DEFAULT_SHOP,     ...(parsed.shop     ?? {}) },
        machines: Array.isArray(parsed.machines) ? parsed.machines : [],
      }
    }
  } catch {}
  return { shop: { ...DEFAULT_SHOP }, machines: [] }
}

function save(data: OverheadConfig): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

export const overheadApi = { load, save }
