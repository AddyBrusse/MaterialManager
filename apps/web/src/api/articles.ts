// Articles = make-to-stock manufactured products (recipe + routing), MES-bound.
// Foundation slice: localStorage-mock store (same pattern as reservations.ts).
// The data model leaves room for routing detail, production runs and time tracking,
// which are NOT built yet.

const LS_KEY = 'sm_articles'

// The raw blank that one finished piece is made from. References the real
// grade/profile taxonomy (grades.ts / profiles.ts) so it can later feed the
// saw pipeline (calculator → reservations → planner → zaagflow).
export interface ArticleRecipe {
  profileId: string
  gradeId: string
  dimensions: Record<string, number> // matches profile.dimensionSchema, e.g. { diameter: 80 }
  lengthPerPieceMm: number           // raw length consumed per finished piece
}

// One routing step. Foundation only stores the type (tag); machine/times are
// MES-future and intentionally left out for now.
export interface ArticleOperation {
  id: string
  type: string // 'draaien' | 'frezen' | 'boren' | 'zagen' | custom
}

// Setup-sheet attachment. METADATA ONLY in the mock phase: we record what the
// file is, not its bytes. `path` is filled once a backend/uploads dir exists.
export type AttachmentKind = 'nc' | 'image' | 'drawing' | 'document' | 'other'
export interface ArticleAttachment {
  id: string
  kind: AttachmentKind
  name: string
  sizeBytes: number | null
  machine: string | null   // NC files: 'DMG' | 'Doosan' | null
  note: string | null
  path: string | null      // future: filesystem path served from /uploads
  uploadedAt: string
}

// Free-text setup notes shown on the setup sheet.
export interface ArticleSetupNotes {
  workholding: string      // opspanning
  general: string          // algemeen
}

// ── Calculator / estimate (routing + costing) ───────────────────────────────
// A machining step under a machine node (per-piece cycle time only;
// setup is once per machine node, not per step).
export interface EstimateStep {
  id: string
  name: string
  cycleMin: number   // per piece
}
export type EstimateNodeType = 'material' | 'machine' | 'external'
export interface EstimateNode {
  id: string
  type: EstimateNodeType
  name: string
  // material:
  gradeId?: string | null
  profileId?: string | null     // overrides recipe profile (shape)
  dimensions?: Record<string, number> | null // overrides recipe dimensions (size)
  lengthMm?: number | null      // raw length consumed per piece (defaults from recipe)
  qty?: number                  // aantal (material/external)
  costOverride?: number | null  // € per piece, overrides computed material cost
  // machine:
  machineId?: string | null
  setupMin?: number       // one-time setup for this machine node
  rateOverride?: number | null // € per uur, overrides machine + operator rate
  steps?: EstimateStep[]
  // external:
  externalCost?: number | null  // € per piece
  note?: string | null          // spec / omschrijving
}
export interface ArticleEstimate {
  marginPct: number
  nodes: EstimateNode[]
  updatedAt: string
}

export interface Article {
  id: string                 // ART-NNNN
  naam: string
  klant: string | null
  relatieId: string | null
  contactId: string | null   // chosen contact within relatie.contacten
  tekening: string | null
  rev: string | null
  drawingPath: string | null // PDF — viewer deferred
  photoPath: string | null
  recipe: ArticleRecipe | null
  operations: ArticleOperation[]
  notes: ArticleSetupNotes
  attachments: ArticleAttachment[]
  estimate: ArticleEstimate | null
  locatie: string | null
  currentStock: number
  minStock: number | null
  maxStock: number | null
  createdAt: string
  updatedAt: string
}

export const NC_MACHINES = ['DMG', 'Doosan'] as const

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  nc: 'NC-programma', image: 'Foto', drawing: 'Tekening', document: 'Document', other: 'Overig',
}

// Infer attachment kind from a filename extension.
export function inferAttachmentKind(filename: string): AttachmentKind {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (['nc', 'tap', 'mpf', 'eia', 'gcode', 'ngc', 'ptp', 'h'].includes(ext)) return 'nc'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'drawing'
  if (['doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'step', 'stp', 'dxf'].includes(ext)) return 'document'
  return 'other'
}

export const KNOWN_OPERATIONS: { id: string; name: string }[] = [
  { id: 'zagen',   name: 'Zagen'   },
  { id: 'draaien', name: 'Draaien' },
  { id: 'frezen',  name: 'Frezen'  },
  { id: 'boren',   name: 'Boren'   },
  { id: 'extern',  name: 'Extern'  },
]

function ops(...types: string[]): ArticleOperation[] {
  return types.map((t, i) => ({ id: `op_${i}_${t}`, type: t }))
}

// ── Seed data ───────────────────────────────────────────────────────────────
// Mapped from the original mockup, with structured recipes referencing real
// grade ids (grades.ts) and profile ids (profiles.ts). ART-0004 (square tube /
// "koker" — no matching profile yet) intentionally has no recipe to exercise
// the "Geen recept" empty state.
const SEED_DATE = '2026-05-01T08:00:00Z'
function seed(): Article[] {
  const base = (a: Partial<Article> & Pick<Article, 'id' | 'naam'>): Article => ({
    klant: null, relatieId: null, contactId: null, tekening: null, rev: null, drawingPath: null, photoPath: null,
    recipe: null, operations: [], notes: { workholding: '', general: '' }, attachments: [],
    estimate: null, locatie: null, currentStock: 0, minStock: null, maxStock: null,
    createdAt: SEED_DATE, updatedAt: SEED_DATE, ...a,
  })
  const att = (
    kind: ArticleAttachment['kind'], name: string, sizeBytes: number, machine: string | null = null,
  ): ArticleAttachment => ({
    id: `att_${name}`, kind, name, sizeBytes, machine, note: null, path: null, uploadedAt: SEED_DATE,
  })
  return [
    base({ id: 'ART-0001', naam: 'Beugel links M16', klant: 'Bosch Rexroth', tekening: 'BRX-2214', rev: 'B',
      operations: ops('frezen', 'boren'), locatie: 'Hal A · Kast 1', currentStock: 24, minStock: 10, maxStock: 40,
      recipe: { profileId: 'p3', gradeId: 'g3', dimensions: { width: 100, height: 10 }, lengthPerPieceMm: 120 } }),
    base({ id: 'ART-0002', naam: 'Flens DN50', klant: 'Tata Steel NL', tekening: 'TS-F50-04', rev: 'A',
      operations: ops('draaien'), locatie: 'Hal A · Kast 2', currentStock: 3, minStock: 8, maxStock: 20,
      recipe: { profileId: 'p1', gradeId: 'g1', dimensions: { diameter: 80 }, lengthPerPieceMm: 40 },
      notes: {
        workholding: 'Driebekklauw, zachte bekken Ø80. Uitsteek max. 35 mm i.v.m. trillingen.',
        general: 'Afbramen na boren. Visuele controle pasvlak.',
      },
      attachments: [
        att('nc', 'FLENS-DN50-DRAAIEN.mpf', 14820, 'DMG'),
        att('nc', 'FLENS-DN50-DOOSAN.eia', 13110, 'Doosan'),
        att('drawing', 'TS-F50-04_revA.pdf', 184320),
        att('image', 'opspanning-flens.jpg', 642000),
      ] }),
    base({ id: 'ART-0003', naam: 'Dekplaat 200×50', klant: 'Damen Shipyards', tekening: 'DS-3312-C', rev: 'C',
      operations: ops('zagen', 'frezen'), locatie: 'Hal B · Vak 4', currentStock: 0, minStock: 5, maxStock: 15,
      recipe: { profileId: 'p3', gradeId: 'g3', dimensions: { width: 200, height: 20 }, lengthPerPieceMm: 50 } }),
    base({ id: 'ART-0004', naam: 'Steun frame LH', klant: 'Bosch Rexroth', tekening: 'BRX-3301', rev: 'A',
      operations: ops('zagen', 'frezen', 'boren'), locatie: 'Hal C · Buiten', currentStock: 18, minStock: 5, maxStock: 30,
      recipe: null }),
    base({ id: 'ART-0005', naam: 'Adapter ring Ø120', klant: 'Siemens Energy', tekening: 'SE-ADR-07', rev: 'D',
      operations: ops('draaien', 'boren'), locatie: 'Hal A · Kast 3', currentStock: 7, minStock: 4, maxStock: 12,
      recipe: { profileId: 'p1', gradeId: 'g3', dimensions: { diameter: 130 }, lengthPerPieceMm: 60 } }),
    base({ id: 'ART-0006', naam: 'Geleiderail 800 mm', klant: 'Damen Shipyards', tekening: 'DS-GR800', rev: 'B',
      operations: ops('frezen'), locatie: 'Hal B · Vak 8', currentStock: 12, minStock: 6, maxStock: 24,
      recipe: { profileId: 'p3', gradeId: 'g1', dimensions: { width: 40, height: 8 }, lengthPerPieceMm: 800 } }),
    base({ id: 'ART-0007', naam: 'Spruitstuk 3×DN25', klant: 'Siemens Energy', tekening: 'SE-SPR-03', rev: 'A',
      operations: ops('draaien', 'frezen', 'boren'), locatie: 'Hal A · Kast 1', currentStock: 2, minStock: 3, maxStock: 10,
      recipe: { profileId: 'p1', gradeId: 'g3', dimensions: { diameter: 60 }, lengthPerPieceMm: 90 } }),
  ]
}

function load(): Article[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Article>[]
      // Normalise older records that predate newer fields.
      return parsed.map(a => ({
        notes: { workholding: '', general: '' },
        attachments: [],
        estimate: null,
        relatieId: null,
        contactId: null,
        ...a,
      } as Article))
    }
  } catch {}
  const initial = seed()
  save(initial)
  return initial
}

function save(data: Article[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

/** Next ART-NNNN from existing rows: max numeric part + 1, zero-padded to 4. */
export function nextArtNo(rows: Article[]): string {
  const nums = rows.map(r => parseInt(r.id.replace(/\D/g, ''), 10)).filter(n => !isNaN(n))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `ART-${String(next).padStart(4, '0')}`
}

export type ArticleInput = Omit<Article, 'id' | 'createdAt' | 'updatedAt'>

export const articlesApi = {
  list: (): Article[] => load(),

  get: (id: string): Article | null => load().find(a => a.id === id) ?? null,

  create: (input: ArticleInput): Article => {
    const rows = load()
    const now = new Date().toISOString()
    const item: Article = { ...input, id: nextArtNo(rows), createdAt: now, updatedAt: now }
    save([...rows, item])
    return item
  },

  update: (id: string, patch: Partial<ArticleInput>): Article => {
    const rows = load()
    const existing = rows.find(a => a.id === id)
    if (!existing) throw new Error('Artikel niet gevonden')
    const updated: Article = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    save(rows.map(a => a.id === id ? updated : a))
    return updated
  },

  remove: (id: string): void => {
    save(load().filter(a => a.id !== id))
  },
}
