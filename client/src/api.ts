const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export interface HealthResponse {
  status: string
  service: string
}

export interface Category {
  id: number
  name: string
}

// Wraps fetch() so any failure — the API responding with a non-2xx status,
// or the request never reaching the API at all (server down, DNS failure,
// CORS) — surfaces as the same useful message instead of the browser's raw
// "Failed to fetch" / "NetworkError" text.
async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`)
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
