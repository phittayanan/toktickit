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
    // The request did reach the API here (unlike the catch above, which
    // means it never did) — a non-JSON error body still deserves its own
    // message, not the network-failure one.
    let message = 'The server was unable to process this request'
    try {
      const data = (await res.json()) as { error?: string }
      if (data?.error) message = data.error
    } catch {
      // Response wasn't JSON — keep the generic server-error message.
    }
    throw new Error(message)
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
