import { z } from 'zod'

const ROLES = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'] as const

const role = z.enum(ROLES, { error: 'Role must be Requester, IT Staff, or Administrator.' })

// api-spec.md §7.1 `GET /api/admin/users`. A parameter the table does not
// name is ignored; a named one that is malformed is a 400, never a default.
export const listUsersQuerySchema = z.object({
  // Trimmed; an empty search is the same as none.
  search: z
    .string({ error: 'Search must be text.' })
    .trim()
    .max(100, 'Search must be at most 100 characters.')
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  role: role.optional(),
})

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>

// BR-43: 2 to 100 characters after trimming.
const name = z
  .string({ error: 'Name is required.' })
  .trim()
  .min(2, 'Name must be 2 to 100 characters.')
  .max(100, 'Name must be 2 to 100 characters.')

// BR-06, BR-43: trimmed and lower-cased, at most 254 characters, and a
// syntactically valid address.
const email = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .max(254, 'Email must be at most 254 characters.')
  .regex(z.regexes.email, 'Enter a valid email address.')

const isActive = z.boolean({ error: 'Active must be true or false.' })

// BR-38: the system generates the password, so any `password` key is
// refused rather than ignored.
const password = z.never({ error: 'A password cannot be supplied. The system generates it.' }).optional()

const body = { error: 'The request body must be a JSON object.' }

// api-spec.md §7.2 `POST /api/admin/users`.
export const createUserSchema = z.object(
  {
    name,
    email,
    role: z.enum(ROLES, { error: 'Role is required: Requester, IT Staff, or Administrator.' }),
    isActive: isActive.default(true),
    password,
  },
  body,
)

export type CreateUserInput = Omit<z.infer<typeof createUserSchema>, 'password'>

const EDITABLE_FIELDS = ['name', 'email', 'role', 'isActive'] as const

// api-spec.md §7.3 `PATCH /api/admin/users/:id`: any non-empty subset of
// the four fields, each validated as on create.
export const updateUserSchema = z
  .object(
    {
      name: name.optional(),
      email: email.optional(),
      role: role.optional(),
      isActive: isActive.optional(),
      password,
    },
    body,
  )
  .refine((input) => EDITABLE_FIELDS.some((field) => input[field] !== undefined), {
    error: 'Provide at least one of name, email, role, or isActive.',
  })

export type UpdateUserInput = Omit<z.infer<typeof updateUserSchema>, 'password'>
