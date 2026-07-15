import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { ProjectSchema, type Project, type ProductieOrder, type ProductieStap } from '@stockmanager/shared'

const prisma = new PrismaClient()

// Date helpers (relative to "today" so the risk/hold scenarios stay meaningful whenever this is run)

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function daysFromNow(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

async function seedUsers() {
  const users = [
    { name: 'Admin', role: 'admin' as const },
    { name: 'Addy', role: 'user' as const },
    { name: 'Bart', role: 'user' as const },
    { name: 'Samuel', role: 'user' as const },
    { name: 'Marcel', role: 'user' as const },
  ]
  for (const u of users) {
    const user = await prisma.user.upsert({ where: { name: u.name }, update: {}, create: u })
    console.log('Seeded user:', user.name, `(${user.role})`)
  }
}

// Machines - real names/behavior from the Wachtrij design handoff

const MACHINES = [
  { id: 'mach-amada-zaag', name: 'Amada Zaag', machineRatePerHour: 55, operatorRatePerHour: 45, defaultSetupMin: 10, worksWeekends: true },
  { id: 'mach-dmg-450tc', name: 'DMG 450TC EcoLine', machineRatePerHour: 85, operatorRatePerHour: 55, defaultSetupMin: 20, worksWeekends: false },
  { id: 'mach-dmg-dmu50', name: 'DMG DMU50 Ecoline', machineRatePerHour: 95, operatorRatePerHour: 55, defaultSetupMin: 25, worksWeekends: false },
  { id: 'mach-doosan-lynx', name: 'Doosan LYNX 2100 LSYB', machineRatePerHour: 80, operatorRatePerHour: 55, defaultSetupMin: 20, worksWeekends: false },
  { id: 'mach-haas-vf4', name: 'Haas VF4 SS', machineRatePerHour: 75, operatorRatePerHour: 55, defaultSetupMin: 20, worksWeekends: false },
] as const

async function seedMachines() {
  for (const m of MACHINES) {
    await prisma.machine.upsert({
      where: { id: m.id },
      update: { name: m.name, machineRatePerHour: m.machineRatePerHour, operatorRatePerHour: m.operatorRatePerHour, defaultSetupMin: m.defaultSetupMin, worksWeekends: m.worksWeekends },
      create: m,
    })
    console.log('Seeded machine:', m.name)
  }
}

// Wachtrij test projects.
// Six scenarios chosen to exercise every code path in planningQueueUtils.ts:
//   TEST-A  pure backlog (no machine assignment at all)
//   TEST-B  cross-machine group (zagen -> lassen, two steps of one order on
//           two different machines, consecutive volgorde) - connectors,
//           group badge, and the cascade-confirm check when reordering zagen
//   TEST-C  a notBefore hold (material lead time) - ghost block + lock icon
//   TEST-D  at-risk: tight deadline behind other work in a machine's queue
//   TEST-E  normal on-time queued work, generous deadline
//   TEST-F  extra Amada Zaag queue filler so TEST-B's queue has real
//           multi-item ranking to reorder, not just one entry

function stap(overrides: Partial<ProductieStap> & Pick<ProductieStap, 'id' | 'volgorde' | 'naam' | 'machine'>): ProductieStap {
  return {
    gereedOp: null,
    gereedDoor: null,
    geplandDatum: null,
    geplandMachine: null,
    queuePosition: null,
    notBefore: null,
    ...overrides,
  }
}

function order(overrides: Partial<ProductieOrder> & Pick<ProductieOrder, 'id' | 'projectId' | 'artikelNaam' | 'stappen'>): ProductieOrder {
  const now = new Date().toISOString()
  return {
    offerteRegelId: `${overrides.id}-regel`,
    artikelId: null,
    qty: 1,
    eenheid: 'stuks',
    status: 'gepland',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function project(overrides: Partial<Project> & Pick<Project, 'id' | 'naam' | 'productieOrders'>): Project {
  const now = new Date().toISOString()
  return {
    relatieId: null,
    contactId: null,
    klantRef: null,
    status: 'productie',
    levertijdDatum: null,
    notities: '',
    offertes: [],
    opdrachtbevestiging: null,
    paklijst: null,
    factuur: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function buildTestProjects(): Project[] {
  const projects: Project[] = []

  // TEST-A - pure backlog: has a default (suggested) machine from its
  // routing but was never dropped into a queue (geplandDatum/queuePosition null).
  projects.push(project({
    id: 'TEST-A-2026', naam: 'Van Dijk Metaal - flens 80mm', klantRef: 'Van Dijk Metaal',
    levertijdDatum: daysFromNow(29),
    productieOrders: [
      order({
        id: 'TEST-A-ORD', projectId: 'TEST-A-2026', artikelNaam: 'Flens 80mm', qty: 12,
        stappen: [stap({ id: 'TEST-A-S1', volgorde: 1, naam: 'zagen', machine: 'Amada Zaag' })],
      }),
    ],
  }))

  // TEST-B - cross-machine group: zagen (Amada Zaag) -> lassen (Doosan LYNX
  // 2100 LSYB), consecutive volgorde on the same order. Both queued.
  projects.push(project({
    id: 'TEST-B-2026', naam: 'Meijer Industrie - beugel L-vorm', klantRef: 'Meijer Industrie',
    levertijdDatum: daysFromNow(18),
    productieOrders: [
      order({
        id: 'TEST-B-ORD', projectId: 'TEST-B-2026', artikelNaam: 'Beugel L-vorm', qty: 40,
        stappen: [
          stap({
            id: 'TEST-B-S1', volgorde: 1, naam: 'zagen', machine: 'Amada Zaag',
            geplandDatum: daysFromNow(0), geplandMachine: 'Amada Zaag', queuePosition: 2000,
          }),
          stap({
            id: 'TEST-B-S2', volgorde: 2, naam: 'lassen', machine: 'Doosan LYNX 2100 LSYB',
            geplandDatum: daysFromNow(0), geplandMachine: 'Doosan LYNX 2100 LSYB', queuePosition: 1000,
          }),
        ],
      }),
    ],
  }))

  // TEST-C - notBefore hold: material lead time pushes the real start well
  // past where the queue would otherwise place it.
  projects.push(project({
    id: 'TEST-C-2026', naam: 'Hoekstra Precisie - bracket set', klantRef: 'Hoekstra Precisie',
    levertijdDatum: daysFromNow(25),
    productieOrders: [
      order({
        id: 'TEST-C-ORD', projectId: 'TEST-C-2026', artikelNaam: 'Bracket set', qty: 8,
        stappen: [
          stap({
            id: 'TEST-C-S1', volgorde: 1, naam: 'frezen', machine: 'DMG DMU50 Ecoline',
            geplandDatum: daysFromNow(0), geplandMachine: 'DMG DMU50 Ecoline', queuePosition: 1000,
            notBefore: daysFromNow(9),
          }),
        ],
      }),
    ],
  }))

  // TEST-D - at risk: long job, tight deadline, queued behind other work.
  projects.push(project({
    id: 'TEST-D-2026', naam: 'Bakker Staal - deksel klein', klantRef: 'Bakker Staal',
    levertijdDatum: daysFromNow(2),
    productieOrders: [
      order({
        id: 'TEST-D-ORD', projectId: 'TEST-D-2026', artikelNaam: 'Deksel klein', qty: 60,
        stappen: [
          stap({
            id: 'TEST-D-S1', volgorde: 1, naam: 'draaien', machine: 'Haas VF4 SS',
            geplandDatum: daysFromNow(0), geplandMachine: 'Haas VF4 SS', queuePosition: 3000,
          }),
        ],
      }),
    ],
  }))
  // Filler ahead of TEST-D on the same machine so its queue position alone
  // (not just its own duration) is what pushes it past the deadline.
  projects.push(project({
    id: 'TEST-D2-2026', naam: 'De Groot Vormtechniek - consolebeugel', klantRef: 'De Groot Vormtechniek',
    levertijdDatum: daysFromNow(20),
    productieOrders: [
      order({
        id: 'TEST-D2-ORD', projectId: 'TEST-D2-2026', artikelNaam: 'Consolebeugel', qty: 25,
        stappen: [
          stap({
            id: 'TEST-D2-S1', volgorde: 1, naam: 'draaien', machine: 'Haas VF4 SS',
            geplandDatum: daysFromNow(0), geplandMachine: 'Haas VF4 SS', queuePosition: 1000,
          }),
        ],
      }),
    ],
  }))

  // TEST-E - normal on-time queued work, generous deadline.
  projects.push(project({
    id: 'TEST-E-2026', naam: 'Smit Werktuigbouw - mal onderdeel', klantRef: 'Smit Werktuigbouw',
    levertijdDatum: daysFromNow(35),
    productieOrders: [
      order({
        id: 'TEST-E-ORD', projectId: 'TEST-E-2026', artikelNaam: 'Mal onderdeel', qty: 4,
        stappen: [
          stap({
            id: 'TEST-E-S1', volgorde: 1, naam: 'frezen', machine: 'DMG 450TC EcoLine',
            geplandDatum: daysFromNow(0), geplandMachine: 'DMG 450TC EcoLine', queuePosition: 1000,
          }),
        ],
      }),
    ],
  }))

  // TEST-F - extra Amada Zaag queue filler ahead of TEST-B's zagen step, so
  // that machine's Wachtrij has a real multi-item order to reorder/drag.
  projects.push(project({
    id: 'TEST-F-2026', naam: 'Vermeer Plaatwerk - hoekprofiel', klantRef: 'Vermeer Plaatwerk',
    levertijdDatum: daysFromNow(15),
    productieOrders: [
      order({
        id: 'TEST-F-ORD', projectId: 'TEST-F-2026', artikelNaam: 'Hoekprofiel', qty: 100,
        stappen: [
          stap({
            id: 'TEST-F-S1', volgorde: 1, naam: 'zagen', machine: 'Amada Zaag',
            geplandDatum: daysFromNow(0), geplandMachine: 'Amada Zaag', queuePosition: 1000,
          }),
        ],
      }),
    ],
  }))

  return projects
}

async function seedProjects() {
  const projects = buildTestProjects()
  for (const p of projects) {
    ProjectSchema.parse(p)
    await prisma.project.upsert({
      where: { id: p.id },
      update: {
        naam: p.naam, relatieId: p.relatieId, contactId: p.contactId, klantRef: p.klantRef,
        status: p.status, levertijdDatum: p.levertijdDatum, notities: p.notities,
        offertes: p.offertes as object[], opdrachtbevestiging: (p.opdrachtbevestiging as object) ?? null,
        productieOrders: p.productieOrders as object[], paklijst: (p.paklijst as object) ?? null,
        factuur: (p.factuur as object) ?? null,
      },
      create: {
        id: p.id, naam: p.naam, relatieId: p.relatieId, contactId: p.contactId, klantRef: p.klantRef,
        status: p.status, levertijdDatum: p.levertijdDatum, notities: p.notities,
        offertes: p.offertes as object[], productieOrders: p.productieOrders as object[],
      },
    })
    console.log('Seeded test project:', p.id, '-', p.naam)
  }
}

async function main() {
  await seedUsers()
  await seedMachines()
  await seedProjects()
}

main().catch(console.error).finally(() => prisma.$disconnect())
