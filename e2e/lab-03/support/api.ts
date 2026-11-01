import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, request, type APIRequestContext } from '@playwright/test'
import type { E2EUser } from './users'

const ATTACHMENT_FIXTURE = path.join(__dirname, '..', '..', 'lab-02', 'fixtures', 'attachment.png')

// The API the client under test talks to. A spec sends a request straight
// to it only to check what the backend itself answers (a refusal the UI
// never lets a user reach), or to arrange data a flow starts from.
export const API_URL = process.env.API_URL ?? 'http://localhost:4000'

export function apiUrl(path: string): string {
  return `${API_URL}${path}`
}

// A signed-in API session for arranging data, obtained the way the client
// obtains one: POST /api/auth/login. The flow under test still signs in
// through the Login screen. Dispose of it when done.
export async function apiSessionFor(user: E2EUser): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: API_URL })
  const response = await api.post('/api/auth/login', { data: { email: user.email, password: user.password } })
  expect(response.status(), `sign-in of ${user.email} to arrange data`).toBe(200)

  return api
}

export interface ArrangedTicket {
  id: number
  ticketNumber: string
  summary: string
}

// Creates a Ticket as the given Requester through POST /api/tickets, for a
// flow that starts from an existing Ticket rather than from Create Ticket.
export async function createTicketFor(requester: E2EUser, summary: string): Promise<ArrangedTicket> {
  const api = await apiSessionFor(requester)
  try {
    const [categories, relatedSystems] = await Promise.all([
      api.get('/api/categories').then((res) => res.json() as Promise<{ id: number }[]>),
      api.get('/api/related-systems').then((res) => res.json() as Promise<{ id: number }[]>),
    ])
    const response = await api.post('/api/tickets', {
      data: {
        categoryId: categories[0].id,
        relatedSystemId: relatedSystems[0].id,
        requestedPriority: 'MEDIUM',
        summary,
        description: 'Arranged by the Lab 3 E2E suite as the starting point of a flow.',
      },
    })
    expect(response.status(), 'arranging a Ticket').toBe(201)
    const ticket = (await response.json()) as { id: number; ticketNumber: string }

    return { id: ticket.id, ticketNumber: ticket.ticketNumber, summary }
  } finally {
    await api.dispose()
  }
}

// Uploads one Attachment to the Requester's own Ticket, and soft-removes
// it again when a removal reason is given.
export async function attachFileTo(
  requester: E2EUser,
  ticket: ArrangedTicket,
  filename: string,
  removalReason?: string,
) {
  const api = await apiSessionFor(requester)
  try {
    const response = await api.post(`/api/tickets/${ticket.id}/attachments`, {
      multipart: { file: { name: filename, mimeType: 'image/png', buffer: readFileSync(ATTACHMENT_FIXTURE) } },
    })
    expect(response.status(), 'arranging an Attachment').toBe(201)
    if (removalReason === undefined) return

    const { id } = (await response.json()) as { id: number }
    const removed = await api.post(`/api/attachments/${id}/remove`, { data: { removalReason } })
    expect(removed.status(), 'arranging a removed Attachment').toBe(200)
  } finally {
    await api.dispose()
  }
}

// Records a Done Action Taken, which a move to Resolved needs (Lab 4 BR-19).
export async function addDoneAction(staff: E2EUser, ticketId: number) {
  const api = await apiSessionFor(staff)
  try {
    const added = await api.post(`/api/staff/tickets/${ticketId}/actions-taken`, {
      data: {
        clientRequestId: randomUUID(),
        status: 'DONE',
        description: 'Arranged by the E2E suite.',
        result: 'The problem no longer occurs.',
      },
    })
    expect(added.status(), 'arranging a Done Action Taken').toBe(201)
  } finally {
    await api.dispose()
  }
}

// Makes the staff user the Ticket Owner of a New Ticket and moves it to In
// Progress, with a Done Action Taken: the state from which every status
// dialog can be opened.
export async function startWorkOn(staff: E2EUser & { id: number }, ticket: ArrangedTicket) {
  const api = await apiSessionFor(staff)
  try {
    const claimed = await api.put(`/api/staff/tickets/${ticket.id}/owner`, {
      data: { ownerId: staff.id, expectedOwnerId: null },
    })
    expect(claimed.status(), 'arranging the Ticket Owner').toBe(200)
    const started = await api.post(`/api/staff/tickets/${ticket.id}/status`, {
      data: { status: 'IN_PROGRESS', expectedStatus: 'OPEN' },
    })
    expect(started.status(), 'arranging the In Progress status').toBe(200)
    await addDoneAction(staff, ticket.id)
  } finally {
    await api.dispose()
  }
}
