import bcrypt from 'bcrypt'

// BR-07: a password is stored only as a bcrypt hash, cost 12.
const BCRYPT_COST = 12

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}
