export type PasswordRule =
  | 'MIN_LENGTH'
  | 'MAX_LENGTH'
  | 'MAX_BYTES'
  | 'UPPER_CASE'
  | 'LOWER_CASE'
  | 'DIGIT'
  | 'SPECIAL'

// BR-08: the first rule a user-chosen password breaks, or null when it
// meets them all.
export function firstUnmetPasswordRule(password: string): PasswordRule | null {
  // A character is a Unicode code point, so one emoji counts once.
  const length = [...password].length
  if (length < 8) return 'MIN_LENGTH'
  if (length > 72) return 'MAX_LENGTH'
  // bcrypt reads at most 72 bytes; longer input is rejected rather than
  // silently truncated (specification.md §11 item 2).
  if (Buffer.byteLength(password, 'utf8') > 72) return 'MAX_BYTES'
  if (!/\p{Lu}/u.test(password)) return 'UPPER_CASE'
  if (!/\p{Ll}/u.test(password)) return 'LOWER_CASE'
  if (!/\p{Nd}/u.test(password)) return 'DIGIT'
  // Special: any character that is not a letter, digit, or whitespace.
  if (!/[^\p{L}\p{N}\s]/u.test(password)) return 'SPECIAL'
  return null
}
