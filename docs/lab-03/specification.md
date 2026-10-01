# Lab 3 Sprint Engineering Specification

Sprint 3 engineering contract for TokTickIT. It extends the Lab 2 contract
(`docs/lab-02/`) and is detailed by `api-spec.md`, `ui-spec.md`, and
`tests.md` in this folder. Where this file and those disagree, this file
wins and the other is a defect.

Terms used throughout: **staff** means a user whose role is IT Staff or
Administrator. A **finished** Ticket is one whose Current Status is Closed
or Cancelled; every other Ticket is **unfinished**. "L2" prefixes a Lab 2
identifier (for example L2 BR-15) to keep it apart from the Lab 3 numbers
below.

## 1. Sprint Goal

TokTickIT stops trusting a selector and starts trusting a login. Every
person signs in with an email and password, sees only what their one role
permits, and is refused by the backend, not just the screen, for anything
else. Requesters keep everything they had in Lab 2 and gain a conversation
with IT on each Ticket. IT Staff get a shared queue and a Ticket Detail
screen from which they own, prioritise, discuss, annotate, and move
Tickets through a defined workflow. Administrators get one screen to
create and maintain the accounts all of this depends on.

## 2. Stakeholder Request

IT no longer wants a pretend login. Three kinds of people use the system
and each must be confined to their job:

- A **Requester** uses the Lab 2 ticket functions unchanged, except that
  "who am I" now comes from their login. They can talk to IT through Public
  Comments and can say "this looks fixed to me", but that is a signal, not
  a decision.
- **IT Staff** work from a queue of everyone's Tickets. They take ownership
  of a Ticket or hand it to a colleague, set the priority IT will work to,
  talk to the Requester, keep private notes, and alone decide when a Ticket
  is resolved, closed, or cancelled.
- An **Administrator** manages accounts on one simple screen: who exists,
  which single role they have, whether they are active, and issuing an
  initial password. Nobody registers themselves and nothing is emailed.

A person holding an initial password must replace it before doing anything
else. Hiding a button is never the protection: the server checks role and
ownership on every request. The new screens must look like the Lab 2
screens.

## 3. Scope

### Included

- Login, logout, current-user retrieval, mandatory first-login password
  change, voluntary password change, and a self-clearing login throttle.
- Server-side sessions and role-based authorization on every endpoint, with
  role-specific navigation and guarded screens.
- Migration of Lab 2 `RequesterUser` records into the `User` model, and
  removal of the Development Requester selector and its client-side state.
- Every Lab 2 Requester Ticket and Attachment function, now scoped by the
  authenticated identity.
- Requester Ticket Detail additions: Public Comments, "Problem Appears
  Resolved", Ticket Owner, Resolution Summary.
- IT Staff Ticket Queue with search, filters, sorting, and pagination.
- IT Staff Ticket Detail: ownership, IT Priority, status workflow, Public
  Comments, Internal Notes, Attachment viewing and download.
- Administrator User Management: list, search, role filter, create, edit
  name, email, role, and activation, set a new initial password.
- Idempotent seed data for all three roles with realistic Tickets.
- Zen Green applied to every new screen at desktop, tablet, and mobile.

### Excluded

- Email invitations, password-reset email, email delivery of passwords or
  links, multi-factor authentication, social login, single sign-on.
- Self-registration and Requester-created accounts.
- Account unlocking and approval workflows. The login throttle clears by
  itself and has no administrative control.
- Multiple roles per user, user deletion, bulk operations, import or
  export, role history, account audit history, departments, organisations,
  profile photos.
- User-list pagination, multi-column sorting, and filters beyond one role
  filter.
- Actions Taken, and therefore any rule that depends on them (Lab 4).
- SLA calculation, escalation, notifications, dashboards, and KPI analytics.
  The queue shows a result count only.
- Editing or deleting a Public Comment or Internal Note.
- Staff creating Tickets, and staff adding or removing Attachments.
- Status history. Only the current status and the resolution fields are
  stored.
- Production deployment or cloud infrastructure changes.

## 4. Functional Requirements

### Authentication

- **FR-01** The system shall let an active user sign in with an email
  address and password and shall then remember the login in a server-side
  session referenced by an httpOnly cookie.
- **FR-02** The system shall let an authenticated user sign out, ending
  that session at once.
- **FR-03** The system shall return the current user's name, email, role,
  and password-change state, and the application shell shall display the
  name and role.
- **FR-04** The system shall confine a user who must change their password
  to the Change Password screen until a valid new password is saved.
- **FR-05** The system shall let any authenticated user change their own
  password at any time from the profile menu.
- **FR-06** The system shall refuse logins for an email address for
  15 minutes after five failed attempts within 15 minutes.

### Authorization

- **FR-07** The system shall show each role only its own navigation and
  shall show a Forbidden state when a screen is opened by a role that is
  not permitted to see it.
- **FR-08** The system shall enforce the authorization matrix (§5.3) and
  Ticket ownership on the backend for every endpoint.

### Requester

- **FR-09** The system shall keep every Lab 2 Requester function working
  with the authenticated Requester as the acting identity, with no
  Development Requester selector and no Change Requester action.
- **FR-10** The system shall let a Requester read and post Public Comments
  on their own Tickets.
- **FR-11** The system shall let a Requester indicate, and withdraw the
  indication, that the problem on their own Ticket appears resolved.
- **FR-12** The system shall show a Requester the Current Status, Ticket
  Owner name, and Resolution Summary of their own Tickets, read-only.

### IT Staff and Administrator ticket operations

- **FR-13** The system shall provide a Ticket Queue of all Requesters'
  Tickets with search, filters, sorting, and pagination.
- **FR-14** The system shall provide a staff Ticket Detail showing the
  Ticket's information, Attachments, Public Comments, and Internal Notes,
  with only operational fields editable.
- **FR-15** The system shall let staff claim an unassigned Ticket, assign
  or reassign a Ticket to any active staff user, and return a Ticket to
  unassigned.
- **FR-16** The system shall let staff set the IT Priority of a Ticket.
- **FR-17** The system shall let staff change the Current Status of a
  Ticket along the permitted transitions (§5.6) and record a Resolution
  Summary when resolving.
- **FR-18** The system shall let staff read and post Public Comments on any
  Ticket.
- **FR-19** The system shall let staff read and create Internal Notes on
  any Ticket, never exposing them to a Requester.
- **FR-20** The system shall let staff view and download the active
  Attachments of any Ticket.

### Administrator user management

- **FR-21** The system shall let an Administrator list users with Name,
  Email, Role, and Status, search them by name or email, and filter them by
  one role.
- **FR-22** The system shall let an Administrator create a user with a
  name, email address, one role, and activation state, and shall generate
  an initial password that is shown once.
- **FR-23** The system shall let an Administrator edit a user's name, email
  address, role, and activation state.
- **FR-24** The system shall let an Administrator set a new initial
  password for a user, generated and shown once, which that user must
  change at their next login.
- **FR-25** The system shall prevent an Administrator from deactivating
  their own account and shall prevent any change that leaves no active
  Administrator.
- **FR-26** The system shall return a staff user's unfinished Tickets to
  the queue as unassigned when that user is deactivated or made a
  Requester.

### Data and presentation

- **FR-27** The system shall migrate Lab 2 data to the Lab 3 schema without
  losing any Ticket, Attachment, Category, or Related System or moving one
  to a different Requester.
- **FR-28** The system shall provide an idempotent seed with accounts for
  all three roles and realistic Tickets, Public Comments, and Internal
  Notes.
- **FR-29** The system shall present every Lab 3 screen in the Zen Green
  design language, usable at desktop, tablet, and mobile widths.

## 5. Business Rules

### 5.1 Authentication, passwords, and sessions

- **BR-01** Only an active user with valid credentials may authenticate.
- **BR-02** A user marked as requiring a password change cannot enter the
  normal application until a new valid password is saved. Until then the
  backend answers every protected endpoint except current-user and
  change-password with `403`; logout stays available.
- **BR-03** The authenticated user identity, not a `requesterId` supplied
  by the client, determines ownership of Requester operations. A
  `requesterId` in a body, path, or query and an `X-Requester-Id` header
  are ignored.
- **BR-04** Public Comments are visible to the Requester, IT Staff, and
  Administrator. Internal Notes are visible only to IT Staff and
  Administrator.
- **BR-05** A Requester may indicate that the problem appears resolved, but
  cannot formally set the Ticket to Resolved or Closed.
- **BR-06** An email address is trimmed and lower-cased before it is
  stored or compared, and is unique across all users, active or not.
- **BR-07** A password is stored only as a bcrypt hash (cost 12). No
  password or hash is logged, returned by any endpoint, or placed in a
  migration. The one exception is a generated initial password, returned
  once in the response that creates it (BR-38, BR-39).
- **BR-08** A password chosen by a user must be 8 to 72 characters, at
  most 72 bytes in UTF-8, and contain an upper-case letter, a lower-case letter, a digit, and a
  special character (any character that is not a letter, digit, or
  whitespace). The confirmation must match and the new password must
  differ from the current one.
- **BR-09** Changing a password requires the current password. On success
  the must-change flag is cleared, the user's other sessions end, and the
  current session continues under a new session value.
- **BR-10** A failed login returns one generic message, "Invalid email or
  password.", whether the email is unknown, the password is wrong, or the
  account has no password yet. Response time does not depend on which.
- **BR-11** An inactive account is told "This account is inactive. Contact
  an administrator." only when the password supplied is correct; with a
  wrong password it gets the generic message. No session is created.
- **BR-12** Five failed logins for one email within 15 minutes refuse every
  login for that email, even with the correct password, until 15 minutes
  after the fifth failure. The refusal then clears by itself; a successful
  login also clears the count. The rule applies identically to emails that
  match no user. There is no unlock action.
- **BR-13** A login is remembered by a session row in PostgreSQL. The
  browser holds only an opaque reference in the `tk_session` cookie
  (`HttpOnly`, `SameSite=Strict`); the database holds only a hash of it. A
  session unused for 8 hours is expired (ADR-0007).
- **BR-14** Logout deletes the session. Deactivating a user, changing a
  user's role, and setting a new initial password delete all of that
  user's sessions in the same transaction.
- **BR-15** A state-changing request whose `Origin` header is present and
  is not the configured client origin is rejected. No `GET` endpoint
  changes state.

### 5.2 Roles and authorization

- **BR-16** A user has exactly one role: Requester, IT Staff, or
  Administrator.
- **BR-17** An Administrator has every IT Staff ticket permission and,
  additionally, User Management. IT Staff cannot reach User Management.
  Staff do not use the Requester functions (create Ticket, My Tickets,
  Attachment upload and removal, Problem Appears Resolved).
- **BR-18** Every permission in §5.3 is enforced by the backend. A hidden
  or disabled control is feedback, never the control.
- **BR-19** A protected endpoint reports the first failing check in this
  order: no valid session `401`; password change required `403`; role not
  permitted `403`; resource missing or not owned `404` (ADR-0009).
- **BR-20** A Requester reaches only their own Tickets and those Tickets'
  Attachments and Public Comments. Another Requester's resource and a
  nonexistent one produce the same `404` (ADR-0004).

### 5.3 Authorization matrix

"Own" means the Ticket's Requester is the authenticated user; any other
Ticket answers `404`. "Any" means every Ticket.

| Operation | Not signed in | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| Sign in; sign out; health check | Yes | Yes | Yes | Yes |
| Current user; change own password | `401` | Yes | Yes | Yes |
| Read Categories and Related Systems | `401` | Yes | Yes | Yes |
| Create Ticket | `401` | Yes | `403` | `403` |
| List My Tickets; view Requester Ticket Detail | `401` | Own | `403` | `403` |
| Add or soft-remove an Attachment | `401` | Own | `403` | `403` |
| Set or withdraw Problem Appears Resolved | `401` | Own | `403` | `403` |
| Download an Attachment | `401` | Own | Any | Any |
| Read Public Comments | `401` | Own | Any | Any |
| Post a Public Comment | `401` | Own | Any | Any |
| View the Ticket Queue; view staff Ticket Detail | `401` | `403` | Yes | Yes |
| List eligible owners | `401` | `403` | Yes | Yes |
| Claim, assign, reassign, or unassign a Ticket | `401` | `403` | Any | Any |
| Set IT Priority | `401` | `403` | Any | Any |
| Change Current Status | `401` | `403` | Any | Any |
| Read or create Internal Notes | `401` | `403` | Any | Any |
| List, create, or edit users; set a new initial password | `401` | `403` | `403` | Yes |

### 5.4 Ticket ownership

- **BR-21** A Ticket has zero or one Ticket Owner. A user can be made
  owner only while they are an active IT Staff or Administrator.
- **BR-22** Any staff user may claim an unassigned Ticket, assign or
  reassign any unfinished Ticket to themselves or another eligible user,
  or return it to unassigned. Every change of owner, including a return to
  unassigned and the automatic one of BR-25, records its time.
- **BR-23** Taking a Ticket away from an owner other than oneself requires
  a confirmation step. Every ownership request states the owner the
  client last saw; if the Ticket's owner has changed since, the request is
  rejected `409` and nothing changes.
- **BR-24** Giving an owner to a Ticket whose status is New moves it to
  Open in the same operation.
- **BR-25** When an owner is deactivated or changed to Requester, every
  unfinished Ticket they own becomes unassigned in the same transaction,
  with status unchanged. Finished Tickets keep that user as the historical
  owner. The confirmation states how many Tickets return to the queue.

### 5.5 Priority

- **BR-26** Requested Priority is the value the Requester submitted and
  never changes. IT Priority is set to the Requested Priority when the
  Ticket is created and may afterwards be changed only by staff.

### 5.6 Status workflow

- **BR-27** The Current Status is one of New, Open, In Progress, Waiting
  for Requester, Resolved, Closed, Reopened, Cancelled. A new Ticket is
  New.
- **BR-28** Only staff change the Current Status, and only along this
  matrix. Closed and Cancelled are terminal; a problem that returns after
  that needs a new Ticket.

  | From \ To | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
  |---|---|---|---|---|---|---|---|
  | New | Yes | — | — | — | — | — | Yes |
  | Open | — | Yes | Yes | — | — | — | Yes |
  | In Progress | — | — | Yes | Yes | — | — | Yes |
  | Waiting for Requester | — | Yes | — | Yes | — | — | Yes |
  | Resolved | — | — | — | — | Yes | Yes | — |
  | Reopened | — | Yes | Yes | Yes | — | — | Yes |
  | Closed | — | — | — | — | — | — | — |
  | Cancelled | — | — | — | — | — | — | — |

- **BR-29** Moving a Ticket to Resolved requires that it has an owner at
  that moment and that a Resolution Summary of 10 to 2000 characters is
  supplied. The Resolution Summary is visible to the Requester.
- **BR-30** Moving a Ticket to Resolved, Closed, or Cancelled requires a
  confirmation step. Every status request states the status the client
  last saw; if the Ticket's status has changed since, the request is
  rejected `409` and nothing changes.
- **BR-31** A finished Ticket is read-only for everyone: no change of
  status, owner, or IT Priority, no new Public Comment or Internal Note,
  no Attachment added or removed, no resolution indication. Reading and
  Attachment download still work.
- **BR-32** A Requester never changes the Current Status. A Requester who
  wants a Ticket cancelled or reopened asks in a Public Comment and staff
  perform it.
- **BR-33** "Problem Appears Resolved" sets a timestamped flag on the
  Requester's own Ticket and never changes its status. It is available
  while the status is New, Open, In Progress, Waiting for Requester, or
  Reopened. The Requester may withdraw it. It is cleared when staff move
  the Ticket to Resolved. Staff see it as a badge and can filter on it.

### 5.7 Public Comments and Internal Notes

- **BR-34** Both are append-only: there is no edit and no delete. The
  author and creation time are set by the backend from the session and the
  server clock, never from the request.
- **BR-35** Content is trimmed and must not be empty. A Public Comment is
  at most 2000 characters and an Internal Note at most 4000. Content is
  stored and rendered as plain text with line breaks preserved; markup in
  it is displayed, never interpreted.
- **BR-36** The Ticket's Requester and any staff user may post a Public
  Comment while the Ticket is unfinished. A Resolved Ticket still accepts
  Public Comments, so a Requester can report that the problem returned.
- **BR-37** An Internal Note is never included in any response a Requester
  can obtain, and creating one does not change anything a Requester can
  see, including the Ticket's last-updated time.

### 5.8 Administrator rules

- **BR-38** An Administrator creates a user with a name, an email, one
  role, and an activation state. The system generates a random initial
  password, returns it once, stores only its hash, and marks the user as
  required to change it.
- **BR-39** Setting a new initial password does the same for an existing
  user and ends that user's sessions. It cannot be viewed again. An
  Administrator cannot do this to their own account; they use Change
  Password.
- **BR-40** An Administrator cannot deactivate their own account.
- **BR-41** A change that would leave the system with no active
  Administrator, by deactivating one or changing its role, is rejected.
- **BR-42** Users are deactivated, never deleted. An inactive user cannot
  authenticate and cannot be made a Ticket Owner; their Tickets, Public
  Comments, and Internal Notes remain attributed to them.
- **BR-43** A user's name is 2 to 100 characters after trimming. An email
  must be a syntactically valid address of at most 254 characters and must
  not already belong to another user (BR-06).

### 5.9 Ticket Queue

- **BR-44** The queue contains every Ticket of every Requester. Search
  matches Ticket Number, Summary, or Requester name. Filters, sort fields,
  default order, page sizes, and invalid-parameter behaviour are fixed in
  `api-spec.md` §5.1; an invalid query value is rejected, never silently
  replaced by a default.

### 5.10 Migration, seed, regression, and failures

- **BR-45** The migration turns each `RequesterUser` into a `User` with
  role Requester and the same id, so Ticket and Attachment ownership is
  unchanged. A migrated user has no password and cannot log in until an
  Administrator sets an initial password (ADR-0008). The one exception is
  BR-46, for seed accounts in local development.
- **BR-46** No password and no hash appears in a migration. The seed sets
  the documented local-development initial password on seed accounts that
  have no password yet, hashing it at run time, and marks them as required
  to change it.
- **BR-47** The seed is idempotent: running it again creates nothing new
  and overwrites nothing a person has changed.
- **BR-48** Every Lab 2 business rule stays in force except these:

  | Lab 2 rule | Lab 3 |
  |---|---|
  | L2 BR-03 (selector instead of login) | Retired; real login. |
  | L2 BR-06, BR-07, BR-23 (`X-Requester-Id`) | Replaced by BR-03 and BR-19: identity comes from the session, a missing session is `401`. |
  | L2 BR-10 (active Requester options) | Still applies to Categories and Related Systems; the Requester list is gone. |
  | L2 BR-12 (IT Priority unset) | Replaced by BR-26. |
  | L2 BR-21 (404 for not-owned) | Kept, with ADR-0009's `403` for role failures added. |

- **BR-49** An unexpected failure returns `500` with a generic message.
  No response contains a stack trace, a query, a file path, or a password
  hash.

## 6. UI Specification Summary

Full detail is in `ui-spec.md`. All Lab 2 Zen Green tokens, component
states, and responsive rules remain in force; Lab 3 adds two tokens and
badge mappings and no second visual system.

| Screen | Path | Roles | Modes |
|---|---|---|---|
| Login | `/login` | Not signed in | Sign in |
| Change Password | `/change-password` | All | Mandatory (first login), voluntary |
| My Tickets, Create Ticket | `/tickets`, `/tickets/new` | Requester | As Lab 2 |
| Requester Ticket Detail | `/tickets/:id` | Requester | View, with Public Comments and Problem Appears Resolved |
| Ticket Queue | `/staff/queue` | IT Staff, Administrator | List |
| Staff Ticket Detail | `/staff/tickets/:id` | IT Staff, Administrator | View with operational edits; read-only when finished |
| User Management | `/admin/users` | Administrator | List, create, edit |

- **Shell**: the header shows the signed-in user's name and a role badge
  with a menu holding Change Password and Logout. Navigation is
  Requester: My Tickets, Create Ticket; IT Staff: Ticket Queue;
  Administrator: Ticket Queue, User Management. A destination a role
  cannot use is not rendered.
- **Guards**: a signed-out visitor to any protected path lands on Login. A
  user who must change their password lands on Change Password. A
  signed-in user on a path for another role sees a Forbidden state.
- **Feedback**: every screen provides loading, saving, success,
  validation, empty, no-results, forbidden, not-found, conflict, and safe
  failure states where they are meaningful.
- **Public versus internal**: on Staff Ticket Detail, Public Comments and
  Internal Notes are separate tabs with separate composers, different
  surface colours, and explicit visibility labels.
- **Confirmations**: taking a Ticket from another owner; Resolved (with
  Resolution Summary), Closed, Cancelled; deactivating a user or changing a user's role (with the number of
  Tickets returning to the queue, when there are any);
  setting a new initial password.
- **Responsive**: desktop at 992px and above, tablet 768 to 991px, mobile
  below 768px. The queue and user list are tables on desktop and tablet
  and cards on mobile. No horizontal page scroll at any width.

## 7. Data Changes

All changes are one additive migration over the Lab 2 schema. No Ticket,
Attachment, Category, or Related System row is dropped or rewritten except
for the backfill noted.

### 7.1 Models

- **`User`** (renamed from `RequesterUser`, ids preserved): `id`, `name`,
  `email` (unique, lower-case), `isActive`, `createdAt`, plus new `role`
  (enum `Role`: `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`; default
  `REQUESTER`), `passwordHash` (nullable), `mustChangePassword` (default
  `true`), `updatedAt`.
- **`Session`**: `id`, `tokenHash` (unique), `userId` (FK to `User`,
  cascade delete), `createdAt`, `lastSeenAt`, `expiresAt`. Index on
  `userId`.
- **`LoginThrottle`**: `email` (PK, normalised),
  `failedAt` (the times of failures in the last 15 minutes),
  `lockedUntil` (nullable). Keyed by email, not user, so unknown emails
  are throttled identically.
- **`Ticket`** gains `ownerId` (nullable FK to `User`), `ownerChangedAt`
  (nullable; the time of the latest change of owner), `resolutionSummary` (nullable), `resolvedAt` (nullable), and
  `requesterResolvedAt` (nullable; non-null means the Requester has
  indicated the problem appears resolved). `itPriority` becomes required.
  New indexes on `ownerId` and `currentStatus`.
- **`TicketStatus`** enum gains `OPEN`, `IN_PROGRESS`,
  `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`.
- **`PublicComment`** and **`InternalNote`** (two tables, ADR-0010), each:
  `id`, `ticketId` (FK), `authorId` (FK to `User`), `body`, `createdAt`,
  indexed on `(ticketId, createdAt)`.
- `Attachment` is unchanged. Its `uploadedByRequesterId` and
  `removedByRequesterId` columns keep their names and now reference
  `User`.

`Ticket.updatedAt` changes on a change of owner, IT Priority, status, or
resolution indication, and on a new Public Comment. It does not change on
a new Internal Note (BR-37).

### 7.2 Migration from Lab 2

1. Rename `RequesterUser` to `User` in place and add the new columns. Every
   existing row becomes role `REQUESTER`, `passwordHash` null,
   `mustChangePassword` true.
2. Lower-case existing emails.
3. Extend `TicketStatus`. Existing Tickets stay `NEW`.
4. Backfill `Ticket.itPriority` from `requestedPriority` where it is null,
   then make it required.
5. Add the Ticket workflow columns, all null on existing rows.
6. Create `Session`, `LoginThrottle`, `PublicComment`, `InternalNote`.

The migration SQL is hand-written so the rename is a rename (ADR-0008).
After it, a migrated Requester owns exactly the Tickets and Attachments
they owned before and cannot log in until an Administrator sets an initial
password.

### 7.3 Removing the selector

Deleted: `GET /api/requesters`, the `requireRequester` middleware, the
Requester Selection screen, the Requester context and store, and the
Change Requester action. The client removes the `toktickit.requester`
`localStorage` key on start and stores no identity or token in the browser
beyond the httpOnly cookie.

### 7.4 Seed

The seed is run with `npx prisma db seed` and is safe to run repeatedly
(BR-47). It provides:

- The Lab 2 Categories and Related Systems, unchanged.
- Five Requesters (four active, one inactive): the Lab 2 seed accounts.
- Four IT Staff (three active, one inactive) and one active
  Administrator.
- At least 24 Tickets with Ticket Numbers in a reserved block
  (`TKT-2026-900001` upward) that the real per-year counter never reaches,
  each created only if its Ticket Number is absent and otherwise left
  untouched. Between them: every status at least twice,
  all three priorities, each active Requester at least four Tickets, each
  active IT Staff user at least three owned Tickets, at least six
  unassigned, at least one whose IT Priority differs from its Requested
  Priority, at least two flagged as appearing resolved, and at least one
  finished Ticket owned by the inactive IT Staff user.
- Example Public Comments and Internal Notes on several Tickets, created
  only together with their seed Ticket, containing no real personal data,
  credentials, or secrets.

Every seed account has the local-development initial password
`TokTickIT-Lab3!` and must change it at first login. It is documented in
the README, is for local development only, and is applied only to seed
accounts that have no password yet.

## 8. API Contract

Full detail is in `api-spec.md`. Summary:

- **Mechanism**: session cookie `tk_session` (BR-13). The client sends
  credentials with every request. CORS allows only the configured client
  origin.
- **Bodies**: JSON. Errors are `{ "error": string, "code": string }` plus
  `field` for a single-field validation error. `error` is safe to display.
  The `400`, `404`, and `500` bodies the Lab 2 endpoints already had are
  unchanged and carry no `code`.
- **Statuses**: `200`/`201`/`204` success; `400` invalid input; `401` not
  signed in or bad credentials; `403` inactive account, password change
  required, role not permitted, or disallowed origin; `404` missing or not
  owned; `409` conflict with current state; `429` login throttled; `500`
  unexpected.

| Area | Endpoints | Roles |
|---|---|---|
| Authentication | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` | Login and logout need no session; the others do |
| Reference data | `GET /api/categories`, `GET /api/related-systems` | Any signed in |
| Requester Tickets (Lab 2) | `POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/attachments`, `POST /api/attachments/:id/remove` | Requester, own |
| Resolution indication | `PUT` and `DELETE /api/tickets/:id/resolution-indication` | Requester, own |
| Shared ticket resources | `GET /api/attachments/:id/download`, `GET` and `POST /api/tickets/:id/comments` | Requester own; staff any |
| Ticket Queue and detail | `GET /api/staff/tickets`, `GET /api/staff/tickets/:id`, `GET /api/staff/eligible-owners` | Staff |
| Ticket operations | `PUT /api/staff/tickets/:id/owner`, `PUT /api/staff/tickets/:id/it-priority`, `POST /api/staff/tickets/:id/status` | Staff |
| Internal Notes | `GET` and `POST /api/staff/tickets/:id/notes` | Staff |
| User Management | `GET /api/admin/users`, `POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/initial-password` | Administrator |

`GET /api/health` stays public. `GET /api/requesters` is removed.

## 9. Acceptance Criteria

### Authentication

- **AC-01** Given an active user with valid credentials, when the user
  logs in, then the backend establishes authenticated access and returns
  the permitted user identity and role.
- **AC-02** Given a user who must change the initial password, when login
  succeeds, then normal application screens and endpoints remain
  unavailable until a valid new password is saved.
- **AC-03** Given an authenticated Requester, when the client supplies
  another `requesterId` (body, query, or `X-Requester-Id`), then the
  backend still applies the authenticated identity and does not return
  another Requester's data.
- **AC-04** Given a Requester account, when an Internal Note endpoint is
  requested, then the operation is rejected `403` without exposing note
  content, whether or not the Ticket is theirs or exists.
- **AC-05** Given an unknown email, a wrong password, or an account with
  no password, when login is attempted, then the same `401` and the same
  generic message are returned and no session is created.
- **AC-06** Given an inactive account, when login is attempted with the
  correct password, then the inactive-account message is returned and no
  session is created; with a wrong password the generic message is
  returned.
- **AC-07** Given five failed logins for one email within 15 minutes, when
  a sixth login is attempted with the correct password, then it is refused
  `429`; and when 15 minutes have passed since the fifth failure, then the
  correct password logs in.
- **AC-08** Given the Change Password form, when the new password breaks
  any rule of BR-08, the confirmation differs, the new password equals the
  current one, or the current password is wrong, then the change is
  rejected with a field-level message and the password and must-change
  flag are unchanged.
- **AC-09** Given a user who must change their password, when a valid new
  password is saved, then the flag is cleared, the user enters their
  role's landing screen, the new password logs in, and the old one does
  not.
- **AC-10** Given a signed-in user, when they log out, then the session no
  longer exists, a request replaying the old cookie gets `401`, and
  opening a protected screen shows Login.
- **AC-11** Given no session, when any protected endpoint is requested,
  then it returns `401` and no data; and given a session, when the current
  user is requested, then only the id, name, email, role, and
  password-change state are returned.
- **AC-12** Given a session unused for 8 hours, when it is next used, then
  it is refused `401`.
- **AC-13** Given a successful login, when the response is inspected, then
  the session cookie is `HttpOnly` and `SameSite=Strict` and no token
  appears in the response body or in browser storage; and given a
  state-changing request with a foreign `Origin`, then it is rejected
  `403`.

### Authorization

- **AC-14** Given each role, when the shell renders, then only that role's
  navigation is present; and when a path belonging to another role is
  opened directly, then a Forbidden state is shown and no protected data
  is requested successfully.
- **AC-15** Given a Requester, when any staff or Administrator endpoint is
  requested directly, then it returns `403` and no data; given IT Staff,
  when any Administrator endpoint is requested, then `403`; given staff,
  when a Requester-only endpoint is requested, then `403`.
- **AC-16** Given an Administrator, when each staff ticket operation is
  performed, then it succeeds exactly as for IT Staff.
- **AC-17** Given a signed-in user, when an Administrator deactivates
  them, changes their role, or sets a new initial password, then that
  user's next request returns `401`.

### Requester continuity

- **AC-18** Given an authenticated Requester, when they create a Ticket,
  list and search My Tickets, open Ticket Detail, and add, download, and
  soft-remove an Attachment, then each behaves as specified in Lab 2, with
  no selector, and the new Ticket's IT Priority equals its Requested
  Priority.
- **AC-19** Given Requester B, when a Ticket, an Attachment, or the Public
  Comments of Requester A's Ticket are requested by id, or a Public
  Comment is posted to that Ticket, then the response is a `404` identical
  to that for a nonexistent id and nothing is created.
- **AC-20** Given a Requester's own unfinished Ticket, when they post a
  Public Comment, then it appears with their name and the server's time
  for them and for staff; and when the content is empty, whitespace, or
  over 2000 characters, then it is rejected and nothing is saved; and no
  request can edit or delete a Public Comment.
- **AC-21** Given a Requester's own Ticket that is New, Open, In
  Progress, Waiting for Requester, or Reopened, when
  they choose Problem Appears Resolved, then a timestamped flag is stored
  and the status is unchanged; when they withdraw it, then it is cleared;
  and when the Ticket is Resolved or finished, then the action is refused.
- **AC-22** Given a Requester, when any status, owner, or IT Priority
  change is attempted on their own Ticket by direct request, then it is
  rejected `403` and the Ticket is unchanged.
- **AC-23** Given a Requester's own Ticket, when Ticket Detail renders,
  then the Current Status, the Ticket Owner's name or "Unassigned", and
  any Resolution Summary are shown read-only, and no Internal Note data is
  present in any response received.

### Ticket Queue

- **AC-24** Given staff, when the queue is opened, then Tickets of all
  Requesters are listed, most recently updated first, ten per page, with
  the total count and page count.
- **AC-25** Given a search term, when the queue is searched, then only
  Tickets whose Ticket Number, Summary, or Requester name contains it are
  listed.
- **AC-26** Given a status, owner (a user, "unassigned", or "me"), IT
  Priority, Category, or appears-resolved filter, when it is applied, then
  only Tickets matching every active filter are listed.
- **AC-27** Given a sortable field and a direction, when the queue is
  sorted, then the order reflects it across pages.
- **AC-28** Given more Tickets than one page, when a page is requested,
  then the correct rows and pagination metadata are returned; and given an
  invalid query value, then the request is rejected `400` naming the
  parameter.
- **AC-29** Given the queue screen, when it is loading, has no Tickets,
  has no matches, or the request fails, then a distinct loading, empty,
  no-results, or safe failure state is shown, and each row offers an
  action that opens Ticket Detail.

### Staff Ticket Detail

- **AC-30** Given staff, when a Ticket is opened, then its information,
  Requester, owner, both priorities, status, and active Attachments with
  working downloads are shown, and only owner, IT Priority, and status are
  editable.
- **AC-31** Given an unassigned New Ticket, when staff claim it, then they
  become owner, the time of the change is recorded, and the status
  becomes Open.
- **AC-32** Given a Ticket, when staff assign it to an active staff user
  or return it to unassigned, then the owner changes; when the target is
  inactive, a Requester, or unknown, then it is rejected `400`; when the
  owner has changed since the client loaded it, then it is rejected `409`;
  and when the Ticket has another owner, then the UI asks for confirmation
  before sending.
- **AC-33** Given staff, when IT Priority is changed, then the new value
  is stored and Requested Priority is unchanged.
- **AC-34** Given a Ticket in each status, when a transition permitted by
  BR-28 is requested, then the status changes; when one not permitted is
  requested, then it is rejected `409` and the status is unchanged.
- **AC-35** Given a Ticket moving to Resolved, when it has no owner or no
  valid Resolution Summary, then it is rejected; and when it has both,
  then it becomes Resolved, the Requester can read the summary, and any
  appears-resolved flag is cleared.
- **AC-36** Given a move to Resolved, Closed, or Cancelled, when it is
  chosen in the UI, then a confirmation is required and dismissing it
  sends no request; and when the status has changed since the client
  loaded it, then the request is rejected `409`.
- **AC-37** Given a finished Ticket, when any change is attempted (status,
  owner, IT Priority, Public Comment, Internal Note, Attachment add or
  removal, resolution indication), then it is rejected `409` and the UI
  offers no such control.
- **AC-38** Given staff, when an Internal Note is created, then it appears
  to staff with its author and time in a section visually distinct from
  Public Comments, the Ticket's last-updated time does not change, no Requester endpoint
  returns it, and no request can edit or delete it.
- **AC-39** Given a Public Comment or Internal Note containing HTML or
  script markup, when it is displayed, then the markup appears as literal
  text and is not interpreted.

### User Management

- **AC-40** Given an Administrator, when User Management opens, then all
  users are listed with Name, Email, Role, Status, and an Edit action; and
  when a name or email search or a role filter is applied, then only
  matching users are listed.
- **AC-41** Given valid details, when an Administrator creates a user,
  then the user exists with that one role, a generated initial password is
  shown exactly once, and that user must change it at first login.
- **AC-42** Given an email already used by another user in any letter
  case, when a user is created or edited with it, then it is rejected
  `409`; and given a missing or invalid name, email, or role, or an invalid
  activation value, then it is rejected `400` naming the field.
- **AC-43** Given an existing user, when an Administrator edits the name,
  email, role, or activation state, then the change is saved and visible
  in the list.
- **AC-44** Given an existing user, when an Administrator sets a new
  initial password, then it is shown once, the previous password no longer
  logs in, the user's sessions end, and the user must change it at next
  login; and an Administrator cannot do this to their own account.
- **AC-45** Given an Administrator, when they try to deactivate their own
  account, then it is rejected `409` and the account stays active.
- **AC-46** Given exactly one active Administrator, when that account is
  deactivated or given another role, then it is rejected `409`.
- **AC-47** Given a staff user who owns unfinished and finished Tickets,
  when they are deactivated or made a Requester, then the confirmation
  states how many Tickets return to the queue, the unfinished ones become
  unassigned with status unchanged, and the finished ones keep them as
  owner.

### Migration and seed

- **AC-48** Given a Lab 2 database with Requesters, Tickets, and
  Attachments, when the Lab 3 migration runs, then every Requester is a
  User with role Requester and the same id, every Ticket and Attachment
  belongs to the same Requester as before, every IT Priority is set, no migrated user can log in until an
  Administrator sets an initial password, and no migration file contains a
  password or a hash.
- **AC-49** Given a migrated database, when the seed runs twice, then the
  second run changes nothing; the accounts and Tickets of §7.4 exist; each
  active seed account logs in with the documented initial password and
  must change it, and each inactive one gets the inactive-account message; and an account whose password was already changed keeps it.

### Presentation and failures

- **AC-50** Given desktop (992px and above), tablet (768 to 991px), and
  mobile (below 768px) widths, when Login, Change Password, Requester
  Ticket Detail, Ticket Queue, Staff Ticket Detail, and User Management
  are inspected, then nothing is clipped, nothing overlaps, the page does
  not scroll horizontally, and status, priority, role, and account badges
  match `ui-spec.md` §2.2.
- **AC-51** Given a keyboard-only user, when they move through each Lab 3
  screen and its dialogs, then every control is reachable, shows a visible
  focus indicator, and has an accessible name, and an open dialog keeps
  focus inside it.
- **AC-52** Given an unexpected server failure or a lost connection, when
  any Lab 3 screen makes a request, then a safe message is shown, entered
  data is kept, and no stack trace or internal detail is exposed.

## 10. Definition of Done

The coding agent may report Sprint 3 complete only when every item holds
on the final `main` branch:

- [ ] Every FR and BR above is implemented, and nothing outside §3
      Included has been added.
- [ ] Every AC passes, with a passing automated test for each row of
      `tests.md` §2 and no row left Planned.
- [ ] No required test is skipped, disabled, commented out, weakened to
      pass, or unrelated to the AC it claims.
- [ ] The implementation matches this file, `api-spec.md`, and
      `ui-spec.md`. Any deviation was made by changing the contract first,
      in a reviewed PR.
- [ ] Every endpoint enforces the authorization matrix on the backend;
      `authorization.api.test.ts` exercises every endpoint against every
      role and against no session.
- [ ] The Lab 3 migration applies cleanly to a Lab 2 database and to an
      empty one; the migration test proves ownership is preserved.
- [ ] The Lab 1 and Lab 2 suites pass, changed only in how they establish
      identity (a session instead of `X-Requester-Id`) and where §5.10
      BR-48 replaces a rule.
- [ ] The Development Requester selector, `GET /api/requesters`, and the
      `toktickit.requester` storage key no longer exist.
- [ ] No password, hash, session value, or secret is committed, logged, or
      returned, other than the documented local-development seed password
      and a generated initial password in its one response.
- [ ] The seed runs twice without change and provides the §7.4 data.
- [ ] Screenshots of every Lab 3 screen at desktop, tablet, and mobile are
      stored under `artifacts/lab-03/screenshots/`, and the visual
      checklist of `ui-spec.md` §13 is completed in
      `docs/lab-03/visual-checklist-results.md`.
- [ ] The full suite (unit, API, UI component, visual, E2E) passes from the
      documented commands, and the README documents setup, the seed
      accounts, and those commands.
- [ ] Each Sprint 3 Issue went Backlog, Specified, Started, PR Review,
      Fixing, Done through a peer-reviewed PR into `lab3-staging`,
      followed by one release PR from `lab3-staging` to `main`.
- [ ] `docs/lab-03/reviewer.md` and `docs/lab-03/ai-use.md` are complete.

## 11. Assumptions and Decisions

Choices the handout leaves open. The first eleven were decided by the
product owner; the rest are defaults taken while writing this contract.

1. **Server-side sessions**, not a browser-held token, so logout and
   deactivation take effect at once (ADR-0007).
2. **Password policy** follows the handout mockup (BR-08). The 72-character
   ceiling is bcrypt's input limit, which is 72 bytes, so the byte length
   is checked too; longer input is rejected rather than silently
   truncated.
3. **Login throttle** is temporary and self-clearing (BR-12). It lets
   someone lock a known email out for 15 minutes; accepted, because the
   alternative, unlimited guessing, is worse and unlocking is excluded.
4. **An Administrator has all IT Staff ticket rights** plus User
   Management. The handout allows this only if the matrix says so; §5.3
   says so. The separation of duties shows as separate navigation entries.
5. **Any staff user may reassign any Ticket**, with a confirmation when
   taking it from someone else (BR-22, BR-23).
6. **Deactivating or demoting an owner returns their unfinished Tickets to
   the queue** (BR-25). Because a Resolved Ticket is unfinished, it can
   become unassigned this way; BR-29 therefore requires an owner at the
   moment of resolving, not for as long as the Ticket stays Resolved.
7. **Status matrix** as in BR-28, with Closed terminal.
8. **Problem Appears Resolved is a flag**, never a status change (BR-33).
   It is not offered once the Ticket is Resolved, since staff have then
   already acted on it and resolving clears it.
9. **A Requester never changes status** (BR-32).
10. **Migrated Requesters have no password** until an Administrator issues
    one; the seed, not a migration, sets the local-development password
    (ADR-0008).
11. **Initial passwords are generated and shown once**, never typed by the
    Administrator and never retrievable (BR-38, BR-39). An Administrator
    cannot issue one to their own account: it would sign them out, and
    Change Password already covers that case.
12. **Giving any owner to a New Ticket opens it** (BR-24), not only a
    self-claim, so "New" always means "nobody has picked this up".
13. **A finished Ticket is fully read-only**, including Attachment add and
    removal (BR-31). This is new relative to Lab 2, where every Ticket was
    New.
14. **Requester functions are Requester-only.** Staff do not create
    Tickets, so the mockup's Create Ticket entry in the staff header is not
    adopted.
15. **A role change ends the user's sessions** (BR-14), so nobody keeps
    working under navigation for a role they no longer hold. An
    Administrator may change their own role unless they are the last
    active one (BR-41).
16. **`403` for role, `404` for ownership** (ADR-0009).
17. **Comments and notes are separate tables** (ADR-0010).
18. **Optimistic checks on owner and status** (BR-23, BR-30): each request
    states what the client last saw. This gives two staff acting at once a
    clear conflict instead of a silent overwrite.
19. **Length limits**: Public Comment 2000 (a message), Internal Note 4000
    (room for pasted diagnostics), Resolution Summary 10 to 2000. All are
    below the 5000 of a Ticket Description, which stays the longest text
    on a Ticket.
20. **Internal Notes do not move a Ticket's last-updated time**, because a
    Requester can see that time (BR-37).
21. **Queue defaults**: most recently updated first, ten per page, page
    sizes 10, 25, 50, as in My Tickets. The API returns all statuses by
    default; the screen starts on "Unfinished", which hides finished
    Tickets.
    Queue columns are justified in `ui-spec.md` §8.
22. **Lab 3 errors carry a `code`** beside the `error` text so the client
    can tell conflicts and forbidden states apart without matching prose.
    The error bodies Lab 2 endpoints already had are left exactly as they
    were, so the Lab 2 suites' assertions on them still hold.
23. **Reference data needs a session.** `GET /api/categories` and
    `GET /api/related-systems` were open in Lab 2; now only health, login,
    and logout answer without a session.
24. **The client adopts URL paths** for its screens (§6) so that guards and
    "direct access after logout" are observable. Lab 2 switched screens in
    component state.
25. **Mockup details not adopted**: "Forgot your password?" and "Send
    password reset email" (reset email is excluded), the Service Actions
    tab (Actions Taken is excluded), user-list pagination (not required),
    and the "TikTockIT" spelling.
26. **Seed Tickets use a reserved Ticket Number block** so the seed is
    idempotent and cannot collide with Tickets created in Lab 2 (§7.4).
27. **Client test files stay beside their components** in `client/src/`,
    the Lab 2 convention, using the file names the handout lists.
