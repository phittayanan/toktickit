import { createHash, randomBytes } from 'node:crypto'
import type { Prisma, User } from '../../generated/prisma/client'
import { now } from '../clock'
import prisma from '../prisma'

// BR-13: a session unused for 8 hours is expired.
const IDLE_MS = 8 * 60 * 60 * 1000

// The database holds only a hash of the cookie value, so a leaked table
// cannot be replayed as live cookies (ADR-0007).
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function expiryFrom(time: Date): Date {
  return new Date(time.getTime() + IDLE_MS)
}

// Starts a session for the user and returns the opaque value the cookie
// carries: 32 random bytes, so it holds no user data (ADR-0007).
export async function createSession(userId: number, db: Prisma.TransactionClient = prisma): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const time = now()

  await db.session.create({
    data: { tokenHash: hashToken(token), userId, lastSeenAt: time, expiresAt: expiryFrom(time) },
  })

  return token
}

// The user a cookie value signs in, or null when it refers to no session,
// to one left unused for 8 hours, or to a user who is no longer active.
// Using a session moves its expiry forward (BR-13).
export async function findSessionUser(token: string): Promise<User | null> {
  const time = now()
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })

  if (!session || session.expiresAt <= time || !session.user.isActive) {
    return null
  }

  // updateMany, so a session ended by another request meanwhile is not an
  // error here.
  await prisma.session.updateMany({
    where: { id: session.id },
    data: { lastSeenAt: time, expiresAt: expiryFrom(time) },
  })

  return session.user
}

// BR-14: logout deletes the session. Deleting one that is already gone is
// not an error, so logout is safe to repeat.
export async function endSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}
