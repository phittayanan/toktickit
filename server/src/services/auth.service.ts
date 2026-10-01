import type { User } from '../../generated/prisma/client'
import { now } from '../clock'
import prisma from '../prisma'
import type { ChangePasswordInput } from '../schemas/auth.schema'
import { clearFailedLogins, loginRefusedUntil, recordFailedLogin } from './loginThrottle.service'
import { hashPassword, verifyPassword } from './passwordHash.service'
import { firstUnmetPasswordRule, type PasswordRule } from './passwordPolicy.service'
import { createSession } from './session.service'

// What the authentication endpoints return about a user (api-spec.md §1.7).
export function toUserIdentity(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
}

// BR-06: an email is trimmed and lower-cased before it is compared.
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export type LoginResult =
  | { outcome: 'SIGNED_IN'; user: User; sessionToken: string }
  | { outcome: 'INVALID_CREDENTIALS' }
  | { outcome: 'ACCOUNT_INACTIVE' }
  | { outcome: 'THROTTLED'; retryAfterSeconds: number }

export async function login(rawEmail: string, password: string): Promise<LoginResult> {
  const email = normaliseEmail(rawEmail)

  // BR-12: the password is not checked while the email is refused.
  const refusedUntil = await loginRefusedUntil(email)
  if (refusedUntil) {
    return { outcome: 'THROTTLED', retryAfterSeconds: Math.ceil((refusedUntil.getTime() - now().getTime()) / 1000) }
  }

  const user = await prisma.user.findUnique({ where: { email } })

  if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) {
    await recordFailedLogin(email)
    return { outcome: 'INVALID_CREDENTIALS' }
  }

  // BR-11: said only once the password has proved correct. It neither
  // counts as a failure nor clears the ones recorded.
  if (!user.isActive) {
    return { outcome: 'ACCOUNT_INACTIVE' }
  }

  await clearFailedLogins(email)

  return { outcome: 'SIGNED_IN', user, sessionToken: await createSession(user.id) }
}

// What to tell a user whose new password breaks a BR-08 rule.
const PASSWORD_RULE_MESSAGES: Record<PasswordRule, string> = {
  MIN_LENGTH: 'Password must be at least 8 characters.',
  MAX_LENGTH: 'Password must be at most 72 characters.',
  MAX_BYTES: 'Password must be at most 72 bytes.',
  UPPER_CASE: 'Password must include an upper-case letter.',
  LOWER_CASE: 'Password must include a lower-case letter.',
  DIGIT: 'Password must include a number.',
  SPECIAL: 'Password must include a special character.',
}

export type ChangePasswordResult =
  | { outcome: 'CHANGED'; user: User; sessionToken: string }
  | { outcome: 'REJECTED'; field: keyof ChangePasswordInput; message: string }

function rejected(field: keyof ChangePasswordInput, message: string): ChangePasswordResult {
  return { outcome: 'REJECTED', field, message }
}

// BR-09: needs the current password; saves the new one, clears the
// must-change flag, and ends every session the user has, the caller's
// continuing under a new value. A rejected change leaves all of it as it
// was (BR-08, AC-08).
export async function changePassword(user: User, input: ChangePasswordInput): Promise<ChangePasswordResult> {
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return rejected('currentPassword', 'Current password is incorrect.')
  }

  const unmetRule = firstUnmetPasswordRule(input.newPassword)
  if (unmetRule) {
    return rejected('newPassword', PASSWORD_RULE_MESSAGES[unmetRule])
  }
  if (input.newPassword === input.currentPassword) {
    return rejected('newPassword', 'New password must differ from the current password.')
  }
  if (input.confirmPassword !== input.newPassword) {
    return rejected('confirmPassword', 'Confirmation does not match the new password.')
  }

  const passwordHash = await hashPassword(input.newPassword)

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    })
    await tx.session.deleteMany({ where: { userId: user.id } })

    return { outcome: 'CHANGED', user: updated, sessionToken: await createSession(user.id, tx) }
  })
}
