import { useState } from 'react'
import { checkHealth } from './api'

type CheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string }

function App() {
  const [check, setCheck] = useState<CheckState>({ status: 'idle' })

  const handleCheckSystem = async () => {
    setCheck({ status: 'loading' })

    try {
      await checkHealth()
      setCheck({ status: 'success' })
    } catch (err) {
      setCheck({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unable to connect to TokTickIT API',
      })
    }
  }

  return (
    <div className="container py-5">
      <h1 className="mb-4">TokTickIT IT Service Desk</h1>

      <button type="button" className="btn btn-primary mb-4" onClick={handleCheckSystem}>
        Check System
      </button>

      {check.status === 'loading' && <p>⏳ Loading...</p>}

      {check.status === 'success' && <p className="text-success">System Status: Online</p>}

      {check.status === 'error' && (
        <div>
          <p className="text-danger mb-1">System Status: Offline</p>
          <p className="text-danger">{check.message}</p>
        </div>
      )}
    </div>
  )
}

export default App
