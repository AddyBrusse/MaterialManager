import { prisma } from '../db/client'

const BATCH_SIZE = 10

export async function reserveLabelBatch(userId: string): Promise<string[]> {
  const last = await prisma.label.findFirst({ orderBy: { number: 'desc' } })
  const lastNum = last ? parseInt(last.number.slice(1), 10) : 0

  const batchId = crypto.randomUUID()
  const now = new Date()

  const numbers: string[] = []
  for (let i = 1; i <= BATCH_SIZE; i++) {
    numbers.push(`#${String(lastNum + i).padStart(5, '0')}`)
  }

  await prisma.label.createMany({
    data: numbers.map((number) => ({
      number,
      batchId,
      status: 'printed_unused' as const,
      printedAt: now,
      printedById: userId,
    })),
  })

  return numbers
}
