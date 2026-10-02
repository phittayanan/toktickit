# Lab 3 Visual Inspection and Responsive Evidence: Results (#55)

The checklist of `ui-spec.md` §13, completed for Login, Change Password,
Requester Ticket Detail, Ticket Queue, Staff Ticket Detail, and User
Management at desktop (1280px), tablet (900px), and mobile (390px). It is
the acceptance bar for `tests.md` VIS-01 to VIS-06 and AC-50.

## How the evidence was produced

- **Screenshots**: 100 images under `artifacts/lab-03/screenshots/`, in the
  five folders of `ui-spec.md` §14, written by
  `e2e/lab-03/visual-*.spec.ts` (VIS-01 to VIS-05). Each screen has its
  three widths, the variants §14 names, and the states this checklist asks
  about (open menu, keyboard focus, validation, loading, failure,
  forbidden, not-found, conflict, no-results). A file name gives the width
  and the state, for example `staff-queue/tablet-no-results.png`. Dialog,
  menu, and focus pictures show the viewport; the others show the whole
  page.
- **Automated checks**: `e2e/lab-03/responsive.spec.ts` (VIS-06) checks, on
  every screen at every width, that the page is no wider than the viewport
  and that nothing reaches past its right edge; that the Ticket Queue and
  User Management are tables on desktop and tablet and cards on mobile;
  and that every control is a 44px tap target on mobile (§11). The visual
  specs also assert what a picture cannot prove by itself: token colours
  of focused, invalid, read-only, and disabled controls, that a dialog
  keeps keyboard focus inside, and that a select shows all of its text.
  `client/src/badges.test.tsx` (UI-32) checks every badge's label and
  style class against `ui-spec.md` §2.2.
- **Inspection**: every screenshot was opened and judged against the
  twelve items, with colours sampled from the pixels. The tables below
  record the result for the committed images.
- **Data**: the specs sign in as the users the E2E global setup creates
  and build their own Tickets through the API; the seed Tickets supply
  every status and priority for `staff-queue/*-all-statuses.png`.
  Screenshots are evidence, not pixel baselines (`tests.md` §7): ticket
  numbers, dates, and the test users in a list differ from run to run.

To reproduce, follow "Running Tests" in the README (a database whose name
ends in `_e2e`, the server and the client running) and run
`npx playwright test e2e/lab-03`.

No screenshot shows a password, an Initial Password, or a session value.
Password fields show dots, and the generated Initial Password in
`user-management/*-one-time-password.png` is covered by a solid magenta
mask that Playwright draws over the field.

## Results

Each cell is **pass**, **n/a** (the item does not apply to the screen), or
**fail**, with the image it rests on. Where a state was captured at one
width only, the other widths name that image: the state is drawn by the
same component at every width. No cell is a fail.

Items, in the order of `ui-spec.md` §13: 1 design consistency, 2 role
navigation, 3 badges, 4 editable versus read-only, 5 Public Comments
versus Internal Notes, 6 validation under the field, 7 focus, 8 no
clipped labels, 9 no overlap, 10 no horizontal scroll, 11 table-to-card,
12 states present and styled.

### Login (`authentication/login-*`)

| Item | Desktop | Tablet | Mobile |
|---|---|---|---|
| 1 | pass: white card, Primary green button, token colours only (`login-desktop.png`) | pass (`login-tablet.png`) | pass: card with 16px gutters (`login-mobile.png`) |
| 2 | n/a: Login has no shell (§5) | n/a | n/a |
| 3 | n/a: no badges | n/a | n/a |
| 4 | n/a: both fields are editable | n/a | n/a |
| 5 | n/a | n/a | n/a |
| 6 | pass: each message directly under its field (`login-desktop-validation.png`) | pass (`login-tablet-validation.png`) | pass (`login-mobile-validation.png`) |
| 7 | pass: 2px Secondary green ring on Sign In (`login-desktop-focus.png`) | pass (`login-tablet-focus.png`) | pass (`login-mobile-focus.png`) |
| 8 | pass: title, labels, helper text complete (`login-desktop.png`) | pass (`login-tablet.png`) | pass: helper text on one line (`login-mobile.png`) |
| 9 | pass: alert sits between Password and Sign In (`login-desktop-failure.png`) | pass: messages push Sign In down (`login-tablet-validation.png`) | pass (`login-mobile-invalid-credentials.png`) |
| 10 | pass: 420px card centred (`login-desktop.png`); VIS-06 | pass (`login-tablet.png`); VIS-06 | pass: card x 16 to 373 of 390 (`login-mobile.png`); VIS-06 |
| 11 | n/a: no table | n/a | n/a |
| 12 | pass: failure alert in Error colours, values kept (`login-desktop-failure.png`) | pass: shown at desktop (`login-desktop-failure.png`) and mobile (`login-mobile-invalid-credentials.png`) | pass: "Invalid email or password." alert, password cleared (`login-mobile-invalid-credentials.png`) |

### Change Password (`authentication/change-password-*`)

| Item | Desktop | Tablet | Mobile |
|---|---|---|---|
| 1 | pass: green header, white card, pale-green checklist panel (`change-password-desktop.png`) | pass (`change-password-tablet.png`) | pass (`change-password-mobile.png`) |
| 2 | pass: My Tickets, Create Ticket, name and badge (`change-password-desktop.png`); menu contents in `requester-ticket-detail/desktop-menu.png`; the mandatory change shows only the wordmark and Logout, as §6 says (`change-password-desktop-mandatory.png`) | pass (`change-password-tablet.png`, `requester-ticket-detail/tablet-menu.png`) | pass: Menu button (`change-password-mobile.png`); its contents are the same shell for the same Requester (`requester-ticket-detail/mobile-menu.png`); mandatory shows Logout (`change-password-mobile-mandatory.png`) |
| 3 | pass: header Requester badge is Neutral (`change-password-desktop.png`) | pass (`change-password-tablet.png`) | pass: badge inside the menu (`requester-ticket-detail/mobile-menu.png`) |
| 4 | n/a: all three fields are editable | n/a | n/a |
| 5 | n/a | n/a | n/a |
| 6 | pass: three messages, each under its field; two rules met and two not met are told apart (`change-password-desktop-validation.png`) | pass (`change-password-tablet-validation.png`) | pass (`change-password-mobile-validation.png`) |
| 7 | pass: Secondary green border and ring on New password (`change-password-desktop-focus.png`) | pass (`change-password-tablet-focus.png`) | pass (`change-password-mobile-focus.png`) |
| 8 | pass: "Current (temporary) password" complete (`change-password-desktop-mandatory.png`) | pass (`change-password-tablet.png`) | pass (`change-password-mobile-mandatory.png`) |
| 9 | pass (`change-password-desktop-failure.png`) | pass (`change-password-tablet-validation.png`) | pass (`change-password-mobile-validation.png`) |
| 10 | pass: 480px card centred (`change-password-desktop.png`); VIS-06 | pass (`change-password-tablet.png`); VIS-06 | pass (`change-password-mobile.png`); VIS-06 |
| 11 | n/a: no table | n/a | n/a |
| 12 | pass: safe-failure alert, fields keep their values (`change-password-desktop-failure.png`) | pass: shown at desktop (`change-password-desktop-failure.png`) | pass: shown at desktop (`change-password-desktop-failure.png`) |

### Requester Ticket Detail (`requester-ticket-detail/`)

| Item | Desktop | Tablet | Mobile |
|---|---|---|---|
| 1 | pass: green header, white Public Comments card, token colours only (`desktop.png`) | pass (`tablet.png`) | pass: full-width Post Comment (`mobile.png`) |
| 2 | pass: only My Tickets and Create Ticket; name, Requester badge, Change Password, Logout (`desktop-menu.png`) | pass (`tablet-menu.png`) | pass: all of them in the Menu panel (`mobile-menu.png`) |
| 3 | pass: In Progress, High, Medium, IT Staff, Requester badges match §2.2 (`desktop.png`) | pass (`tablet.png`) | pass: also New solid green, "Unassigned" italic text (`mobile-empty-comments.png`) |
| 4 | pass: read-only values on the read-only surface, comment box and file chooser white (`desktop.png`) | pass (`tablet.png`) | pass (`mobile.png`) |
| 5 | n/a: a Requester sees only Public Comments, captioned "Visible to you and IT Staff." (`desktop.png`) | n/a | n/a |
| 6 | pass: "A comment is required." directly under the textarea (`desktop-validation.png`) | pass (`tablet-validation.png`) | pass (`mobile-validation.png`) |
| 7 | pass: 2px Secondary green outline on Withdraw (`desktop-focus.png`) | pass (`tablet-focus.png`) | pass (`mobile-focus.png`) |
| 8 | pass: labels and values complete, Summary on one line (`desktop.png`) | pass: Summary wraps to two lines in its box (`tablet.png`) | pass: Summary wraps to three lines, the long link breaks inside the card (`mobile.png`) |
| 9 | pass: open menu clear of the content (`desktop-menu.png`) | pass (`tablet-menu.png`) | pass: menu pushes the content down (`mobile-menu.png`) |
| 10 | pass (`desktop.png`); VIS-06 | pass (`tablet.png`); VIS-06 | pass (`mobile.png`); VIS-06 |
| 11 | n/a: no table | n/a | n/a |
| 12 | pass: spinner beside "Loading ticket…" (`desktop-loading.png`); error alert (`desktop-failure.png`) | pass: shown at desktop (`desktop-loading.png`, `desktop-failure.png`) and mobile (`mobile-not-found.png`, `mobile-empty-comments.png`) | pass: "Ticket not found" card (`mobile-not-found.png`); "No comments yet." (`mobile-empty-comments.png`) |

### Ticket Queue (`staff-queue/`)

| Item | Desktop | Tablet | Mobile |
|---|---|---|---|
| 1 | pass: token colours only, table text in the Text token (`desktop.png`) | pass (`tablet.png`) | pass (`mobile.png`) |
| 2 | pass: only Ticket Queue; name, IT Staff badge, Change Password, Logout (`desktop-menu.png`) | pass (`tablet-menu.png`) | pass: all of them in the Menu panel (`mobile-menu.png`) |
| 3 | pass: all eight status badges, Low, Medium, High, and the flag badge match §2.2; "Unassigned" is muted italic text (`desktop-all-statuses.png`) | pass (`tablet-all-statuses.png`) | pass (`mobile-all-statuses.png`) |
| 4 | n/a: filter controls only, no read-only fields | n/a | n/a |
| 5 | n/a: no comments or notes | n/a | n/a |
| 6 | n/a: no validated field | n/a | n/a |
| 7 | pass: 2px Secondary green ring on the first Ticket Number link (`desktop-focus.png`) and on Search (`desktop-no-results.png`) | pass (`tablet-focus.png`, `tablet-no-results.png`) | pass (`mobile-focus.png`) |
| 8 | pass: labels, select texts, and the seven headers whole (`desktop.png`) | pass: labels and select texts whole; the Search placeholder ends in an ellipsis and is also the tooltip (`tablet.png`) | pass: same (`mobile-filters-open.png`) |
| 9 | pass: filters, table, and open menu do not collide (`desktop-menu.png`) | pass: controls in two rows with gaps of 9px or more (`tablet.png`) | pass: open filter panel pushes the cards down (`mobile-filters-open.png`) |
| 10 | pass (`desktop.png`); VIS-06 | pass: table ends inside the card (`tablet.png`); VIS-06 | pass: cards inside 16px gutters (`mobile.png`); VIS-06 |
| 11 | pass: seven columns (`desktop.png`); VIS-06 | pass: five columns, Category and Last Updated on a muted line under Summary (`tablet.png`); VIS-06 | pass: one card per Ticket, filters behind the Filters button (`mobile.png`, `mobile-filters-open.png`); VIS-06 |
| 12 | pass: loading skeleton (`desktop-loading.png`), no-results (`desktop-no-results.png`), failure with Retry (`desktop-failure.png`); forbidden shown at mobile | pass: no-results (`tablet-no-results.png`); loading and failure shown at desktop; forbidden shown at mobile | pass: no-results (`mobile-no-results.png`), forbidden (`mobile-forbidden.png`); loading and failure shown at desktop |

The queue's Empty state is not in a screenshot; see "Not shown in a
screenshot" below.

### Staff Ticket Detail (`staff-ticket-detail/`)

| Item | Desktop | Tablet | Mobile |
|---|---|---|---|
| 1 | pass: token colours only; same header, cards, and buttons as the queue (`desktop.png`) | pass (`tablet.png`) | pass (`mobile.png`) |
| 2 | pass: only Ticket Queue, name and IT Staff badge (`desktop.png`); menu contents are the same shell for the same user (`staff-queue/desktop-menu.png`) | pass (`tablet.png`, `staff-queue/tablet-menu.png`) | pass: Menu button (`mobile.png`); its contents in `staff-queue/mobile-menu.png` |
| 3 | pass: In Progress, Medium, IT Staff, Requester, and flag badges (`desktop.png`); Open (`desktop-conflict.png`) | pass (`tablet.png`) | pass (`mobile.png`) |
| 4 | pass: Ticket information on the read-only surface; white selects only in the green-topped "Manage this ticket" card (`desktop.png`) | pass: that card below the information card, its three controls level in a row (`tablet.png`) | pass: stacked, full-width buttons (`mobile.png`) |
| 5 | pass: white panel with an Info note and a solid button, against a Warning-tinted panel with a lock, the "Internal — never shown to the Requester." banner, and an outlined button (`desktop.png`, `desktop-internal-notes.png`) | pass (`tablet.png`, `tablet-internal-notes.png`) | pass (`mobile.png`, `mobile-internal-notes.png`) |
| 6 | pass: "A resolution summary is required." directly under the textarea (`desktop-resolve-dialog.png`) | pass (`tablet-resolve-dialog.png`) | pass (`mobile-resolve-dialog.png`) |
| 7 | pass: ring on the Ticket Owner select (`desktop-focus.png`); focus inside the dialog (`desktop-resolve-dialog.png`); the spec asserts that the dialog keeps focus | pass (`tablet-focus.png`, `tablet-resolve-dialog.png`) | pass (`mobile-focus.png`, `mobile-resolve-dialog.png`) |
| 8 | pass: labels, buttons, and "Choose a new status…" whole (`desktop.png`) | pass: the three select texts whole, each clear of its arrow (`tablet.png`) | pass: labels and buttons whole; the tab bar scrolls within itself, as §9.7 allows (`mobile.png`) |
| 9 | pass: cards side by side, dialog centred on the backdrop (`desktop.png`, `desktop-resolve-dialog.png`) | pass: three controls in a row, nothing collides (`tablet.png`) | pass: everything stacked, dialog with 16px margins (`mobile.png`, `mobile-resolve-dialog.png`) |
| 10 | pass: the long link wraps inside its card (`desktop.png`); VIS-06 | pass (`tablet.png`); VIS-06 | pass (`mobile.png`); VIS-06 |
| 11 | n/a: no table | n/a | n/a |
| 12 | pass: loading skeleton, failure with Retry, not-found, conflict notice, and "No comments yet." (`desktop-loading.png`, `desktop-failure.png`, `desktop-not-found.png`, `desktop-conflict.png`); forbidden shown at mobile | pass: shown at desktop (the four images at left) and mobile (`mobile-forbidden.png`) | pass: forbidden (`mobile-forbidden.png`); the others shown at desktop |

### User Management (`user-management/`)

| Item | Desktop | Tablet | Mobile |
|---|---|---|---|
| 1 | pass: token colours only; shared card, field, button styles (`desktop.png`) | pass (`tablet.png`, `tablet-create-panel.png`) | pass (`mobile.png`, `mobile-create-panel.png`) |
| 2 | pass: only Ticket Queue and User Management; name, Administrator badge, Change Password, Logout (`desktop-menu.png`) | pass (`tablet-menu.png`) | pass: all of them in the Menu panel (`mobile-menu.png`) |
| 3 | pass: Requester and Inactive Neutral, IT Staff Info, Administrator Primary green outline, Active Success (`desktop.png`) | pass (`tablet.png`) | pass (`mobile.png`) |
| 4 | pass: on their own account the Active switch is faded and read-only, with "You cannot deactivate your own account."; editable fields are white (`desktop-edit-own-account.png`) | pass (`tablet-edit-own-account.png`) | pass (`mobile-edit-own-account.png`) |
| 5 | n/a: no comments or notes | n/a | n/a |
| 6 | pass: three messages directly under Full Name, Email, Role (`desktop-create-panel.png`); duplicate email under Email (`desktop-conflict.png`) | pass (`tablet-create-panel.png`) | pass (`mobile-create-panel.png`) |
| 7 | pass: ring on Create User (`desktop-focus.png`); focus on Done inside the dialog (`desktop-one-time-password.png`); the spec asserts that the dialogs keep focus | pass (`tablet-focus.png`, `tablet-create-panel.png`) | pass (`mobile-focus.png`, `mobile-create-panel.png`, `mobile-one-time-password.png`) |
| 8 | pass: the long name and email wrap whole, nothing truncated (`desktop.png`, `desktop-create-panel.png`) | pass: name wraps to three lines, email to two (`tablet.png`) | pass: both wrap inside the card (`mobile.png`) |
| 9 | pass: panel beside the list, dialog centred (`desktop-create-panel.png`, `desktop-one-time-password.png`) | pass: dialog centred over the dimmed list (`tablet-create-panel.png`) | pass: full-screen panel, cards do not collide (`mobile-create-panel.png`, `mobile.png`) |
| 10 | pass (`desktop.png`); VIS-06 | pass (`tablet.png`); VIS-06 | pass (`mobile.png`); VIS-06 |
| 11 | pass: five-column table (`desktop.png`); VIS-06 | pass: the table keeps all five columns (`tablet.png`); VIS-06 | pass: one card per user with name, status, email, role, Edit (`mobile.png`); VIS-06 |
| 12 | pass: loading skeleton (`desktop-loading.png`), no-results (`desktop-no-results.png`), conflict (`desktop-conflict.png`), failure with Retry (`desktop-failure.png`); forbidden shown at mobile | pass: no-results (`tablet-no-results.png`); loading, conflict, failure shown at desktop; forbidden shown at mobile | pass: no-results (`mobile-no-results.png`), forbidden (`mobile-forbidden.png`); loading, conflict, failure shown at desktop |

Not found and Empty do not apply to User Management: Users are never
deleted, and the signed-in Administrator is always in the list.

## Defects found and fixed

The first inspection failed several items. Each defect below was first
caught by an assertion in the specs named above, then fixed; all of them
are in `client/src/theme.css` unless a file is named.

Design consistency (item 1), Bootstrap colours showing through the theme:

- A focused field had Bootstrap's blue border inside the green ring; a
  focused invalid field and the invalid icon were Bootstrap's red instead
  of the Error token.
- Disabled Secondary buttons (Update Owner, Update Priority, Update
  Status) were Bootstrap blue.
- No select showed its arrow: the theme's `background` shorthand removed
  it.
- Table text on the Ticket Queue and User Management was pure black, and
  muted text and the file chooser's button were Bootstrap greys.
- Read-only values on Requester Ticket Detail used a Bootstrap grey
  instead of the read-only surface (`client/src/RequesterTicketDetail.tsx`).
- The queue's and the user list's loading rows were dark bars unlike the
  Ticket skeleton; the User Management table sat on the page colour
  inside its card, which hid the Neutral badges; the "Requester says
  resolved" checkbox had a border too faint to read as a checkbox; the
  header's Menu and Logout outline was an off-white.

States (item 12), on Requester Ticket Detail
(`client/src/RequesterTicketDetail.tsx`): the page-load failure was bare
red text, loading was an emoji with text, and "Ticket not found" was an
unfilled box. They are now an Error alert, a spinner, and a card.

Clipped or misplaced (items 8 and 9, §8.4, §9.7):

- On tablet, Staff Ticket Detail's status select clipped "Choose a new
  status…", and the three controls were not level when a line above one
  of them wrapped.
- On tablet, the queue's search and filters took three rows, with Clear
  Filters alone on the third; a long owner name widened the Owner select.
  The select is now capped there, with an ellipsis and the name as its
  tooltip (`client/src/StaffTicketQueue.tsx`).
- The queue's Search placeholder is cut short with an ellipsis; the field
  now carries the full text as its tooltip.
- On mobile, Staff Ticket Detail's breadcrumb link sat lower than the
  Ticket Number beside it.

Tap targets (§11), under 44px on mobile: the header wordmark link, "Back
to My Tickets" and the file chooser on Requester Ticket Detail, and the
button of the Forbidden page.

## Observed and not changed

These were seen during the inspection. None is one of the twelve items,
and each is outside this issue or a matter of taste, so they are recorded
rather than fixed.

- **Requester Ticket Detail, page-load failure wording**: the alert shows
  "Unable to connect to TokTickIT API" and has no Retry, where
  `ui-spec.md` §2.3 gives "Something went wrong. Please try again." with a
  Retry action. The state is present and styled, which is what item 12
  asks, but the wording and the missing Retry differ from §2.3. E2E-14
  covers the Ticket Queue, Staff Ticket Detail, and User Management, not
  this screen. It needs a decision and its own change.
- **Tablet filter rows depend on the font**: with the system fonts the
  theme names, the queue's controls take two rows at 900px
  (`staff-queue/tablet.png`). A wider fallback font, as on Linux, can
  push Clear Filters to a third row. Nothing overlaps or is clipped when
  it does, and no automated check asserts the row count for that reason.
- **Lab 2 screenshots**: the colour and select-arrow fixes above also
  change Create Ticket, My Tickets, and the Lab 2 parts of Ticket Detail.
  The images under `artifacts/lab-02/` were not regenerated here.
- Retry is an outlined button on the Ticket Queue and a link inside the
  alert on Staff Ticket Detail.
- On mobile, a long link in a comment breaks in the middle of a word. It
  stays inside its card.
- On Requester Ticket Detail the In Progress badge and the read-only
  surface are close in tone, and about 80px separate the header from
  "Back to My Tickets".
- The header of the mandatory Change Password screen is 6px taller than
  the normal header.
- The mobile tab bar on Staff Ticket Detail scrolls within itself, as
  §9.7 allows, without a cue that more tabs follow.
- With the create panel open on desktop, the narrowed user list breaks
  emails in the middle of a word.

## Not shown in a screenshot

- The Ticket Queue's Empty state ("There are no unfinished tickets in the
  queue."): the seed always provides unfinished Tickets. It is covered by
  `client/src/StaffTicketQueue.test.tsx`.
- That a dialog keeps keyboard focus inside: a still image cannot show
  it. `visual-staff-ticket-detail.spec.ts` and
  `visual-user-management.spec.ts` assert it by pressing Tab inside the
  Resolved dialog, the create panel, and the one-time password dialog;
  E2E-13 covers the keyboard-only pass.
- States that need a second actor or a server fault other than a lost
  connection, such as an inactive or throttled sign-in and the
  self-deactivation and last-Administrator refusals. They are covered by
  the UI component and E2E rows of `tests.md`.
