import { useRef, type MouseEvent, type RefObject } from 'react'
import {
  fetchAdminDashboard,
  fetchStaffDashboard,
  type Priority,
  type Role,
  type StaffDashboard as Dashboard,
  type StaffDashboardTicket,
  type UserIdentity,
} from './api'
import { PriorityBadge, StatusBadge } from './badges'
import { DashboardFailure, DashboardList, DashboardSkeleton, LinkTable, MetricCard } from './dashboard'
import { formatDateTime } from './dateFormat'
import { ForbiddenPage } from './feedback'
import { statusLabel, UNFINISHED_STATUSES } from './statusLabels'
import { useLoaded } from './useLoaded'

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
]
const ACCOUNT_CARDS: { role: Role; label: string }[] = [
  { role: 'REQUESTER', label: 'Requesters' },
  { role: 'IT_STAFF', label: 'IT Staff' },
  { role: 'ADMINISTRATOR', label: 'Administrators' },
]

const PLANNED_LIST_ANCHOR = '#my-planned-actions-taken'

function TicketRow({ ticket, updated }: { ticket: StaffDashboardTicket; updated?: boolean }) {
  return (
    <>
      <span className="tk-dashboard-row__number">{ticket.ticketNumber}</span>
      <span className="tk-dashboard-row__text">{ticket.summary}</span>
      <StatusBadge status={ticket.currentStatus} />
      <PriorityBadge priority={ticket.itPriority} />
      <span className="small">{ticket.owner?.name ?? 'Unassigned'}</span>
      {updated && <span className="text-muted small">Last Updated {formatDateTime(ticket.updatedAt)}</span>}
    </>
  )
}

function MetricCards({ data, onPlannedActivate }: { data: Dashboard; onPlannedActivate: (e: MouseEvent) => void }) {
  return (
    <section aria-labelledby="dashboard-summary" className="mb-4">
      <h2 id="dashboard-summary" className="visually-hidden">
        Summary
      </h2>
      <div className="row g-3">
        <div className="col-12 col-md-4">
          <MetricCard label="Unassigned" value={data.unassignedCount} to="/staff/queue?owner=unassigned" />
        </div>
        <div className="col-12 col-md-4">
          <MetricCard label="Owned by me" value={data.ownedByMeCount} to="/staff/queue?owner=me" />
        </div>
        <div className="col-12 col-md-4">
          <MetricCard
            label="My Planned Actions Taken"
            value={data.myPlannedActionsTakenCount}
            to={PLANNED_LIST_ANCHOR}
            onActivate={onPlannedActivate}
          />
        </div>
      </div>
    </section>
  )
}

function Details({ data, plannedRef }: { data: Dashboard; plannedRef: RefObject<HTMLElement | null> }) {
  return (
    <>
      <div className="row g-3 mb-3">
        <div className="col-12 col-md-6">
          <LinkTable
            title="By status"
            rows={UNFINISHED_STATUSES.map((status) => ({
              key: status,
              label: statusLabel(status),
              display: <StatusBadge status={status} />,
              count: data.byStatus[status],
              to: `/staff/queue?status=${status}`,
            }))}
          />
        </div>
        <div className="col-12 col-md-6">
          <LinkTable
            title="By IT Priority"
            rows={PRIORITIES.map(({ value, label }) => ({
              key: value,
              label,
              display: <PriorityBadge priority={value} />,
              count: data.byItPriority[value],
              to: `/staff/queue?itPriority=${value}`,
            }))}
          />
        </div>
      </div>
      <div className="d-flex flex-column gap-3">
        <DashboardList
          title="My Planned Actions Taken"
          sectionRef={plannedRef}
          items={data.myPlannedActionsTaken}
          empty="No planned actions assigned to you."
          rowTo={(action) => `/staff/tickets/${action.ticketId}#actions-taken`}
          renderRow={(action) => (
            <>
              <span className="tk-dashboard-row__number">{action.ticketNumber}</span>
              <span className="tk-dashboard-row__text">{action.description}</span>
              <span className="text-muted small">{formatDateTime(action.actionAt)}</span>
            </>
          )}
        />
        <DashboardList
          title="Urgent"
          items={data.urgent}
          empty="No urgent tickets."
          rowTo={(ticket) => `/staff/tickets/${ticket.id}`}
          renderRow={(ticket) => <TicketRow ticket={ticket} />}
        />
        <DashboardList
          title="Recently updated"
          caption="Last 7 days"
          items={data.recentlyUpdated}
          empty="No tickets updated in the last 7 days."
          rowTo={(ticket) => `/staff/tickets/${ticket.id}`}
          renderRow={(ticket) => <TicketRow ticket={ticket} updated />}
        />
      </div>
    </>
  )
}

// Active accounts (docs/lab-04/ui-spec.md §7): an Administrator's own
// section, with its own request and its own failure, so the rest of the
// dashboard does not depend on it.
function ActiveAccounts() {
  const { state, retry } = useLoaded(fetchAdminDashboard)

  return (
    <section aria-labelledby="active-accounts" className="mb-4">
      <h2 id="active-accounts" className="h6 mb-1">
        Active accounts
      </h2>
      <p className="text-muted small mb-2">User Management also lists inactive accounts.</p>
      {state.status === 'loading' && <DashboardSkeleton cards={3} lists={0} label="Loading active accounts…" />}
      {(state.status === 'failed' || state.status === 'forbidden') && <DashboardFailure onRetry={retry} />}
      {state.status === 'loaded' && (
        <div className="row g-3">
          {ACCOUNT_CARDS.map(({ role, label }) => (
            <div key={role} className="col-12 col-md-4">
              <MetricCard label={label} value={state.data.activeUsers[role]} to={`/admin/users?role=${role}`} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// The IT Staff Dashboard and, with Active accounts, the Administrator
// Dashboard (docs/lab-04/ui-spec.md §6, §7).
function StaffDashboard({ user }: { user: UserIdentity }) {
  const { state, retry } = useLoaded(fetchStaffDashboard)
  const plannedRef = useRef<HTMLElement>(null)

  if (state.status === 'forbidden') return <ForbiddenPage role={user.role} />

  // The items of this metric may be on several Tickets, so its card goes
  // to the list instead of to a filtered screen (BR-32).
  const focusPlanned = (event: MouseEvent) => {
    event.preventDefault()
    plannedRef.current?.focus()
  }

  return (
    <div>
      <h1 className="h3 mb-3">Dashboard</h1>
      {state.status === 'loading' && <DashboardSkeleton cards={3} lists={0} label="Loading dashboard…" />}
      {state.status === 'failed' && <DashboardFailure onRetry={retry} />}
      {state.status === 'loaded' && <MetricCards data={state.data} onPlannedActivate={focusPlanned} />}
      {user.role === 'ADMINISTRATOR' && <ActiveAccounts />}
      {state.status === 'loading' && <DashboardSkeleton cards={0} lists={3} />}
      {state.status === 'loaded' && <Details data={state.data} plannedRef={plannedRef} />}
    </div>
  )
}

export default StaffDashboard
