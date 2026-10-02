import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router'
import type { Role, UserIdentity } from './api'
import { ForbiddenPage, NotFoundPage } from './feedback'
import { LANDING_PATH } from './navigation'
import { SessionProvider } from './SessionContext'
import { useSession } from './useSession'
import AppShell from './AppShell'
import Login from './Login'
import ChangePassword from './ChangePassword'
import CreateTicket from './CreateTicket'
import MyTickets from './MyTickets'
import RequesterTicketDetail from './RequesterTicketDetail'
import UserManagement from './UserManagement'
import StaffTicketQueue from './StaffTicketQueue'

// The Lab 2 Requester screens keep their props; these adapters give them
// the URL paths of specification.md §6.
function MyTicketsScreen() {
  const navigate = useNavigate()

  return (
    <MyTickets
      onCreateTicket={() => navigate('/tickets/new')}
      onOpenTicket={(ticketId) => navigate(`/tickets/${ticketId}`)}
    />
  )
}

function RequesterTicketDetailScreen() {
  const navigate = useNavigate()
  const { id = '' } = useParams()

  // A Ticket id is a positive integer; anything else names no Ticket.
  if (!/^[1-9]\d*$/.test(id)) {
    return <NotFoundPage role="REQUESTER" title="Ticket not found" />
  }

  return <RequesterTicketDetail ticketId={Number(id)} onBack={() => navigate('/tickets')} />
}

// The shell shows the signed-in Administrator's name, so a change they
// save to their own account is taken into the Session state.
function UserManagementScreen({ user }: { user: UserIdentity }) {
  const { signIn } = useSession()

  return <UserManagement user={user} onSelfSaved={(saved) => signIn({ ...user, name: saved.name, email: saved.email })} />
}

const REQUESTER: Role[] = ['REQUESTER']
const STAFF: Role[] = ['IT_STAFF', 'ADMINISTRATOR']
const ADMINISTRATOR: Role[] = ['ADMINISTRATOR']

// ui-spec.md §4.2: a path of another Role shows the Forbidden page, and
// the screen is never mounted, so it requests nothing. This is feedback;
// the API enforces the same matrix (BR-18).
function RequireRole({ user, roles, children }: { user: UserIdentity; roles: Role[]; children: ReactNode }) {
  return roles.includes(user.role) ? children : <ForbiddenPage role={user.role} />
}

// The guards of ui-spec.md §4.2, applied before any screen is chosen.
function AppRoutes() {
  const { user } = useSession()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (user.mustChangePassword) {
    return (
      <AppShell user={user}>
        <Routes>
          <Route path="/change-password" element={<ChangePassword user={user} />} />
          <Route path="*" element={<Navigate to="/change-password" replace />} />
        </Routes>
      </AppShell>
    )
  }

  const landing = <Navigate to={LANDING_PATH[user.role]} replace />
  // The Staff Ticket Detail (#52) screen is not built yet. Its path is
  // guarded now, and shows the Not Found page to the Roles that may open it.
  const notBuiltYet = <NotFoundPage role={user.role} />

  return (
    <AppShell user={user}>
      <Routes>
        <Route path="/" element={landing} />
        <Route path="/login" element={landing} />
        <Route
          path="/tickets"
          element={
            <RequireRole user={user} roles={REQUESTER}>
              <MyTicketsScreen />
            </RequireRole>
          }
        />
        <Route
          path="/tickets/new"
          element={
            <RequireRole user={user} roles={REQUESTER}>
              <CreateTicket />
            </RequireRole>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequireRole user={user} roles={REQUESTER}>
              <RequesterTicketDetailScreen />
            </RequireRole>
          }
        />
        <Route
          path="/staff/queue"
          element={
            <RequireRole user={user} roles={STAFF}>
              <StaffTicketQueue user={user} />
            </RequireRole>
          }
        />
        <Route
          path="/staff/tickets/:id"
          element={
            <RequireRole user={user} roles={STAFF}>
              {notBuiltYet}
            </RequireRole>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireRole user={user} roles={ADMINISTRATOR}>
              <UserManagementScreen user={user} />
            </RequireRole>
          }
        />
        <Route path="/change-password" element={<ChangePassword user={user} />} />
        <Route path="*" element={<NotFoundPage role={user.role} />} />
      </Routes>
    </AppShell>
  )
}

function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  )
}

export default App
