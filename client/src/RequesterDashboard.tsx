import { fetchRequesterDashboard, type RequesterDashboard as Dashboard, type RequesterDashboardTicket } from './api'
import { StatusBadge } from './badges'
import { DashboardFailure, DashboardList, DashboardSkeleton, MetricCard } from './dashboard'
import { formatDate, formatDateTime } from './dateFormat'
import { ForbiddenPage } from './feedback'
import { useLoaded } from './useLoaded'

function TicketRow({ ticket, when }: { ticket: RequesterDashboardTicket; when: string }) {
  return (
    <>
      <span className="tk-dashboard-row__number">{ticket.ticketNumber}</span>
      <span className="tk-dashboard-row__text">{ticket.summary}</span>
      <StatusBadge status={ticket.currentStatus} />
      <span className="text-muted small">{when}</span>
    </>
  )
}

function Loaded({ data }: { data: Dashboard }) {
  return (
    <>
      <section aria-labelledby="dashboard-summary" className="mb-4">
        <h2 id="dashboard-summary" className="visually-hidden">
          Summary
        </h2>
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <MetricCard
              label="Open Tickets"
              value={data.openCount}
              caption="Not yet resolved"
              to="/tickets?currentStatus=open"
            />
          </div>
          <div className="col-12 col-md-6">
            <MetricCard
              label="Waiting for Requester"
              value={data.waitingForRequesterCount}
              caption="Needs your reply"
              to="/tickets?currentStatus=WAITING_FOR_REQUESTER"
            />
          </div>
        </div>
      </section>
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <DashboardList
            title="Recently updated"
            caption="Last 7 days"
            items={data.recentlyUpdated}
            empty="No tickets updated in the last 7 days."
            rowTo={(ticket) => `/tickets/${ticket.id}`}
            renderRow={(ticket) => <TicketRow ticket={ticket} when={`Last Updated ${formatDateTime(ticket.updatedAt)}`} />}
          />
        </div>
        <div className="col-12 col-lg-6">
          <DashboardList
            title="Recently resolved"
            caption="Last 7 days"
            items={data.recentlyResolved}
            empty="No tickets resolved in the last 7 days."
            rowTo={(ticket) => `/tickets/${ticket.id}`}
            renderRow={(ticket) => <TicketRow ticket={ticket} when={`Resolved on ${formatDate(ticket.resolvedAt)}`} />}
          />
        </div>
      </div>
    </>
  )
}

// The Requester Dashboard (docs/lab-04/ui-spec.md §5).
function RequesterDashboard() {
  const { state, retry } = useLoaded(fetchRequesterDashboard)

  if (state.status === 'forbidden') return <ForbiddenPage role="REQUESTER" />

  return (
    <div>
      <h1 className="h3 mb-3">Dashboard</h1>
      {state.status === 'loading' && <DashboardSkeleton cards={2} lists={2} label="Loading dashboard…" />}
      {state.status === 'failed' && <DashboardFailure onRetry={retry} />}
      {state.status === 'loaded' && <Loaded data={state.data} />}
    </div>
  )
}

export default RequesterDashboard
