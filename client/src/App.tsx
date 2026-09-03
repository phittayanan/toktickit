import { useState } from 'react'
import { RequesterProvider } from './RequesterContext'
import { useRequester } from './useRequester'
import RequesterSelector from './RequesterSelector'
import AppShell, { type Screen } from './AppShell'
import CreateTicket from './CreateTicket'
import MyTickets from './MyTickets'

// AC-02: no screen other than the Selector is usable until a Development
// Requester is chosen.
function AppContent() {
  const { requester } = useRequester()
  const [screen, setScreen] = useState<Screen>('myTickets')

  if (!requester) {
    return <RequesterSelector />
  }

  return (
    <AppShell activeScreen={screen} onNavigate={setScreen}>
      {screen === 'myTickets' ? (
        <MyTickets onCreateTicket={() => setScreen('createTicket')} />
      ) : (
        <CreateTicket />
      )}
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
