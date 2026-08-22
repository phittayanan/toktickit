const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export interface HealthResponse {
  status: string
  service: string
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/health`)

  if (!res.ok) {
    throw new Error('Unable to connect to TokTickIT API')
  }

  return res.json()
}
