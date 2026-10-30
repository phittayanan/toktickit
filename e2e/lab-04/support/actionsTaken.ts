import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { apiSessionFor, type ArrangedTicket } from '../../lab-03/support/api'
import type { E2EUser } from '../../lab-03/support/users'

export interface ArrangedAction {
  id: number
  version: number
  description: string
  actionAt: string
  result: string | null
  status: string
  assignee: { id: number }
  followUpRequired: boolean
  followUpNote: string | null
  attachmentNotes: string | null
}

// Adds an Action Taken through the API, for a flow that starts from one. It
// is the signed-in staff user's own unless `body` says otherwise.
export async function addActionFor(
  staff: E2EUser,
  ticket: ArrangedTicket,
  body: Record<string, unknown>,
): Promise<ArrangedAction> {
  const api = await apiSessionFor(staff)
  try {
    const response = await api.post(`/api/staff/tickets/${ticket.id}/actions-taken`, {
      data: { clientRequestId: randomUUID(), status: 'PLANNED', ...body },
    })
    expect(response.status(), 'arranging an Action Taken').toBe(201)

    return (await response.json()) as ArrangedAction
  } finally {
    await api.dispose()
  }
}

// Saves a new description of an Action Taken as another session would.
export async function editActionElsewhere(
  staff: E2EUser,
  ticket: ArrangedTicket,
  action: ArrangedAction,
  description: string,
) {
  const api = await apiSessionFor(staff)
  try {
    const { id, version, assignee, ...fields } = action
    const response = await api.put(`/api/staff/tickets/${ticket.id}/actions-taken/${id}`, {
      data: {
        expectedVersion: version,
        actionAt: fields.actionAt,
        description,
        result: fields.result,
        status: fields.status,
        assigneeId: assignee.id,
        followUpRequired: fields.followUpRequired,
        followUpNote: fields.followUpNote,
        attachmentNotes: fields.attachmentNotes,
      },
    })
    expect(response.status(), 'arranging a change by someone else').toBe(200)
  } finally {
    await api.dispose()
  }
}

// What the API holds for the Ticket, whatever the screen shows.
export async function actionsOf(staff: E2EUser, ticket: ArrangedTicket): Promise<ArrangedAction[]> {
  const api = await apiSessionFor(staff)
  try {
    const response = await api.get(`/api/tickets/${ticket.id}/actions-taken`)
    expect(response.status()).toBe(200)

    return (await response.json()) as ArrangedAction[]
  } finally {
    await api.dispose()
  }
}

export function card(page: Page) {
  return page.locator('#actions-taken')
}

export function rowOf(page: Page, description: string) {
  return card(page).getByRole('row', { name: description })
}

export async function openStaffTicket(page: Page, ticket: ArrangedTicket) {
  await page.goto(`/staff/tickets/${ticket.id}`)
  await expect(page.getByRole('heading', { level: 1, name: ticket.ticketNumber })).toBeVisible()
  await expect(card(page).getByRole('heading', { name: /Actions Taken \(\d+\)/ })).toBeVisible()
}

export async function openRequesterTicket(page: Page, ticket: ArrangedTicket) {
  await page.goto(`/tickets/${ticket.id}`)
  await expect(page.getByRole('heading', { level: 1, name: ticket.ticketNumber })).toBeVisible()
  await expect(card(page).getByRole('heading', { name: /Actions Taken \(\d+\)/ })).toBeVisible()
}
