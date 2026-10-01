import { Prisma } from '../../generated/prisma/client'
import { now } from '../clock'
import prisma from '../prisma'
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from '../schemas/userAdmin.schema'
import { generateInitialPassword } from './initialPassword.service'
import { hashPassword } from './passwordHash.service'

// A finished Ticket is Closed or Cancelled; every other one is unfinished.
const UNFINISHED = { currentStatus: { notIn: ['CLOSED', 'CANCELLED'] } } satisfies Prisma.TicketWhereInput

// What User Management reads about a user: the row, and how many unfinished
// Tickets they own (BR-25).
const adminUserQuery = {
  include: { _count: { select: { ownedTickets: { where: UNFINISHED } } } },
} satisfies Prisma.UserDefaultArgs

type UserWithOwnedCount = Prisma.UserGetPayload<typeof adminUserQuery>

// `AdminUser` (api-spec.md §7). The password hash never leaves the server
// (BR-07); only whether there is one does.
function toAdminUser(user: UserWithOwnedCount) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    hasPassword: user.passwordHash !== null,
    ownedUnfinishedTicketCount: user._count.ownedTickets,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export type AdminUser = ReturnType<typeof toAdminUser>

// Prisma passes a `contains` value to LIKE as it is, so the characters
// LIKE reads as wildcards are escaped: a search for `%` finds a `%`.
function literal(search: string): string {
  return search.replace(/[\\%_]/g, '\\$&')
}

// api-spec.md §7.1: every user, active or not, ordered by name then id.
// `search` matches a part of the name or of the email, in any letter case.
export async function listUsers({ search, role }: ListUsersQuery): Promise<AdminUser[]> {
  const users = await prisma.user.findMany({
    ...adminUserQuery,
    where: {
      role,
      ...(search === undefined
        ? {}
        : {
            OR: [
              { name: { contains: literal(search), mode: 'insensitive' } },
              { email: { contains: literal(search), mode: 'insensitive' } },
            ],
          }),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })

  return users.map(toAdminUser)
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export type CreateUserResult =
  | { outcome: 'CREATED'; user: AdminUser; initialPassword: string }
  | { outcome: 'EMAIL_TAKEN' }

// BR-38: the user is created with a generated Initial Password, stored
// only as its hash, and must change it. The password is returned to the
// caller once and kept nowhere.
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  // BR-06: the email is already lower-cased, as every stored one is, so
  // this compares against all users, active or not, in any letter case.
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    return { outcome: 'EMAIL_TAKEN' }
  }

  const initialPassword = generateInitialPassword()

  try {
    const user = await prisma.user.create({
      ...adminUserQuery,
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        isActive: input.isActive,
        passwordHash: await hashPassword(initialPassword),
        mustChangePassword: true,
      },
    })

    return { outcome: 'CREATED', user: toAdminUser(user), initialPassword }
  } catch (err) {
    // Another request took the email between the check and the insert.
    if (isUniqueViolation(err)) return { outcome: 'EMAIL_TAKEN' }
    throw err
  }
}

// A path id that can be a User id: a positive integer the column can hold.
// Anything else names no user.
const MAX_ID = 2147483647

function parseUserId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null

  const id = Number(raw)
  return id <= MAX_ID ? id : null
}

// The id of the user a path id names, or null when it names none.
export async function findUserId(raw: string): Promise<number | null> {
  const id = parseUserId(raw)
  if (id === null) return null

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  return user?.id ?? null
}

export type UpdateUserResult =
  | { outcome: 'UPDATED'; user: AdminUser; unassignedTicketCount: number }
  | { outcome: 'NOT_FOUND' | 'EMAIL_TAKEN' | 'SELF_DEACTIVATION' | 'LAST_ADMINISTRATOR' }

// api-spec.md §7.3: the checks and every effect of the change run in one
// transaction, so a refused change leaves nothing behind. `actingUserId`
// is the Administrator making the change.
export async function updateUser(
  userId: number,
  actingUserId: number,
  input: UpdateUserInput,
): Promise<UpdateUserResult> {
  try {
    return await prisma.$transaction(async (tx): Promise<UpdateUserResult> => {
      const deactivating = input.isActive === false

      // BR-41 is decided on the Administrators that are active once every
      // change ahead of this one has landed: a change that could take one
      // away first locks them, in id order, so two such changes made at
      // the same moment are judged one after the other.
      const activeAdministrators =
        deactivating || (input.role !== undefined && input.role !== 'ADMINISTRATOR')
          ? await tx.$queryRaw<{ id: number }[]>`
              SELECT "id" FROM "User"
              WHERE "role" = 'ADMINISTRATOR' AND "isActive"
              ORDER BY "id"
              FOR UPDATE`
          : []

      const target = await tx.user.findUnique({ where: { id: userId } })
      if (!target) return { outcome: 'NOT_FOUND' }

      const roleChanging = input.role !== undefined && input.role !== target.role

      // BR-06: the email may not belong to another user, active or not.
      if (input.email !== undefined) {
        const holder = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })
        if (holder && holder.id !== userId) return { outcome: 'EMAIL_TAKEN' }
      }

      // BR-40
      if (deactivating && userId === actingUserId) return { outcome: 'SELF_DEACTIVATION' }

      // BR-41: the change may not leave the system with no active
      // Administrator.
      const isActiveAdministrator = target.role === 'ADMINISTRATOR' && target.isActive
      if (
        isActiveAdministrator &&
        (deactivating || roleChanging) &&
        !activeAdministrators.some((administrator) => administrator.id !== userId)
      ) {
        return { outcome: 'LAST_ADMINISTRATOR' }
      }

      await tx.user.update({
        where: { id: userId },
        data: { name: input.name, email: input.email, role: input.role, isActive: input.isActive },
      })

      // BR-14: nobody keeps working under a role they no longer hold, or
      // an account that is no longer active.
      if (deactivating || roleChanging) {
        await tx.session.deleteMany({ where: { userId } })
      }

      // BR-25: a user who can no longer be a Ticket Owner hands their
      // unfinished Tickets back to the queue, status unchanged. Finished
      // Tickets keep them as the historical owner.
      let unassignedTicketCount = 0
      if (deactivating || (roleChanging && input.role === 'REQUESTER')) {
        const unassigned = await tx.ticket.updateMany({
          where: { ownerId: userId, ...UNFINISHED },
          data: { ownerId: null, ownerChangedAt: now() },
        })
        unassignedTicketCount = unassigned.count
      }

      const user = await tx.user.findUniqueOrThrow({ ...adminUserQuery, where: { id: userId } })
      return { outcome: 'UPDATED', user: toAdminUser(user), unassignedTicketCount }
    })
  } catch (err) {
    // Another request took the email between the check and the update.
    if (isUniqueViolation(err)) return { outcome: 'EMAIL_TAKEN' }
    throw err
  }
}

export type SetInitialPasswordResult =
  | { outcome: 'SET'; initialPassword: string }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'SELF_INITIAL_PASSWORD' }

// BR-39: replaces the user's password with a new Initial Password that
// they must change, and ends their sessions, in one transaction. An
// Administrator cannot do this to their own account; they use Change
// Password.
export async function setInitialPassword(userId: number, actingUserId: number): Promise<SetInitialPasswordResult> {
  if (userId === actingUserId) return { outcome: 'SELF_INITIAL_PASSWORD' }

  const initialPassword = generateInitialPassword()
  const passwordHash = await hashPassword(initialPassword)

  return prisma.$transaction(async (tx): Promise<SetInitialPasswordResult> => {
    const updated = await tx.user.updateMany({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
    })
    if (updated.count === 0) return { outcome: 'NOT_FOUND' }

    await tx.session.deleteMany({ where: { userId } })

    return { outcome: 'SET', initialPassword }
  })
}
