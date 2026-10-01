import type { Role } from './api'

export interface NavigationEntry {
  label: string
  path: string
}

// ui-spec.md §4.1: each Role's navigation entries and landing screen. A
// destination a Role cannot use is not in its list, so it is never
// rendered.
export const NAVIGATION: Record<Role, NavigationEntry[]> = {
  REQUESTER: [
    { label: 'My Tickets', path: '/tickets' },
    { label: 'Create Ticket', path: '/tickets/new' },
  ],
  IT_STAFF: [{ label: 'Ticket Queue', path: '/staff/queue' }],
  ADMINISTRATOR: [
    { label: 'Ticket Queue', path: '/staff/queue' },
    { label: 'User Management', path: '/admin/users' },
  ],
}

export const LANDING_PATH: Record<Role, string> = {
  REQUESTER: '/tickets',
  IT_STAFF: '/staff/queue',
  ADMINISTRATOR: '/admin/users',
}

// The navigation entry of a Role's landing screen.
export function landingEntry(role: Role): NavigationEntry {
  return NAVIGATION[role].find((entry) => entry.path === LANDING_PATH[role])!
}

// The entry to underline for a path: the one whose own path is the longest
// prefix of it, so /tickets/42 is under My Tickets and /tickets/new is
// Create Ticket.
export function activeEntry(entries: NavigationEntry[], pathname: string): NavigationEntry | undefined {
  return entries
    .filter((entry) => pathname === entry.path || pathname.startsWith(`${entry.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}
