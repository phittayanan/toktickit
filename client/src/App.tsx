import { useState } from 'react'
import { checkHealth, fetchCategories, type Category } from './api'

type CheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; categories: Category[] }
  | { status: 'error'; message: string }

function App() {
  const [check, setCheck] = useState<CheckState>({ status: 'idle' })

  const handleCheckSystem = async () => {
    setCheck({ status: 'loading' })

    try {
      await checkHealth()
      const categories = await fetchCategories()
      setCheck({ status: 'success', categories })
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

      {check.status === 'success' && (
        <div>
          <p className="text-success">System Status: Online</p>
          <h2 className="h5 mt-4">Supported Request Categories</h2>
          <ul>
            {check.categories.map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
        </div>
      )}

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
