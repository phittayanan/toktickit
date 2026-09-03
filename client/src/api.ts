import { getRequester } from './requesterStore'

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

export interface Requester {
  id: number
  name: string
  email: string
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'

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

export interface TicketDetail extends Ticket {
  attachments: TicketAttachment[]
}

function requesterHeaders(): Record<string, string> {
  const requester = getRequester()
  return requester ? { 'X-Requester-Id': String(requester.id) } : {}
}

// Wraps fetch() so any failure — the API responding with a non-2xx status,
// or the request never reaching the API at all (server down, DNS failure,
// CORS) — surfaces as the same useful message instead of the browser's raw
// "Failed to fetch" / "NetworkError" text. Also attaches X-Requester-Id
// (ADR-0006, FR-03) whenever a Requester is currently selected.
async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { headers: requesterHeaders() })
  } catch {
    throw new Error('Unable to connect to TokTickIT API')
  }

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...requesterHeaders(),
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Unable to connect to TokTickIT API')
  }

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }

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

// The one endpoint that doesn't require X-Requester-Id — it's how the
// client discovers who it can act as (api-spec.md).
export function fetchRequesters(): Promise<Requester[]> {
  return getJson<Requester[]>('/api/requesters')
}

export function createTicket(input: CreateTicketInput): Promise<Ticket> {
  return postJson<Ticket>('/api/tickets', input)
}

// Only defined (non-empty-string) params are sent — omitting a param is how
// the server applies its own default (api-spec.md), rather than the client
// re-encoding those defaults itself.
function toQueryString(params: TicketListParams): string {
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

// Ticket Detail needs to tell "not found" (404, api-spec.md's `{ error }`
// body) apart from a generic connectivity failure — unlike getJson, which
// collapses every non-2xx into the same message — so this uses the same
// error-message extraction as postJson/uploadAttachment instead.
export async function fetchTicketById(id: number): Promise<TicketDetail> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/tickets/${id}`, { headers: requesterHeaders() })
  } catch {
    throw new Error('Unable to connect to TokTickIT API')
  }

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

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/attachments`, {
      method: 'POST',
      headers: requesterHeaders(),
      body,
    })
  } catch {
    throw new Error('Unable to connect to TokTickIT API')
  }

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res))
  }

  return res.json()
}
