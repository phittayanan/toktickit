const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export interface HealthResponse {
  status: string
  service: string
}

export interface Category {
  id: number
  name: string
}

export interface RelatedSystem {
  id: number
  name: string
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'

export type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'

// The signed-in User as the authentication endpoints return them
// (docs/lab-03/api-spec.md §1.7).
export interface UserIdentity {
  id: number
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
}

// A refusal the API answered with (docs/lab-03/api-spec.md §1.4): its
// `error` text, which is safe to display, as the message, with the HTTP
// status, the machine `code`, and the `field` of a single-field validation
// error. A request that never reached the API is not an ApiError.
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly field?: string

  constructor(status: number, message: string, code?: string, field?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
  }
}

export interface CreateTicketInput {
  categoryId: number
  relatedSystemId: number
  requestedPriority: Priority
  summary: string
  description: string
}

export interface Ticket {
  id: number
  ticketNumber: string
  requesterId: number
  categoryId: number
  relatedSystemId: number
  summary: string
  description: string
  requestedPriority: Priority
  itPriority: Priority | null
  currentStatus: string
  createdAt: string
  updatedAt: string
}

export type SortBy = 'createdAt' | 'updatedAt' | 'ticketNumber'
export type SortDir = 'asc' | 'desc'

export type TicketListItem = Pick<
  Ticket,
  | 'id'
  | 'ticketNumber'
  | 'summary'
  | 'categoryId'
  | 'requestedPriority'
  | 'itPriority'
  | 'currentStatus'
  | 'createdAt'
  | 'updatedAt'
>

export interface TicketListParams {
  page?: number
  pageSize?: 10 | 25 | 50
  search?: string
  categoryId?: number
  requestedPriority?: Priority
  itPriority?: Priority
  currentStatus?: string
  sortBy?: SortBy
  sortDir?: SortDir
}

export interface TicketListResponse {
  data: TicketListItem[]
  meta: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export interface Attachment {
  id: number
  ticketId: number
  originalFilename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

// GET /api/tickets/:id's shape of an Attachment additionally carries the
// soft-removal fields (ADR-0005) — active vs. removed is `removedAt: null`
// vs. non-null.
export interface TicketAttachment extends Attachment {
  removedAt: string | null
  removedByRequesterId: number | null
  removalReason: string | null
}

// docs/lab-03/api-spec.md §4.1: `ownerName` is null while the Ticket is
// unassigned; the resolution fields are null until it is first resolved.
// `requesterResolvedAt` is set while the Requester has indicated that the
// problem appears resolved.
export interface TicketDetail extends Ticket {
  attachments: TicketAttachment[]
  ownerName: string | null
  resolutionSummary: string | null
  resolvedAt: string | null
  requesterResolvedAt: string | null
}

// A Public Comment (api-spec.md §1.7). `body` is plain text.
export interface Entry {
  id: number
  body: string
  createdAt: string
  author: { id: number; name: string; role: Role }
}

export interface ResolutionIndication {
  requesterResolvedAt: string | null
}

// Current Status values on the wire (docs/lab-03/api-spec.md §1.1).
export type TicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'

// A row of the Ticket Queue (docs/lab-03/api-spec.md §5.1).
export interface QueueTicket {
  id: number
  ticketNumber: string
  summary: string
  requester: { id: number; name: string }
  category: { id: number; name: string }
  requestedPriority: Priority
  itPriority: Priority
  currentStatus: TicketStatus
  owner: { id: number; name: string } | null
  requesterResolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type QueueSortBy = 'updatedAt' | 'createdAt' | 'ticketNumber' | 'itPriority'

export interface QueueParams {
  page?: number
  pageSize?: 10 | 25 | 50
  search?: string
  status?: TicketStatus[]
  owner?: 'unassigned' | 'me' | number
  itPriority?: Priority
  categoryId?: number
  appearsResolved?: boolean
  sortBy?: QueueSortBy
  sortDir?: SortDir
}

export interface QueueResponse {
  data: QueueTicket[]
  meta: TicketListResponse['meta']
}

// A User who can be made Ticket Owner (docs/lab-03/api-spec.md §5.3).
export interface EligibleOwner {
  id: number
  name: string
  role: Role
}

type UnauthenticatedListener = () => void
const unauthenticatedListeners = new Set<UnauthenticatedListener>()

// Subscribes to "a request answered 401 UNAUTHENTICATED" (ui-spec.md
// §4.2): the Session behind the cookie is gone. Returns the unsubscribe.
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener)
  return () => {
    unauthenticatedListeners.delete(listener)
  }
}

async function reportIfUnauthenticated(res: Response): Promise<void> {
  if (res.status !== 401) return

  try {
    const data = (await res.clone().json()) as { code?: string }
    if (data?.code !== 'UNAUTHENTICATED') return
  } catch {
    return
  }

  for (const listener of unauthenticatedListeners) listener()
}

// Every request goes through here. The session cookie goes with it
// (docs/lab-03/api-spec.md §1.1) and is the only identity the client
// sends. A request that never reaches the API at all (server down, DNS
// failure, CORS) surfaces as one useful message instead of the browser's
// raw "Failed to fetch" / "NetworkError" text.
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include' })
  } catch {
    throw new Error('Unable to connect to TokTickIT API')
  }

  await reportIfUnauthenticated(res)
  return res
}

// A GET whose every non-2xx answer collapses into the same connectivity
// message.
async function getJson<T>(path: string): Promise<T> {
  const res = await send(path)

  if (!res.ok) {
    throw new Error('Unable to connect to TokTickIT API')
  }

  return res.json()
}

// The request did reach the API (unlike a fetch()-level throw, which means
// it never did) — a non-JSON error body still deserves its own message,
// not the generic connectivity one.
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    if (data?.error) return data.error
  } catch {
    // Response wasn't JSON — fall through to the generic message.
  }
  return 'The server was unable to process this request'
}

// Like getJson, but for a POST with a JSON body. On a 4xx, prefers the
// server's own field-specific `{ error }` message over the generic
// connectivity message, since the request *did* reach the API.
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }

  return res.json()
}

// A Lab 3 request: a refusal becomes an ApiError carrying its status,
// `code`, and `field` (api-spec.md §1.4).
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await send(path, init)

  if (!res.ok) {
    throw await toApiError(res)
  }

  return res
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: string; code?: string; field?: string }
    if (data?.error) return new ApiError(res.status, data.error, data.code, data.field)
  } catch {
    // Response wasn't JSON — fall through to the generic message.
  }
  return new ApiError(res.status, 'The server was unable to process this request')
}

// GET /api/auth/me: who the session cookie belongs to, or a 401 ApiError
// when there is no session.
export async function fetchCurrentUser(): Promise<UserIdentity> {
  const res = await request('/api/auth/me')
  return res.json()
}

// POST /api/auth/login. Refusals are ApiErrors: 401 INVALID_CREDENTIALS,
// 403 ACCOUNT_INACTIVE, 429 LOGIN_THROTTLED, 400 naming the `field`.
export async function login(email: string, password: string): Promise<UserIdentity> {
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return res.json()
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

// POST /api/auth/change-password: answers the User with the must-change
// flag cleared. A 400 ApiError names the `field` it refuses.
export async function changePassword(input: ChangePasswordInput): Promise<UserIdentity> {
  const res = await request('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return res.json()
}

// POST /api/auth/logout: ends the Session. Safe to repeat (204 either way).
export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

// A User as User Management sees them (docs/lab-03/api-spec.md §7).
// `ownedUnfinishedTicketCount` is what a deactivation or a change to
// Requester would return to the Ticket Queue.
export interface AdminUser {
  id: number
  name: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  hasPassword: boolean
  ownedUnfinishedTicketCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminUserListParams {
  search?: string
  role?: Role
}

// GET /api/admin/users: every matching User, ordered by name.
export async function fetchAdminUsers(params: AdminUserListParams = {}): Promise<AdminUser[]> {
  const res = await request(`/api/admin/users${toQueryString(params)}`)
  return res.json()
}

export interface AdminUserInput {
  name: string
  email: string
  role: Role
  isActive: boolean
}

function sendJson(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<Response> {
  return request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

// POST /api/admin/users: creates the User. `initialPassword` is in this
// answer only and cannot be read again. Refusals are ApiErrors: 400
// naming the `field`, 409 EMAIL_TAKEN.
export async function createAdminUser(input: AdminUserInput): Promise<{ user: AdminUser; initialPassword: string }> {
  const res = await sendJson('/api/admin/users', 'POST', input)
  return res.json()
}

// PATCH /api/admin/users/:id: saves the fields given. `unassignedTicketCount`
// is how many Tickets the change returned to the Ticket Queue. Refusals are
// ApiErrors: 400 naming the `field`, 404, and 409 EMAIL_TAKEN,
// SELF_DEACTIVATION, or LAST_ADMINISTRATOR.
export async function updateAdminUser(
  id: number,
  input: Partial<AdminUserInput>,
): Promise<{ user: AdminUser; unassignedTicketCount: number }> {
  const res = await sendJson(`/api/admin/users/${id}`, 'PATCH', input)
  return res.json()
}

// POST /api/admin/users/:id/initial-password: replaces the User's password
// with a new Initial Password, in this answer only. Refusals are ApiErrors:
// 404, and 409 SELF_INITIAL_PASSWORD for the Administrator's own account.
export async function setInitialPassword(id: number): Promise<{ initialPassword: string }> {
  const res = await request(`/api/admin/users/${id}/initial-password`, { method: 'POST' })
  return res.json()
}

// Downloads an active Attachment's file content and triggers a browser save
// under its original filename. A removed or not-owned Attachment 404s with
// the shared { error } body (BR-20/BR-21).
export async function downloadAttachment(attachmentId: number, originalFilename: string): Promise<void> {
  const res = await send(`/api/attachments/${attachmentId}/download`)

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = originalFilename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// BR-18/BR-19: soft-removes an active Attachment given a required reason.
// A refusal is an ApiError; a 409 is TICKET_FINISHED (BR-31).
export async function removeAttachment(attachmentId: number, removalReason: string): Promise<TicketAttachment> {
  const res = await request(`/api/attachments/${attachmentId}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ removalReason }),
  })
  return res.json()
}

export function checkHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health')
}

export function fetchCategories(): Promise<Category[]> {
  return getJson<Category[]>('/api/categories')
}

export function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  return getJson<RelatedSystem[]>('/api/related-systems')
}

export function createTicket(input: CreateTicketInput): Promise<Ticket> {
  return postJson<Ticket>('/api/tickets', input)
}

// Only defined (non-empty-string) params are sent — omitting a param is how
// the server applies its own default (api-spec.md), rather than the client
// re-encoding those defaults itself.
function toQueryString(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function fetchTickets(params: TicketListParams = {}): Promise<TicketListResponse> {
  return getJson<TicketListResponse>(`/api/tickets${toQueryString(params)}`)
}

// GET /api/staff/tickets: the Ticket Queue. A list of statuses goes as one
// comma-separated value. A refusal is an ApiError.
export async function fetchStaffQueue(params: QueueParams = {}): Promise<QueueResponse> {
  const res = await request(`/api/staff/tickets${toQueryString(params)}`)
  return res.json()
}

// GET /api/staff/eligible-owners: the active IT Staff and Administrators,
// ordered by name.
export async function fetchEligibleOwners(): Promise<EligibleOwner[]> {
  const res = await request('/api/staff/eligible-owners')
  return res.json()
}

// Ticket Detail needs to tell "not found" (404, api-spec.md's `{ error }`
// body) apart from a generic connectivity failure — unlike getJson, which
// collapses every non-2xx into the same message — so this uses the same
// error-message extraction as postJson instead.
export async function fetchTicketById(id: number): Promise<TicketDetail> {
  const res = await send(`/api/tickets/${id}`)

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }

  return res.json()
}

// Unlike postJson, this sends a multipart body — Content-Type (with its
// boundary) is left for the browser to set, never hardcoded. Used for one
// file per call; the Create Ticket flow awaits each call in turn (BR-16 /
// ADR-0003) rather than firing them in parallel.
export async function uploadAttachment(ticketId: number, file: File): Promise<Attachment> {
  const body = new FormData()
  body.append('file', file)

  const res = await request(`/api/tickets/${ticketId}/attachments`, { method: 'POST', body })

  return res.json()
}

// GET /api/tickets/:id/comments: the Ticket's Public Comments, newest first.
export async function fetchPublicComments(ticketId: number): Promise<Entry[]> {
  const res = await request(`/api/tickets/${ticketId}/comments`)
  return res.json()
}

// POST /api/tickets/:id/comments. Refusals are ApiErrors: 400 naming
// `body`, 404, or 409 TICKET_FINISHED.
export async function postPublicComment(ticketId: number, body: string): Promise<Entry> {
  const res = await request(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  return res.json()
}

// PUT and DELETE /api/tickets/:id/resolution-indication: sets or withdraws
// Problem Appears Resolved. A 409 ApiError is INDICATION_NOT_AVAILABLE (the
// Ticket is Resolved) or TICKET_FINISHED.
export async function setResolutionIndication(ticketId: number): Promise<ResolutionIndication> {
  const res = await request(`/api/tickets/${ticketId}/resolution-indication`, { method: 'PUT' })
  return res.json()
}

export async function withdrawResolutionIndication(ticketId: number): Promise<ResolutionIndication> {
  const res = await request(`/api/tickets/${ticketId}/resolution-indication`, { method: 'DELETE' })
  return res.json()
}
