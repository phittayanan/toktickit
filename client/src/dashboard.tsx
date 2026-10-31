import { useId, type MouseEventHandler, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router'
import { InlineAlert, SAFE_FAILURE_MESSAGE } from './feedback'

// The shared components of the dashboards (docs/lab-04/ui-spec.md §2.3).

// Safe failure with Retry (docs/lab-04/ui-spec.md §5.2).
export function DashboardFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <InlineAlert variant="error">
      {SAFE_FAILURE_MESSAGE}{' '}
      <button type="button" className="btn btn-link p-0 align-baseline" onClick={onRetry}>
        Retry
      </button>
    </InlineAlert>
  )
}

// Skeleton cards and rows: the shape of the dashboard while it loads.
// A second skeleton on one screen passes no label: one announcement is enough.
export function DashboardSkeleton({ cards, lists, label }: { cards: number; lists: number; label?: string }) {
  return (
    <div className="placeholder-glow mb-4" role={label ? 'status' : undefined}>
      {label && <span className="visually-hidden">{label}</span>}
      <div className="row g-3" aria-hidden="true">
        {Array.from({ length: cards }, (_, card) => (
          <div key={card} className={`col-12 ${cards === 3 ? 'col-md-4' : 'col-md-6'}`}>
            <div className="card tk-metric">
              <span className="placeholder col-6" />
              <span className="placeholder placeholder-lg col-3" />
            </div>
          </div>
        ))}
        {Array.from({ length: lists }, (_, list) => (
          <div key={list} className="col-12">
            <div className="card card-body">
              {[0, 1, 2].map((row) => (
                <span key={row} className="placeholder col-12 mb-2" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Metric card: one link, holding a label, a large value, and an optional
// caption. With `onActivate` the link stays on this screen.
export function MetricCard({
  label,
  value,
  caption,
  to,
  onActivate,
}: {
  label: string
  value: number
  caption?: string
  to: string
  onActivate?: MouseEventHandler<HTMLAnchorElement>
}) {
  return (
    <Link to={to} className="card tk-metric" aria-label={`${label}: ${value}`} onClick={onActivate}>
      <span className="tk-metric__label">{label}</span>
      <span className="tk-metric__value">{value}</span>
      {caption && <span className="tk-metric__caption">{caption}</span>}
    </Link>
  )
}

export interface LinkTableRow {
  key: string
  label: string
  // The badge shown for the label.
  display: ReactNode
  count: number
  to: string
}

// Link table: a label and a count, each row one link. The link stretches
// over its row, so the count is part of the target too.
export function LinkTable({ title, rows }: { title: string; rows: LinkTableRow[] }) {
  const headingId = useId()

  return (
    <section className="card tk-dashboard-card h-100" aria-labelledby={headingId}>
      <div className="card-body">
        <h2 id={headingId} className="h6 mb-2">
          {title}
        </h2>
        <table className="table mb-0 tk-link-table">
          <thead className="visually-hidden">
            <tr>
              <th scope="col">{title}</th>
              <th scope="col">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="tk-link-table__row">
                <th scope="row">
                  <Link to={row.to} className="stretched-link" aria-label={`${row.label}: ${row.count}`}>
                    {row.display}
                  </Link>
                </th>
                <td className="text-end">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Dashboard list: a titled card of at most five rows, each a link to the
// item. `sectionRef` lets a metric card move focus here.
export function DashboardList<T extends { id: number }>({
  title,
  caption,
  items,
  empty,
  rowTo,
  renderRow,
  sectionId,
  sectionRef,
}: {
  title: string
  caption?: string
  items: T[]
  empty: string
  rowTo: (item: T) => string
  renderRow: (item: T) => ReactNode
  sectionId?: string
  sectionRef?: Ref<HTMLElement>
}) {
  const headingId = useId()

  return (
    <section
      id={sectionId}
      ref={sectionRef}
      tabIndex={sectionRef ? -1 : undefined}
      className="card tk-dashboard-card h-100"
      aria-labelledby={headingId}
    >
      <div className="card-body">
        <h2 id={headingId} className="h6 mb-1">
          {title}
        </h2>
        {caption && <p className="text-muted small mb-2">{caption}</p>}
        {items.length === 0 ? (
          <p className="text-muted mb-0">{empty}</p>
        ) : (
          <ul className="list-unstyled mb-0">
            {items.map((item) => (
              <li key={item.id} className="tk-dashboard-row">
                <Link to={rowTo(item)} className="tk-dashboard-row__link">
                  {renderRow(item)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
