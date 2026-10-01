// Role values as they appear on the wire (api-spec.md §1.1).
export const ROLES = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'] as const

export type Role = (typeof ROLES)[number]
