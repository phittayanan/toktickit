const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export interface HealthResponse {
  status: string
  service: string
}

export interface Category {
  id: number
  name: string
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/health`)

  if (!res.ok) {
    throw new Error('Unable to connect to TokTickIT API')
  }

  return res.json()
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_BASE_URL}/api/categories`)

  if (!res.ok) {
    throw new Error('Unable to connect to TokTickIT API')
  }

  return res.json()
}
