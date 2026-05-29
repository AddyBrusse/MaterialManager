import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = [
    { name: 'Admin', role: 'admin' as const },
    { name: 'Addy', role: 'user' as const },
    { name: 'Bart', role: 'user' as const },
    { name: 'Samuel', role: 'user' as const },
    { name: 'Marcel', role: 'user' as const },
  ]

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { name: u.name },
      update: {},
      create: u,
    })
    console.log('Seeded user:', user.name, `(${user.role})`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
