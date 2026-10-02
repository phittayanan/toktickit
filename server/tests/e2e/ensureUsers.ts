import 'dotenv/config'
import prisma from '../../src/prisma'
import { hashPassword } from '../../src/services/passwordHash.service'
import type { Role } from '../../generated/prisma/client'

// Creates the users the Playwright suites sign in as, directly in the
// database named by DATABASE_URL (docs/lab-03/tests.md §1 E2E). It is run
// by e2e/lab-03/support/database.ts, which sends the users as JSON on
// stdin and reads their ids as JSON from the last line of stdout.
//
// A user that already exists is put back to the state asked for, with no
// session and no login throttle, so a run never depends on what an earlier
// run left behind. Only `e2e.` addresses are accepted: this never touches a
// seed account or a real one. Nothing here prints a password or a hash.
interface E2EUserInput {
  name: string
  email: string
  password: string
  role: Role
  isActive?: boolean
  mustChangePassword?: boolean
}

const E2E_EMAIL_PREFIX = 'e2e.'

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)

  return Buffer.concat(chunks).toString('utf8')
}

async function ensureUser(input: E2EUserInput): Promise<{ id: number; email: string }> {
  if (!input.email.startsWith(E2E_EMAIL_PREFIX)) {
    throw new Error(`Refusing to write ${input.email}: an E2E user's email starts with "${E2E_EMAIL_PREFIX}".`)
  }

  const state = {
    name: input.name,
    role: input.role,
    isActive: input.isActive ?? true,
    mustChangePassword: input.mustChangePassword ?? false,
    passwordHash: await hashPassword(input.password),
  }
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: state,
    create: { ...state, email: input.email },
  })
  await prisma.session.deleteMany({ where: { userId: user.id } })
  await prisma.loginThrottle.deleteMany({ where: { email: input.email } })

  return { id: user.id, email: user.email }
}

async function main() {
  const inputs = JSON.parse(await readStdin()) as E2EUserInput[]
  const users = []
  for (const input of inputs) users.push(await ensureUser(input))

  console.log(JSON.stringify(users))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to create the E2E users')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
