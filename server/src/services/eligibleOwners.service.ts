import prisma from '../prisma'

// GET /api/staff/eligible-owners: the Users who can be made Ticket Owner,
// the active IT Staff and Administrators (BR-21), ordered by name.
export function listEligibleOwners() {
  return prisma.user.findMany({
    where: { isActive: true, role: { in: ['IT_STAFF', 'ADMINISTRATOR'] } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, role: true },
  })
}
