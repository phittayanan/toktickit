import { ROLES, type Role } from './roles'

export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  // Express-style path; `:id` stands for any id. The role check runs
  // before a path id is examined (api-spec.md §1.5 step 3), so a refusal
  // does not depend on the id being real.
  path: string
  // The roles permitted by specification.md §5.3, or 'public' for the
  // endpoints that run no session check at all.
  roles: readonly Role[] | 'public'
  // Reachable by a user who must still change their password (§1.5 step 2).
  allowedBeforePasswordChange?: true
  // The issue that delivers an endpoint the API does not have yet. Its rows
  // in authorization.api.test.ts stay pending until that issue removes this.
  pendingIssue?: number
}

const ANY_ROLE = ROLES
const REQUESTER = ['REQUESTER'] as const
const STAFF = ['IT_STAFF', 'ADMINISTRATOR'] as const
const ADMINISTRATOR = ['ADMINISTRATOR'] as const

// Every endpoint of docs/lab-03/api-spec.md §2 to §7, in the order the
// contract lists them. authorization.api.test.ts runs each one with no
// session and with each role, so an endpoint added to the API is added
// here in the same change.
export const ENDPOINTS: readonly Endpoint[] = [
  // §2 Authentication
  { method: 'POST', path: '/api/auth/login', roles: 'public' },
  { method: 'POST', path: '/api/auth/logout', roles: 'public' },
  { method: 'GET', path: '/api/auth/me', roles: ANY_ROLE, allowedBeforePasswordChange: true },
  { method: 'POST', path: '/api/auth/change-password', roles: ANY_ROLE, allowedBeforePasswordChange: true },

  // §3 Reference data
  { method: 'GET', path: '/api/health', roles: 'public' },
  { method: 'GET', path: '/api/categories', roles: ANY_ROLE },
  { method: 'GET', path: '/api/related-systems', roles: ANY_ROLE },

  // §4 Requester Tickets
  { method: 'POST', path: '/api/tickets', roles: REQUESTER },
  { method: 'GET', path: '/api/tickets', roles: REQUESTER },
  { method: 'GET', path: '/api/tickets/:id', roles: REQUESTER },
  { method: 'POST', path: '/api/tickets/:id/attachments', roles: REQUESTER },
  { method: 'POST', path: '/api/attachments/:id/remove', roles: REQUESTER },
  { method: 'PUT', path: '/api/tickets/:id/resolution-indication', roles: REQUESTER },
  { method: 'DELETE', path: '/api/tickets/:id/resolution-indication', roles: REQUESTER },

  // §5 Staff Tickets
  { method: 'GET', path: '/api/staff/tickets', roles: STAFF, pendingIssue: 51 },
  { method: 'GET', path: '/api/staff/tickets/:id', roles: STAFF, pendingIssue: 52 },
  { method: 'GET', path: '/api/staff/eligible-owners', roles: STAFF, pendingIssue: 51 },
  { method: 'PUT', path: '/api/staff/tickets/:id/owner', roles: STAFF, pendingIssue: 52 },
  { method: 'PUT', path: '/api/staff/tickets/:id/it-priority', roles: STAFF, pendingIssue: 52 },
  { method: 'POST', path: '/api/staff/tickets/:id/status', roles: STAFF, pendingIssue: 52 },
  { method: 'GET', path: '/api/staff/tickets/:id/notes', roles: STAFF, pendingIssue: 52 },
  { method: 'POST', path: '/api/staff/tickets/:id/notes', roles: STAFF, pendingIssue: 52 },

  // §6 Shared ticket resources
  { method: 'GET', path: '/api/tickets/:id/comments', roles: ANY_ROLE },
  { method: 'POST', path: '/api/tickets/:id/comments', roles: ANY_ROLE },
  { method: 'GET', path: '/api/attachments/:id/download', roles: ANY_ROLE },

  // §7 User Management
  { method: 'GET', path: '/api/admin/users', roles: ADMINISTRATOR },
  { method: 'POST', path: '/api/admin/users', roles: ADMINISTRATOR },
  { method: 'PATCH', path: '/api/admin/users/:id', roles: ADMINISTRATOR },
  { method: 'POST', path: '/api/admin/users/:id/initial-password', roles: ADMINISTRATOR },
]
