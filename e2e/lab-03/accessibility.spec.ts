import { test, expect, type Page } from '@playwright/test'
import { attachFileTo, createTicketFor, startWorkOn } from './support/api'
import {
  expectDialogOpensTrapsAndReturnsFocus,
  expectFocusTrapped,
  expectKeyboardReachable,
} from './support/keyboard'
import { signInAs, submitLogin, userMenuButton } from './support/signIn'
import { E2E_USERS, createDisposableUser } from './support/users'

// E2E-13 (docs/lab-03/tests.md; AC-51, ui-spec.md §12): a keyboard-only
// pass over every Lab 3 screen and dialog. Controls are reached by pressing
// Tab, and buttons, menus, tabs, and dialogs are worked with Enter, Space,
// Escape, and the arrow keys; nothing is clicked. A value that only sets a
// scene up (a search, a chosen option) is put in the field directly.

// A focus ring that is still fading in has no settled style to inspect.
test.use({ contextOptions: { reducedMotion: 'reduce' } })

// The whole page: the shell header and the screen inside it.
const wholePage = (page: Page) => page.locator('body')

test('E2E-13 Login', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
  await expect(page.getByLabel('Email address')).toBeFocused()

  await expectKeyboardReachable(page, wholePage(page))

  // The show/hide button is a real button whose name follows its state.
  await page.getByRole('button', { name: 'Show password' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Hide password' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')

  // An empty submit from the keyboard puts focus on the first invalid field.
  await page.getByRole('button', { name: 'Sign In' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Enter your email address.')).toBeVisible()
  await expect(page.getByLabel('Email address')).toBeFocused()
})

test('E2E-13 Change Password, mandatory and voluntary', async ({ page }) => {
  // Mandatory: reached by signing in with an initial password.
  const newcomer = createDisposableUser('REQUESTER', { mustChangePassword: true })
  await page.goto('/login')
  await submitLogin(page, newcomer.email, newcomer.password)
  await expect(page.getByRole('heading', { level: 1, name: 'Change Password' })).toBeVisible()

  await expectKeyboardReachable(page, wholePage(page))

  // The checklist says in text, not only by colour, which rules are met.
  const checklist = page.getByRole('group', { name: 'Password must:' })
  await expect(checklist).toContainText('Not met: Be at least 8 characters')
  await page.getByLabel('New password', { exact: true }).focus()
  await page.keyboard.type('Abcdefg1')
  await expect(checklist).toContainText('Met: Be at least 8 characters')
  await expect(checklist).toContainText('Not met: Include a special character')

  await page.getByRole('button', { name: 'Logout' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()

  // Voluntary: opened from the user menu, with the keyboard.
  const requester = await signInAs(page, 'REQUESTER')
  const menuButton = userMenuButton(page, requester)
  await menuButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  // The shell header with its menu open. The screen below it here is My
  // Tickets, a Lab 2 screen, which is not part of this pass.
  await expectKeyboardReachable(page, page.getByRole('banner'))

  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: 'Change Password' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/change-password$/)
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()

  await expectKeyboardReachable(page, wholePage(page))
})

test('E2E-13 Requester Ticket Detail', async ({ page }) => {
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, `E2E-13 requester detail ${Date.now()}`)
  await attachFileTo(E2E_USERS.REQUESTER, ticket, 'evidence.png')

  await signInAs(page, 'REQUESTER')
  await page.goto(`/tickets/${ticket.id}`)
  await expect(page.getByRole('heading', { level: 1, name: ticket.ticketNumber })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download evidence.png' })).toBeVisible()
  await expect(page.getByText('No comments yet.')).toBeVisible()

  await expectKeyboardReachable(page, wholePage(page))

  // Problem Appears Resolved and a Public Comment, from the keyboard.
  await page.getByRole('button', { name: 'Problem Appears Resolved' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Withdraw' })).toBeVisible()

  await page.getByLabel('Add a comment').focus()
  await page.keyboard.type('Typed and posted without a mouse.')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Post Comment' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Comment posted' })).toBeVisible()

  await expectKeyboardReachable(page, wholePage(page))
})

test('E2E-13 Ticket Queue', async ({ page }) => {
  await signInAs(page, 'IT_STAFF')
  await expect(page.getByText(/Showing \d+ to \d+ of \d+ tickets/)).toBeVisible()

  await expectKeyboardReachable(page, wholePage(page))

  // A sortable column header is a button that announces the direction.
  const header = page.getByRole('columnheader', { name: /Ticket No\./ })
  await expect(header).toHaveAttribute('aria-sort', 'none')
  await header.getByRole('button').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('columnheader', { name: /Ticket No\./ })).toHaveAttribute('aria-sort', 'descending')
  await page.getByRole('columnheader', { name: /Ticket No\./ }).getByRole('button').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('columnheader', { name: /Ticket No\./ })).toHaveAttribute('aria-sort', 'ascending')

  // The Ticket Number link opens Ticket Detail from the keyboard.
  const firstTicket = page.getByRole('table').getByRole('link').first()
  const ticketNumber = (await firstTicket.textContent()) ?? ''
  await firstTicket.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: ticketNumber })).toBeVisible()
})

test('E2E-13 Staff Ticket Detail, its tabs, and its dialogs', async ({ page }) => {
  test.slow()
  // Owned by someone else and In Progress: every dialog can then be opened.
  const otherOwner = createDisposableUser('IT_STAFF')
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, `E2E-13 staff detail ${Date.now()}`)
  await attachFileTo(E2E_USERS.REQUESTER, ticket, 'evidence.png')
  await startWorkOn(otherOwner, ticket)

  const staff = await signInAs(page, 'IT_STAFF')
  await page.goto(`/staff/tickets/${ticket.id}`)
  await expect(page.getByRole('heading', { level: 1, name: ticket.ticketNumber })).toBeVisible()
  await expect(page.getByText('No comments yet.')).toBeVisible()

  await expectKeyboardReachable(page, wholePage(page))

  // Tabs: the arrow keys move between them, and each panel is labelled by
  // its tab.
  const tab = (name: RegExp) => page.getByRole('tab', { name })
  await tab(/Public Comments/).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tab(/Internal Notes/)).toBeFocused()
  await expect(tab(/Internal Notes/)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: /Internal Notes/ })).toBeVisible()
  await expect(page.getByRole('tabpanel', { name: /Public Comments/ })).toHaveCount(0)
  await expectKeyboardReachable(page, wholePage(page))

  await tab(/Internal Notes/).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tab(/Attachments/)).toBeFocused()
  await expect(page.getByRole('tabpanel', { name: /Attachments/ })).toBeVisible()
  await expectKeyboardReachable(page, wholePage(page))

  // From the last tab the arrow keys wrap round to the first, and back.
  await tab(/Attachments/).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tab(/Public Comments/)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tab(/Attachments/)).toBeFocused()

  // Dialogs: each is opened from the keyboard, holds focus, and gives it
  // back to the button that opened it when dismissed with Escape.
  const operations = page.getByRole('region', { name: 'Manage this ticket' })

  await operations.getByLabel('Ticket Owner').selectOption({ label: staff.name })
  await expectDialogOpensTrapsAndReturnsFocus(
    page,
    operations.getByRole('button', { name: 'Update Owner' }),
    page.getByRole('dialog', { name: 'Reassign ticket?' }),
  )

  const updateStatus = operations.getByRole('button', { name: 'Update Status' })
  await operations.getByLabel('Current Status').selectOption({ label: 'Resolved' })
  await expectDialogOpensTrapsAndReturnsFocus(
    page,
    updateStatus,
    page.getByRole('dialog', { name: `Resolve ${ticket.ticketNumber}` }),
  )

  await operations.getByLabel('Current Status').selectOption({ label: 'Cancelled' })
  await expectDialogOpensTrapsAndReturnsFocus(page, updateStatus, page.getByRole('dialog', { name: 'Cancel ticket?' }))

  // Dismissing each dialog sent nothing: the Ticket is as it was.
  await page.reload()
  await expect(page.getByRole('group', { name: 'Ticket status' })).toHaveText('In Progress')
  await expect(operations.getByText(`Current owner: ${otherOwner.name}`)).toBeVisible()
})

test('E2E-13 User Management and its dialogs', async ({ page }) => {
  test.slow()
  const user = createDisposableUser('IT_STAFF')
  await signInAs(page, 'ADMINISTRATOR')
  await page.getByLabel('Search users').fill(user.email)
  await expect(page.getByRole('table').locator('tbody').getByRole('row')).toHaveCount(1)

  await expectKeyboardReachable(page, wholePage(page))

  // The create panel, then the edit panel, beside the list.
  await page.getByRole('button', { name: 'Create User' }).focus()
  await page.keyboard.press('Enter')
  const createPanel = page.getByRole('region', { name: 'Create New User' })
  await expect(createPanel.getByLabel('Full Name')).toBeFocused()
  await expectKeyboardReachable(page, wholePage(page))

  await page.getByRole('button', { name: `Edit ${user.name}` }).focus()
  await page.keyboard.press('Enter')
  const editPanel = page.getByRole('region', { name: 'Edit User' })
  await expect(editPanel.getByLabel('Full Name')).toBeFocused()
  await expectKeyboardReachable(page, wholePage(page))

  // Deactivate confirmation: Space turns the switch off, Enter saves.
  const activeSwitch = editPanel.getByRole('switch', { name: 'Active' })
  await activeSwitch.focus()
  await page.keyboard.press('Space')
  await expect(activeSwitch).not.toBeChecked()
  await expectDialogOpensTrapsAndReturnsFocus(
    page,
    editPanel.getByRole('button', { name: 'Save Changes' }),
    page.getByRole('dialog', { name: 'Deactivate user?' }),
  )
  await activeSwitch.focus()
  await page.keyboard.press('Space')
  await expect(activeSwitch).toBeChecked()

  // New initial password: the confirmation, then the one-time password
  // dialog, which Escape does not close.
  const setPassword = editPanel.getByRole('button', { name: 'Set New Initial Password' })
  const confirmation = page.getByRole('dialog', { name: 'Set new initial password?' })
  await expectDialogOpensTrapsAndReturnsFocus(page, setPassword, confirmation)

  await page.keyboard.press('Enter')
  await confirmation.getByRole('button', { name: 'Set New Initial Password' }).focus()
  await page.keyboard.press('Enter')
  const oneTimePassword = page.getByRole('dialog', { name: `Temporary password for ${user.name}` })
  await expectFocusTrapped(page, oneTimePassword)
  await page.keyboard.press('Escape')
  await expect(oneTimePassword).toBeVisible()
  await oneTimePassword.getByRole('button', { name: 'Done' }).focus()
  await page.keyboard.press('Enter')
  await expect(oneTimePassword).toHaveCount(0)
})

test('E2E-13 the User Management panel as a dialog below desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 })
  const administrator = await signInAs(page, 'ADMINISTRATOR')
  await page.getByLabel('Search users').fill(administrator.email)
  await expect(page.getByRole('table').locator('tbody').getByRole('row')).toHaveCount(1)

  await expectDialogOpensTrapsAndReturnsFocus(
    page,
    page.getByRole('button', { name: `Edit ${administrator.name}` }),
    page.getByRole('dialog', { name: 'Edit User' }),
  )
  await expectDialogOpensTrapsAndReturnsFocus(
    page,
    page.getByRole('button', { name: 'Create User' }),
    page.getByRole('dialog', { name: 'Create New User' }),
  )
})
