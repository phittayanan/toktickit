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

export interface Requester {
  id: number
  name: string
  email: string
}

// Wraps fetch() so any failure — the API responding with a non-2xx status,
// or the request never reaching the API at all (server down, DNS failure,
// CORS) — surfaces as the same useful message instead of the browser's raw
// "Failed to fetch" / "NetworkError" text. Also attaches X-Requester-Id
// (ADR-0006, FR-03) whenever a Requester is currently selected.
async function getJson<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {}
  const requester = getRequester()
  if (requester) {
    headers['X-Requester-Id'] = String(requester.id)
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { headers })
  } catch {
    throw new Error('Unable to connect to TokTickIT API')
  }

  if (!res.ok) {
    throw new Error('Unable to connect to TokTickIT API')
  }

  return res.json()
}

export function checkHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health')
}

export function fetchCategories(): Promise<Category[]> {
  return getJson<Category[]>('/api/categories')
}

// The one endpoint that doesn't require X-Requester-Id — it's how the
// client discovers who it can act as (api-spec.md).
export function fetchRequesters(): Promise<Requester[]> {
  return getJson<Requester[]>('/api/requesters')
}
