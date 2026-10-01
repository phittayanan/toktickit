import prisma from '../prisma'

// Reference-data reads: active rows only (BR-10), ordered by id for a
// stable, predictable response shape.

export function getActiveCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
}

export function getActiveRelatedSystems() {
  return prisma.relatedSystem.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
}

export function getActiveRequesters() {
  return prisma.user.findMany({
    where: { isActive: true, role: 'REQUESTER' },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, email: true },
  })
}
