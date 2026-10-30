import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Role } from '../generated/prisma/client'
import { hashPassword } from '../src/services/passwordHash.service'
import { SEED_TICKETS } from './seedTickets'

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

// The local-development initial password of every seed account
// (Lab 3 specification.md §7.4, documented in the README). It is hashed when
// the seed runs and never stored anywhere else (BR-46).
const SEED_PASSWORD = 'TokTickIT-Lab3!'

// Lab 3 specification.md §7.4: the five Lab 2 Requesters (four active, one
// inactive), four IT Staff (three active, one inactive), and one
// Administrator. Emails are lower-case, as they are stored (BR-06).
const USERS: { name: string; email: string; role: Role; isActive: boolean }[] = [
  { name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th', role: 'REQUESTER', isActive: true },
  { name: 'Nalinee Suksawat', email: 'nalinee.suksawat@kmutt.ac.th', role: 'REQUESTER', isActive: true },
  { name: 'Kittipong Rattanakosin', email: 'kittipong.rattanakosin@kmutt.ac.th', role: 'REQUESTER', isActive: true },
  { name: 'Ploy Wongsawang', email: 'ploy.wongsawang@kmutt.ac.th', role: 'REQUESTER', isActive: true },
  { name: 'Anucha Boonmee', email: 'anucha.boonmee@kmutt.ac.th', role: 'REQUESTER', isActive: false },
  { name: 'Wichai Phromma', email: 'wichai.phromma@kmutt.ac.th', role: 'IT_STAFF', isActive: true },
  { name: 'Siriporn Kaewmanee', email: 'siriporn.kaewmanee@kmutt.ac.th', role: 'IT_STAFF', isActive: true },
  { name: 'Thanakorn Srisuk', email: 'thanakorn.srisuk@kmutt.ac.th', role: 'IT_STAFF', isActive: true },
  { name: 'Pranee Chaiyasit', email: 'pranee.chaiyasit@kmutt.ac.th', role: 'IT_STAFF', isActive: false },
  { name: 'Apinya Thongchai', email: 'apinya.thongchai@kmutt.ac.th', role: 'ADMINISTRATOR', isActive: true },
]

// The reserved block for seed Tickets (Lab 3 specification.md §7.4): the real
// per-year counter never reaches it, so a seed Ticket cannot collide with
// one a Requester created.
const FIRST_SEED_TICKET_NUMBER = 900001

// Creates each seed Ticket whose Ticket Number is absent, together with its
// Public Comments, Internal Notes, and Actions Taken. A Ticket that exists is
// left exactly as it is, entries included (BR-47).
async function seedTickets() {
  const [users, categories, relatedSystems] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.relatedSystem.findMany({ select: { id: true, name: true } }),
  ])
  const userIds = new Map(users.map((user) => [user.email, user.id]))
  const categoryIds = new Map(categories.map((category) => [category.name, category.id]))
  const relatedSystemIds = new Map(relatedSystems.map((system) => [system.name, system.id]))

  const idIn = (ids: Map<string, number>, key: string): number => {
    const id = ids.get(key)
    if (id === undefined) throw new Error(`A seed Ticket refers to "${key}", which the seed does not provide`)
    return id
  }

  for (const [index, ticket] of SEED_TICKETS.entries()) {
    const ticketNumber = `TKT-2026-${FIRST_SEED_TICKET_NUMBER + index}`
    if (await prisma.ticket.findUnique({ where: { ticketNumber } })) continue

    const entries = (list: { author: string; body: string; at: string }[] = []) =>
      list.map((entry) => ({ authorId: idIn(userIds, entry.author), body: entry.body, createdAt: entry.at }))

    await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId: idIn(userIds, ticket.requester),
        categoryId: idIn(categoryIds, ticket.category),
        relatedSystemId: idIn(relatedSystemIds, ticket.relatedSystem),
        summary: ticket.summary,
        description: ticket.description,
        requestedPriority: ticket.requestedPriority,
        itPriority: ticket.itPriority ?? ticket.requestedPriority,
        currentStatus: ticket.status,
        ownerId: ticket.owner ? idIn(userIds, ticket.owner) : null,
        ownerChangedAt: ticket.ownerChangedAt,
        resolutionSummary: ticket.resolutionSummary,
        resolvedAt: ticket.resolvedAt,
        requesterResolvedAt: ticket.requesterResolvedAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        publicComments: { create: entries(ticket.comments) },
        internalNotes: { create: entries(ticket.notes) },
        actionsTaken: {
          create: (ticket.actionsTaken ?? []).map(({ assignee, createdBy, ...action }) => ({
            ...action,
            assigneeId: idIn(userIds, assignee),
            createdById: idIn(userIds, createdBy),
            updatedAt: action.createdAt,
            clientRequestId: randomUUID(),
          })),
        },
      },
    })
  }
}

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

  // An account that already exists is left as a person last saved it
  // (BR-47); one migrated from Lab 2 exists already and keeps its id.
  for (const user of USERS) {
    const account = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    })

    // Only an account with no password yet gets the seed password, so one
    // that has since been changed is never reset (BR-46).
    if (account.passwordHash === null) {
      await prisma.user.update({
        where: { id: account.id },
        data: { passwordHash: await hashPassword(SEED_PASSWORD), mustChangePassword: true },
      })
    }
  }

  await seedTickets()

  const [categories, relatedSystems, users, tickets] = await Promise.all([
    prisma.category.count(),
    prisma.relatedSystem.count(),
    prisma.user.count(),
    prisma.ticket.count(),
  ])
  console.log(
    `Seed complete: ${categories} categories, ${relatedSystems} related systems, ${users} users, ${tickets} tickets.`,
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
