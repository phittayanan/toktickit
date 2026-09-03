import { RequesterProvider } from './RequesterContext'
import { useRequester } from './useRequester'
import RequesterSelector from './RequesterSelector'
import AppShell from './AppShell'
import CreateTicket from './CreateTicket'

// AC-02: no screen other than the Selector is usable until a Development
// Requester is chosen.
function AppContent() {
  const { requester } = useRequester()

  if (!requester) {
    return <RequesterSelector />
  }

  return (
    <AppShell>
      <CreateTicket />
    </AppShell>
  )
}

function App() {
  return (
    <RequesterProvider>
      <AppContent />
    </RequesterProvider>
  )
}

export default App
