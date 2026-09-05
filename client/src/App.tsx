import { useState } from 'react'
import { RequesterProvider } from './RequesterContext'
import { useRequester } from './useRequester'
import RequesterSelector from './RequesterSelector'
import AppShell, { type Screen } from './AppShell'
import CreateTicket from './CreateTicket'
import MyTickets from './MyTickets'
import RequesterTicketDetail from './RequesterTicketDetail'

// Ticket Detail isn't a primary nav destination (it's reached by clicking a
// row in My Tickets) — it's tracked as its own view rather than folded into
// AppShell's `Screen` union, alongside which Ticket it's showing.
type View = { screen: Screen } | { screen: 'ticketDetail'; ticketId: number }

// AC-02: no screen other than the Selector is usable until a Development
// Requester is chosen.
function AppContent() {
  const { requester } = useRequester()
  const [view, setView] = useState<View>({ screen: 'myTickets' })

  if (!requester) {
    return <RequesterSelector />
  }

  // The nav highlights My Tickets while viewing a Ticket's detail — that's
  // the screen a "Back" action returns to.
  const activeScreen: Screen = view.screen === 'createTicket' ? 'createTicket' : 'myTickets'

  return (
    <AppShell activeScreen={activeScreen} onNavigate={(screen) => setView({ screen })}>
      {view.screen === 'myTickets' && (
        <MyTickets
          onCreateTicket={() => setView({ screen: 'createTicket' })}
          onOpenTicket={(ticketId) => setView({ screen: 'ticketDetail', ticketId })}
        />
      )}
      {view.screen === 'createTicket' && <CreateTicket />}
      {view.screen === 'ticketDetail' && (
        <RequesterTicketDetail ticketId={view.ticketId} onBack={() => setView({ screen: 'myTickets' })} />
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
