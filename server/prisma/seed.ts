import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const CATEGORY_NAMES = ['Account and Access', 'Hardware', 'Software', 'Network']

async function main() {
  const before = await prisma.category.count()

  // Sequential, not Promise.all: keeps insertion order deterministic across
  // machines, which matters for the "predictable order" requirement in
  // GET /api/categories (Issue #4).
  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  const after = await prisma.category.count()
  console.log(`Categories: ${after} total, ${after - before} created this run.`)
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
