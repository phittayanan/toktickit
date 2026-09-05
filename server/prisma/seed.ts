import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const CATEGORY_NAMES = ['Account and Access', 'Hardware', 'Software', 'Network']

const RELATED_SYSTEM_NAMES = [
  'Email',
  'VPN',
  'Wi-Fi',
  'Learning Management System',
  'Printing',
  'Student Portal',
]

// name/email pairs — 4 active + 1 inactive, per Issue #16's acceptance
// criteria (the inactive one exercises the "excluded everywhere" rules).
const REQUESTER_USERS: { name: string; email: string; isActive: boolean }[] = [
  { name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th', isActive: true },
  { name: 'Nalinee Suksawat', email: 'nalinee.suksawat@kmutt.ac.th', isActive: true },
  { name: 'Kittipong Rattanakosin', email: 'kittipong.rattanakosin@kmutt.ac.th', isActive: true },
  { name: 'Ploy Wongsawang', email: 'ploy.wongsawang@kmutt.ac.th', isActive: true },
  { name: 'Anucha Boonmee', email: 'anucha.boonmee@kmutt.ac.th', isActive: false },
]

async function main() {
  // Sequential everywhere, not Promise.all: keeps insertion order
  // deterministic across machines (matters for Lab 1's ordered-response
  // expectation on Categories, and is just simpler to reason about here).
  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  for (const name of RELATED_SYSTEM_NAMES) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  for (const requester of REQUESTER_USERS) {
    await prisma.requesterUser.upsert({
      where: { email: requester.email },
      update: {},
      create: requester,
    })
  }

  const [categories, relatedSystems, requesters] = await Promise.all([
    prisma.category.count(),
    prisma.relatedSystem.count(),
    prisma.requesterUser.count(),
  ])
  console.log(
    `Seed complete: ${categories} categories, ${relatedSystems} related systems, ${requesters} requester users.`,
  )
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
