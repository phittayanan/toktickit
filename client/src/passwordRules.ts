// The password policy of specification.md BR-08, as the Change Password
// checklist shows it (ui-spec.md §6). It mirrors the server's policy
// (server/src/services/passwordPolicy.service.ts), which stays the
// authority: this is feedback before the request, never the control.

export interface ChecklistRule {
  label: string
  message: string
  met: (password: string) => boolean
}

export const PASSWORD_CHECKLIST: ChecklistRule[] = [
  {
    label: 'Be at least 8 characters',
    message: 'Password must be at least 8 characters.',
    // A character is a Unicode code point, so one emoji counts once.
    met: (password) => [...password].length >= 8,
  },
  {
    label: 'Include upper and lower case letters',
    message: 'Password must include upper and lower case letters.',
    met: (password) => /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password),
  },
  {
    label: 'Include a number',
    message: 'Password must include a number.',
    met: (password) => /\p{Nd}/u.test(password),
  },
  {
    label: 'Include a special character',
    message: 'Password must include a special character.',
    // Special: any character that is not a letter, digit, or whitespace.
    met: (password) => /[^\p{L}\p{Nd}\s]/u.test(password),
  },
]

const MAX_LENGTH = 72

// The message for the first rule a new password breaks, or null when it
// meets them all.
export function firstUnmetRuleMessage(password: string): string | null {
  const unmet = PASSWORD_CHECKLIST.find((rule) => !rule.met(password))
  if (unmet) return unmet.message
  if ([...password].length > MAX_LENGTH) return 'Password must be at most 72 characters.'
  // bcrypt reads at most 72 bytes (specification.md §11 item 2).
  if (new TextEncoder().encode(password).length > MAX_LENGTH) return 'Password must be at most 72 bytes.'
  return null
}
