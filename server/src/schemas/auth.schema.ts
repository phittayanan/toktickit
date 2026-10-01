import { z } from 'zod'

// api-spec.md §2 `POST /api/auth/login`: both inputs are required strings.
// The email is trimmed here and lower-cased before lookup (BR-06); the
// password is taken exactly as typed.
export const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required.' })
    .trim()
    .min(1, 'Email is required.')
    .max(254, 'Email must be at most 254 characters.'),
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.'),
})

// api-spec.md §2 `POST /api/auth/change-password`: the three inputs must be
// present. What makes each of them valid is decided in auth.service.ts,
// against the stored password and the BR-08 policy.
export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'Current password is required.' }).min(1, 'Current password is required.'),
  newPassword: z.string({ error: 'New password is required.' }).min(1, 'New password is required.'),
  confirmPassword: z.string({ error: 'Confirm the new password.' }).min(1, 'Confirm the new password.'),
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
