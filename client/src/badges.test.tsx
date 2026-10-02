import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Priority, Role, TicketStatus } from './api'
import { AccountBadge, AppearsResolvedBadge, PriorityBadge, RoleBadge, StatusBadge } from './badges'

// UI-32 (docs/lab-03/tests.md): every badge shows the label and carries the
// style class that docs/lab-03/ui-spec.md §2.2 gives its value. The expected
// values below are that table, written out by hand.
describe('Status badge', () => {
  const STATUSES: [TicketStatus, string, string[]][] = [
    ['NEW', 'New', ['text-bg-success']],
    ['OPEN', 'Open', ['tk-badge--info']],
    ['IN_PROGRESS', 'In Progress', ['tk-badge--in-progress']],
    ['WAITING_FOR_REQUESTER', 'Waiting for Requester', ['tk-badge--warning']],
    ['RESOLVED', 'Resolved', ['tk-badge--success']],
    ['REOPENED', 'Reopened', ['tk-badge--error']],
    ['CLOSED', 'Closed', ['tk-badge--neutral']],
    ['CANCELLED', 'Cancelled', ['tk-badge--neutral', 'tk-badge--outlined']],
  ]

  it.each(STATUSES)('%s reads "%s" in its own style', (status, label, classes) => {
    render(<StatusBadge status={status} />)

    expect(screen.getByText(label)).toHaveClass('badge', ...classes)
  })

  it('outlines Cancelled only, so it is told apart from Closed', () => {
    const { unmount } = render(<StatusBadge status="CANCELLED" />)
    expect(screen.getByText('Cancelled')).toHaveClass('tk-badge--outlined')
    unmount()

    render(<StatusBadge status="CLOSED" />)
    expect(screen.getByText('Closed')).not.toHaveClass('tk-badge--outlined')
  })

  it('puts a check icon on Resolved only, hidden from assistive technology', () => {
    const { unmount } = render(<StatusBadge status="RESOLVED" />)
    const icon = screen.getByText('✓')
    expect(screen.getByText('Resolved')).toContainElement(icon)
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    unmount()

    render(<StatusBadge status="CLOSED" />)
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })
})

describe('Priority badge', () => {
  const PRIORITIES: [Priority, string, string[]][] = [
    ['LOW', 'Low', ['text-bg-success-subtle', 'text-success-emphasis']],
    ['MEDIUM', 'Medium', ['text-bg-warning-subtle', 'text-warning-emphasis']],
    ['HIGH', 'High', ['text-bg-danger-subtle', 'text-danger-emphasis']],
  ]

  // One component serves both Requested Priority and IT Priority.
  it.each(PRIORITIES)('%s reads "%s" in the Lab 2 style', (priority, label, classes) => {
    render(<PriorityBadge priority={priority} />)

    expect(screen.getByText(label)).toHaveClass('badge', ...classes)
  })
})

describe('Role badge', () => {
  const ROLES: [Role, string, string][] = [
    ['REQUESTER', 'Requester', 'tk-badge--neutral'],
    ['IT_STAFF', 'IT Staff', 'tk-badge--info'],
    ['ADMINISTRATOR', 'Administrator', 'tk-badge--outline'],
  ]

  it.each(ROLES)('%s reads "%s" in its own style', (role, label, className) => {
    render(<RoleBadge role={role} />)

    expect(screen.getByText(label)).toHaveClass('badge', className)
  })
})

describe('Account badge', () => {
  it('reads "Active" in the Success style', () => {
    render(<AccountBadge isActive />)

    expect(screen.getByText('Active')).toHaveClass('badge', 'tk-badge--success')
  })

  it('reads "Inactive" in the Neutral style', () => {
    render(<AccountBadge isActive={false} />)

    expect(screen.getByText('Inactive')).toHaveClass('badge', 'tk-badge--neutral')
  })
})

describe('Flag badge', () => {
  it('reads "Requester: appears resolved" in the Success outline style, with a flag icon', () => {
    render(<AppearsResolvedBadge />)

    const badge = screen.getByText('Requester: appears resolved')
    expect(badge).toHaveClass('badge', 'tk-badge--success-outline')
    const icon = screen.getByText('⚑')
    expect(badge).toContainElement(icon)
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
})
