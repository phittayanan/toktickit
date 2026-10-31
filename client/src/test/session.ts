import { vi } from 'vitest'
import * as api from '../api'
import type { UserIdentity } from '../api'

// One user of each Role (api-spec.md §1.7), for suites that need a
// signed-in identity.
export const REQUESTER: UserIdentity = {
  id: 7,
  name: 'Somchai Jaidee',
  email: 'somchai.jaidee@kmutt.ac.th',
  role: 'REQUESTER',
  mustChangePassword: false,
}

export const IT_STAFF: UserIdentity = {
  id: 12,
  name: 'Wichai Phromma',
  email: 'wichai.phromma@kmutt.ac.th',
  role: 'IT_STAFF',
  mustChangePassword: false,
}

export const ADMINISTRATOR: UserIdentity = {
  id: 20,
  name: 'Apinya Thongchai',
  email: 'apinya.thongchai@kmutt.ac.th',
  role: 'ADMINISTRATOR',
  mustChangePassword: false,
}

// The browser holds a session for `user`: GET /api/auth/me answers with them.
export function signedInAs(user: UserIdentity) {
  return vi.spyOn(api, 'fetchCurrentUser').mockResolvedValue(user)
}

// The browser holds no session: GET /api/auth/me answers 401.
export function signedOut() {
  return vi
    .spyOn(api, 'fetchCurrentUser')
    .mockRejectedValue(new api.ApiError(401, 'You are not signed in.', 'UNAUTHENTICATED'))
}

// Opens the app at a URL path, as typing it in the address bar would.
export function openPath(path: string) {
  window.history.pushState({}, '', path)
}

// The dashboards answer with nothing, for suites that pass through a
// landing screen on the way to what they test.
export function emptyDashboards() {
  vi.spyOn(api, 'fetchRequesterDashboard').mockResolvedValue({
    openCount: 0,
    waitingForRequesterCount: 0,
    recentlyUpdated: [],
    recentlyResolved: [],
  })
  vi.spyOn(api, 'fetchStaffDashboard').mockResolvedValue({
    unassignedCount: 0,
    ownedByMeCount: 0,
    myPlannedActionsTakenCount: 0,
    byStatus: { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, REOPENED: 0 },
    byItPriority: { LOW: 0, MEDIUM: 0, HIGH: 0 },
    myPlannedActionsTaken: [],
    urgent: [],
    recentlyUpdated: [],
  })
  vi.spyOn(api, 'fetchAdminDashboard').mockResolvedValue({ activeUsers: { REQUESTER: 0, IT_STAFF: 0, ADMINISTRATOR: 0 } })
}
