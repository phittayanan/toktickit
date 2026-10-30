# Lab 4 Sprint Engineering Specification

Sprint 4 engineering contract for TokTickIT. It extends the Lab 3 contract
(`docs/lab-03/`) and is detailed by `api-spec.md`, `ui-spec.md`, and
`tests.md` in this folder. Where this file and those disagree, this file
wins and the other is a defect.

Terms follow `CONTEXT.md`. **Staff** means IT Staff or Administrator. A
**Finished** Ticket is Closed or Cancelled; every other Ticket, including a
Resolved one, is **Unfinished**. **Last Updated** is `Ticket.updatedAt`.
The word **assignee** always means the Performed by user of an Action
Taken and never names the Ticket Owner role; a Ticket Owner may be an
assignee. **Done** is an Action Taken status, not a Ticket state.
"L3" prefixes a Lab 3 identifier (for example L3 BR-28) to keep it apart
from the Lab 4 numbers below.

## 1. Sprint Goal

TokTickIT can now show the work behind a Ticket, not just the conversation
around it. Staff plan and record Actions Taken under a Ticket, a Ticket
cannot be Resolved until that work is on record, and each role opens a
concise dashboard that leads straight to the detail behind every number.
Everything built in Labs 1 to 3 keeps working and the whole application is
hardened for final demonstration.

## 2. Stakeholder Request

The service desk can receive Tickets and talk to Requesters, but the actual
work leaves no reliable trace. The stakeholder wants that closed:

- **Work is recorded under the Ticket.** Each action states when it
  happened, what was done, the result, who performed it, whether follow-up
  is needed, and where to look for related files.
- **Responsibility and effort are separate.** The Ticket Owner coordinates
  the Ticket, while several staff members may each carry out part of the
  work.
- **Staff decide what is resolved.** A Requester can still say the problem
  looks fixed, but only staff formally move the Ticket, and only once the
  work is recorded.
- **Dashboards point the way.** Requesters and staff get short summaries
  linked to the detailed screens, not a second copy of those screens.
- **It must feel finished.** Earlier features keep working under one
  consistent Zen Green application.

## 3. Scope

### Included

- Actions Taken under each Ticket: list, create, edit, complete, and
  withdraw by Cancelled, for staff; read-only for the Ticket's Requester.
- The Resolution Gate on moves to Resolved, enforced by the backend.
- Requester, IT Staff, and Administrator dashboards with backend-calculated
  metrics and drill-down.
- One additive Prisma migration, a documented rollback, and seed data for
  Actions Taken and dashboard metrics.
- Final hardening: regression of Labs 1 to 3, consistent feedback states,
  duplicate-submission handling, responsive behaviour, accessibility,
  cleanup, and current README instructions.

### Excluded

- SLA clocks, escalation, on-call scheduling, and breach notifications.
- Email, SMS, LINE, push, or other external notifications.
- Inventory, spare parts, purchasing, cost accounting, time-sheet billing,
  payroll, and labour-cost calculation.
- Multi-level approvals and electronic signatures.
- Business-intelligence tools, custom reports, exports, and multi-tenant or
  production-scale operations.
- Deleting an Action Taken, editing a Done or Cancelled Action Taken, and
  file upload on an Action Taken. Attachment Notes are text only.
- Requesters creating or changing Actions Taken.
- Any change to the Lab 3 status matrix other than the Resolution Gate.
  Closed and Cancelled stay final.
- Action Taken change history, Ticket status history, and editing or
  deleting Public Comments or Internal Notes.
- Any product feature not listed under Included.

### Preserved from earlier labs

- **Rules and contracts.** Every Lab 3 rule stays in force except as listed
  in BR-33, and every Lab 2 and Lab 3 endpoint keeps its shape except for
  the additive changes in `api-spec.md` §3 and §4.
- **Ticket Change module.** Issue #74 gives every write against a Ticket
  one home, `server/src/services/ticketChange.service.ts`, which locks the
  row, refuses a missing or Finished Ticket, and stamps the time from the
  shared clock. Lab 4 adds Action Taken create and edit as callers of that
  module and adds the Resolution Gate to the rule of the existing status
  change, so no new code path locks a Ticket row or restates Finished.
  Action Taken code is built on top of #74, not beside it.
- **Authentication and authorization.** Sessions, the order of checks
  (`docs/lab-03/api-spec.md` §1.5), and role-by-path-prefix apply to the new
  endpoints unchanged. ADR-0004, ADR-0009, and ADR-0010 stand.
- **Data.** The migration is additive, so all Users, Tickets, Attachments,
  Public Comments, and Internal Notes stay valid. Existing Tickets get no
  placeholder Actions Taken.
- **Tests.** The Lab 1, Lab 2, and Lab 3 suites stay and must pass. They
  change only as `tests.md` §1 lists.
- **Design.** Zen Green tokens, components, and responsive rules from
  Labs 2 and 3 are reused; there is no second visual system.

## 4. Functional Requirements

### Actions Taken

- **FR-01** The system shall let staff create an Action Taken on any
  Unfinished Ticket with Action Date/Time, Action Description, Result,
  Performed by, status, Follow-Up Required?, Follow-up Note, and Attachment
  Notes.
- **FR-02** The system shall let the creator, the assignee, or an
  Administrator edit a Planned Action Taken, including completing it as
  Done or withdrawing it as Cancelled.
- **FR-03** The system shall keep every Action Taken: it has no delete
  operation, and a Done or Cancelled one is read-only.
- **FR-04** The system shall show staff every Action Taken of a Ticket on
  Staff Ticket Detail.
- **FR-05** The system shall show a Requester every Action Taken of their
  own Ticket, read-only, with its status.
- **FR-06** The system shall detect a stale Action Taken edit and reject it
  without overwriting the newer version.

### Ticket workflow

- **FR-07** The system shall refuse a move to Resolved unless the Resolution
  Gate (BR-19) holds, whichever client sends the request.
- **FR-08** The system shall keep the Lab 3 status matrix and shall offer
  only permitted transitions in the Ticket status controls, refreshing the
  Ticket summary after a successful change.
- **FR-09** The system shall keep Problem Appears Resolved as advisory: it
  never changes the Current Status and never satisfies the Resolution Gate.

### Dashboards

- **FR-10** The system shall provide a Requester dashboard summarising only
  the authenticated Requester's Tickets (BR-29).
- **FR-11** The system shall provide an IT Staff dashboard (BR-30).
- **FR-12** The system shall provide an Administrator dashboard: the IT
  Staff dashboard plus active account counts by role (BR-31).
- **FR-13** The system shall link each dashboard metric and list item to
  the matching filtered list or detail screen (BR-32).
- **FR-14** The system shall calculate every metric on the backend from
  authoritative data and shall return concise data, not Ticket collections.
- **FR-15** The system shall add a Dashboard destination to each role's
  navigation with a clear active-page indication.

### Data and hardening

- **FR-16** The system shall migrate a Lab 3 database to the Lab 4 schema
  without losing or rewriting existing data, with a documented and tested
  rollback.
- **FR-17** The system shall provide an idempotent seed that covers Actions
  Taken and dashboard metrics (§7.5).
- **FR-18** The system shall keep every Requester, IT Staff, and
  Administrator function from Labs 1 to 3 available to its permitted users.
- **FR-19** The system shall give consistent loading, validation, success,
  empty, no-results, forbidden, conflict, not-found, and safe-failure
  feedback on every screen where they are meaningful.
- **FR-20** The system shall prevent or safely handle duplicates caused by
  repeated clicks or network retries.
- **FR-21** The system shall keep entered form data after a recoverable
  failure.
- **FR-22** The system shall be free of console errors, broken links,
  placeholder text, and unfinished or obsolete controls, and the README
  shall hold current setup, seed, migration, test, and demonstration
  instructions.
- **FR-23** The system shall present every Lab 4 screen in the Zen Green
  design language, keyboard operable with visible focus, semantic labels,
  and non-colour status cues, at desktop, tablet, and mobile widths.

## 5. Business Rules

### 5.1 Action Taken record

- **BR-01** An Action Taken belongs to exactly one Ticket and never moves
  to another. A Ticket has zero or more Actions Taken.
- **BR-02** The Ticket Owner coordinates the Ticket, but an Action Taken
  may be by a different IT Staff member. Neither the creator nor the
  assignee has to be the Ticket Owner, and a Ticket with no Ticket Owner
  can have Actions Taken.
- **BR-03** The fields of an Action Taken:

  | Field | Set by | Rule |
  |---|---|---|
  | Action Date/Time | User, default now | BR-06 |
  | Action Description | User | Required, 1 to 2000 characters |
  | Result | User | Optional, at most 2000 characters; required when Done |
  | Performed by (assignee) | User, default the creator | BR-04 |
  | Status | User | BR-08 |
  | Follow-Up Required? | User, default no | BR-07 |
  | Follow-up Note | User | Required when Follow-Up Required? is yes, at most 2000 characters; must be empty otherwise |
  | Attachment Notes | User | Optional, at most 500 characters. Text saying which file or image to look at, not a link to an Attachment |
  | Created by, Created at | Backend | BR-05 |
  | Version | Backend | BR-13 |

- **BR-04** Performed by defaults to the creator and may be set to another
  active IT Staff or Administrator user. Setting it to an inactive user, a
  Requester, or an unknown user is rejected. An assignee already on the
  record who later becomes ineligible does not block saving: the value is
  only validated when it changes.
- **BR-05** Created by and Created at come from the session and the server
  clock, never from the request. They never change.
- **BR-06** Action Date/Time is entered by the user and defaults to now. A
  Planned or Cancelled Action Taken may carry a future time; a Done one may
  not, judged against the server clock when it is saved. It is separate
  from Created at.
- **BR-07** When Follow-Up Required? is yes the Action Taken shows a
  Follow-up badge. Follow-up never blocks Resolved. Further work is recorded
  as a new Planned Action Taken, which the Resolution Gate then covers.

### 5.2 Action Taken status and editing

- **BR-08** The status of an Action Taken is Planned, Done, or Cancelled. It
  is created as Planned or Done. A Planned one may become Done or Cancelled.
- **BR-09** Result is required to save a Done Action Taken.
- **BR-10** Done and Cancelled are final. Such an Action Taken is read-only
  for everyone, Administrators included.
- **BR-11** An Action Taken is never deleted. It is withdrawn by setting it
  to Cancelled, and it stays visible with its status.
- **BR-12** Creating or editing an Action Taken is a Ticket Change: it moves
  Last Updated and is refused on a Finished Ticket. A Planned Action Taken
  on a Ticket that becomes Finished therefore stays Planned and read-only.
- **BR-13** Each Action Taken has a version number, starting at 1 and
  raised by every accepted edit. An edit states the version the
  client loaded; a mismatch is rejected `409` and nothing changes. The form
  keeps the typed data and prompts to reload.
- **BR-14** A create request carries a client-generated key, because the
  labsheet (section 8.5, Final Regression and Product Hardening) requires
  that "duplicate actions caused by repeated clicking or network retry are
  prevented or safely handled", and BR-36 covers repeated clicking only. A
  repeat with the same key on the same Ticket returns the Action Taken
  already created with `200` and creates nothing, even if its body is invalid
  or the Ticket has since become Finished. The client keeps one key only
  while the form body is unchanged and generates a new one as soon as the
  user edits any field after a failed or lost response, so a corrected body
  is a new create and is never silently dropped.

### 5.3 Action Taken authorization

- **BR-15** Any staff user may create an Action Taken on any Unfinished
  Ticket and read those of any Ticket. Only its creator, its assignee, and
  Administrators may edit an existing one. Being the Ticket Owner gives no
  extra edit right; other IT Staff read it only.
- **BR-16** A Requester reads every Action Taken of their own Ticket,
  Cancelled included, with all fields, and never creates or changes one.
  Another Requester's Ticket and a nonexistent one produce the same `404`.
- **BR-17** Action Taken content is shared with the Requester. Anything
  private belongs in an Internal Note (ADR-0010).
- **BR-18** The backend enforces this matrix. A hidden control is feedback,
  never the control. "Own" and "Any" are as in L3 §5.3.

  | Operation | Not signed in | Requester | IT Staff | Administrator |
  |---|---|---|---|---|
  | List Actions Taken | `401` | Own | Any | Any |
  | Create an Action Taken | `401` | `403` | Any Unfinished | Any Unfinished |
  | Edit a Planned Action Taken | `401` | `403` | Creator or assignee, else `403` | Any |
  | Edit a Done or Cancelled Action Taken | `401` | `403` | `409` for creator or assignee, else `403` | `409` |
  | Delete an Action Taken | `401` | No such operation | No such operation | No such operation |
  | Read the Requester dashboard | `401` | Own data | `403` | `403` |
  | Read the IT Staff dashboard | `401` | `403` | Yes | Yes |
  | Read account counts | `401` | `403` | `403` | Yes |

### 5.4 Ticket status workflow

The statuses stay New, Open, In Progress, Waiting for Requester, Resolved,
Closed, Reopened, and Cancelled. Only staff change the Current Status, on
any Ticket, along this matrix. It is the Lab 3 matrix unchanged. "Gate"
marks a transition that also needs the Resolution Gate.

| From \ To | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
|---|---|---|---|---|---|---|---|
| New | Yes | — | — | — | — | — | Yes |
| Open | — | Yes | Yes | — | — | — | Yes |
| In Progress | — | — | Yes | Gate | — | — | Yes |
| Waiting for Requester | — | Yes | — | Gate | — | — | Yes |
| Resolved | — | — | — | — | Yes | Yes | — |
| Reopened | — | Yes | Yes | Gate | — | — | Yes |
| Closed | — | — | — | — | — | — | — |
| Cancelled | — | — | — | — | — | — | — |

- **BR-19** **Resolution Gate**: a Ticket may move to Resolved only with at
  least one Done Action Taken and no Planned Action Taken. Cancelled ones
  do not count either way.
- **BR-20** The L3 conditions on Resolved still apply: a Ticket Owner at
  that moment and a Resolution Summary of 10 to 2000 characters (L3 BR-29),
  a confirmation step, and a stale status check (L3 BR-30).
- **BR-21** The gate is checked by the backend inside the same Ticket Change
  as the status write. Action Taken writes take the same Ticket row lock,
  so a Planned Action Taken and a move to Resolved are serialised.
- **BR-22** The gate applies only to moves into Resolved. Closed, Reopened,
  and Cancelled are not gated. An Action Taken added while a Ticket is
  Resolved does not change its status, and a Planned one does not stop it
  being Closed.
- **BR-23** A Reopened Ticket keeps its Actions Taken, and an earlier Done
  one still counts toward the gate. New work is a new Planned Action Taken.
- **BR-24** The gate applies from this sprint on. Tickets already Resolved
  or Closed are untouched and may move on as the matrix allows. An
  Unfinished Ticket with no Action Taken needs a Done one before it can move
  to Resolved.
- **BR-25** Problem Appears Resolved stays advisory (L3 BR-05, BR-33). It
  does not change the status and does not satisfy the gate.
- **BR-26** Closed and Cancelled stay final. A problem that returns after
  Closed is a new Ticket that refers to the old one in its text.

### 5.5 Dashboards

- **BR-27** The backend calculates every metric per request from Ticket,
  Action Taken, and User rows. No metric is stored, and the client computes
  none. A dashboard response never holds a Ticket description, a Public
  Comment, or an Internal Note.
- **BR-28** "Recent" means from 00:00 Asia/Bangkok six calendar days before
  today's Bangkok date, up to now: today and the previous six days. Each
  recent list shows at most five items.
- **BR-29** Requester dashboard, the session user's own Tickets only:

  | Metric | Calculation | Empty | Drill-down |
  |---|---|---|---|
  | Open Tickets | Count with status New, Open, In Progress, Waiting for Requester, or Reopened | `0` | My Tickets filtered to those statuses |
  | Waiting for Requester | Count with status Waiting for Requester; these need the Requester's attention | `0` | My Tickets filtered to that status |
  | Recently updated | Last Updated within the recent window, newest first, top 5 | Empty message | Ticket Detail of the item |
  | Recently resolved | Status Resolved or Closed and `resolvedAt` within the recent window, newest first, top 5 | Empty message | Ticket Detail of the item |

  "Open Tickets" is a metric name, wider than the Open status.

- **BR-30** IT Staff dashboard:

  | Metric | Calculation | Empty | Drill-down |
  |---|---|---|---|
  | Unassigned | Count of Unfinished Tickets with no Ticket Owner | `0` | Ticket Queue: no owner, Unfinished |
  | Owned by me | Count of Unfinished Tickets whose Ticket Owner is the session user | `0` | Ticket Queue: owner me, Unfinished |
  | My Planned Actions Taken | Count of Planned Actions Taken assigned to the session user on Unfinished Tickets, listed soonest Action Date/Time first, top 5 | `0`, empty message | Ticket Detail of the item |
  | By status | One count per Unfinished status, zeros included | `0` per status | Ticket Queue: that status |
  | By IT Priority | Count of Unfinished Tickets per IT Priority, zeros included | `0` per priority | Ticket Queue: that IT Priority, Unfinished |
  | Urgent | Unfinished Tickets with IT Priority High or Medium, the top two of the three levels; High first, then most recently updated; top 5 | Empty message | Ticket Detail of the item |
  | Recently updated | All Tickets, Finished included, with Last Updated within the recent window, newest first, top 5 | Empty message | Ticket Detail of the item |

- **BR-31** Administrator dashboard: everything in BR-30 plus a count of
  active users for each Role (`0` when there are none), drilling to User
  Management filtered to that Role. User Management also lists inactive
  users, so its row count can be higher than the active count.
- **BR-32** Drill-down uses existing filters wherever one exists. Apart
  from BR-31 and My Planned Actions Taken, the filtered list shows exactly
  the rows a count counted at the moment it is opened. My Planned Actions
  Taken lists its first five items; any beyond five are reached from their
  Tickets.

### 5.6 Preservation and hardening

- **BR-33** Every Lab 2 and Lab 3 rule stays in force except these:

  | Earlier rule | Lab 4 |
  |---|---|
  | L3 BR-28, BR-29 (conditions on Resolved) | Add the Resolution Gate (BR-19). |
  | L3 BR-31 (Finished Ticket read-only) | Also covers Actions Taken (BR-12). |
  | L3 §3 Excluded (Actions Taken, dashboards) | Lifted for what §3 Included lists. |
  | L3 UI §4.1 (landing screens) | Dashboard is the first navigation entry and the landing screen for every role. |

- **BR-34** A failure on a new endpoint follows L3 BR-49: a generic `500`
  with no stack trace, query, file path, or hash.
- **BR-35** A form with entered data keeps it after a validation error, a
  conflict, or a failed request.
- **BR-36** A submit control is disabled while its request is pending.
- **BR-37** Action Taken text fields are trimmed, stored as plain text with
  line breaks preserved, and displayed literally (L3 BR-35). An optional
  field left empty is stored as null.

## 6. UI Specification Summary

Full detail is in `ui-spec.md`. All Lab 2 and Lab 3 Zen Green tokens,
components, and responsive rules remain in force; Lab 4 adds badges and no
new token.

| Screen | Path | Roles | Modes |
|---|---|---|---|
| Requester Dashboard | `/dashboard` | Requester | View |
| IT Staff Dashboard | `/staff/dashboard` | IT Staff | View |
| Administrator Dashboard | `/staff/dashboard` | Administrator | View, with an Active accounts section |
| Staff Ticket Detail | `/staff/tickets/:id` | IT Staff, Administrator | Adds the Actions Taken card: list, view, create, edit, Mark Done, Cancel action |
| Requester Ticket Detail | `/tickets/:id` | Requester | Adds the same card, read-only |
| My Tickets | `/tickets` | Requester | Adds Open Tickets and Waiting for Requester filters and reads the status filter from the URL |
| User Management | `/admin/users` | Administrator | Reads the role filter from the URL |

- **Shell**: Dashboard is the first navigation entry and the landing screen
  for every role. Every Lab 3 entry stays. A dashboard path of another role
  shows the Forbidden page.
- **Dashboards**: a row of metric cards on top; below them link tables by
  status and IT Priority and lists of at most five, each row a drill-down
  link. No charts. One column on mobile.
- **Actions Taken card**: on Staff Ticket Detail it sits below "Manage this
  ticket" and above the tabs, titled "Actions Taken (n)" with an Add button.
  Rows show date, description, and status badge and open a read-only view of
  every field. Create and edit use a form inside the card, not a modal. A
  Planned row offers Edit, Mark Done, and Cancel action only to users
  permitted by BR-15. Requester Ticket Detail shows the same card directly
  above Public Comments, with no write control.
- **Status control**: when the Resolution Gate is unmet, Resolved stays listed
  but disabled as "Resolved (not available)", with a text reason giving the
  Done and Planned counts and a link to the card. The backend still enforces
  the rule.
- **Feedback**: loading, saving, success, validation, empty, forbidden,
  not-found, conflict, and safe failure on every screen where meaningful. A
  stale edit keeps the typed data with a reload prompt.
- **Shared versus private**: the Actions Taken card carries a caption saying
  the Requester can see it, distinct from Internal Notes.
- **Responsive**: desktop at 992px and above, tablet 768 to 991px, mobile
  below 768px. Actions Taken is a table on desktop and tablet and stacked
  cards on mobile. No horizontal page scroll at any width.

## 7. Data Changes

All changes are one additive migration over the Lab 3 schema. No existing
row is dropped or rewritten.

### 7.1 Models

- **`ActionTaken`** (new): `id`; `ticketId` (FK to `Ticket`); `actionAt`;
  `description`; `result` (nullable); `assigneeId` (FK to `User`);
  `status` (enum `ActionTakenStatus`: `PLANNED`, `DONE`, `CANCELLED`);
  `followUpRequired` (default `false`); `followUpNote` (nullable);
  `attachmentNotes` (nullable); `createdById` (FK to `User`); `createdAt`;
  `updatedAt`; `version` (default `1`); `clientRequestId` (string).
  - Unique on `(ticketId, clientRequestId)`.
  - Index on `(ticketId, createdAt)` for the Ticket's list.
  - Index on `(assigneeId, status)` for My Planned Actions Taken.
  - All foreign keys restrict delete; Users and Tickets are never deleted.
- **`Ticket`** gains the relation and an index on `updatedAt` for the recent
  lists. Its columns do not change.
- **`User`** gains the two relations. Its columns do not change.

`Ticket.updatedAt` moves on Action Taken create and edit (BR-12). Its Lab 3
behaviour is otherwise unchanged, so Internal Notes do not move it.

### 7.2 Database decisions

1. **A separate `ActionTaken` table, not a JSON column on `Ticket`.** Each
   line has its own assignee, status, and version, and the gate and My
   Planned Actions Taken must query them. Foreign keys make BR-01 and the
   rule that a person stays attributed hold in the database.
2. **A `version` integer, not a comparison of `updatedAt`.** A counter has
   no clock precision or JSON round-trip issues. The Ticket row lock from the Ticket Change module makes
   check and increment atomic.
3. **A `clientRequestId` unique per Ticket.** Actions Taken are never
   deleted, so a duplicate from a network retry would stay forever; a
   database constraint is the one guard a retry cannot pass.
4. **An enum for status, as for `TicketStatus` and `Role`.** The three
   values are fixed by rules in code, so a reference table would add a join
   and no flexibility.

### 7.3 Migration and legacy Tickets

The migration, `20261030120000_lab4_actions_taken`, creates the enum, the
table, and the indexes. It adds no column to an existing table.

- No Action Taken is created for an existing Ticket.
- Legacy Tickets behave as BR-24 states. A legacy Resolved or Closed Ticket
  with no Done Action Taken stays valid.
- Dashboards treat a legacy Ticket like any other: status, owner, IT
  Priority, `updatedAt`, and `resolvedAt` are already on the row, and a
  Ticket with no Action Taken simply adds nothing to My Planned Actions
  Taken.

### 7.4 Rollback and recovery

Before migrating a database that matters, take a `pg_dump`. Prisma has no
down migrations, so `server/prisma/rollback/lab4_actions_taken.down.sql`
drops the `ActionTaken` table, its enum, and the new `Ticket` index, and
deletes the migration's row from `_prisma_migrations`. Run it from `server/`
with `npx prisma db execute --file prisma/rollback/lab4_actions_taken.down.sql`.
With that row gone, `npx prisma migrate deploy` applies the migration again.
Rollback loses Action Taken rows and nothing else; restoring the dump is
the recovery path when those must be kept. The migration test proves both
directions.

### 7.5 Seed

The seed stays idempotent (L3 BR-47) and keeps every Lab 3 guarantee. New
Tickets are appended to `SEED_TICKETS`, continuing the reserved block at
`TKT-2026-900025`, and each one's Actions Taken are created only together
with it. Existing seed Tickets receive none, so they demonstrate zero
Actions Taken and legacy behaviour.

- Tickets with exactly one and with several Actions Taken, covering
  Planned, Done, and Cancelled, Follow-Up Required?, and an assignee who is
  not the Ticket Owner.
- At least one Ticket that passes the Resolution Gate and one blocked by
  each of its two conditions.
- All statuses, all priorities, and assigned and unassigned Tickets, as in
  Lab 3.
- New seed Tickets take their times relative to the seed run, because the
  Lab 3 seed Tickets are dated September 2026 and would never fall in the
  recent window. A database seeded more than seven days ago shows empty
  recent lists until it is rebuilt.
- Non-zero metrics for one active Requester and one active IT Staff user;
  zero recent lists for an active Requester who has no new seed Ticket, and
  zero My Planned Actions Taken for an active IT Staff user with none.

## 8. API Contract

Full detail is in `api-spec.md`. Mechanism, error body, CSRF rule, and order
of checks are as in Lab 3.

| Area | Endpoints | Roles |
|---|---|---|
| Read Actions Taken | `GET /api/tickets/:id/actions-taken` | Requester own; staff any |
| Write Actions Taken | `POST /api/staff/tickets/:id/actions-taken`, `PUT /api/staff/tickets/:id/actions-taken/:actionTakenId` | Staff; edit limited by BR-15 |
| Ticket status | `POST /api/staff/tickets/:id/status` (adds the gate) | Staff |
| Staff Ticket Detail | `GET /api/staff/tickets/:id` (adds `actionTakenCounts`) | Staff |
| My Tickets | `GET /api/tickets` (`currentStatus` accepts a list) | Requester, own |
| Assignee options | `GET /api/staff/eligible-owners` (reused) | Staff |
| Requester dashboard | `GET /api/requester/dashboard` | Requester |
| IT Staff dashboard | `GET /api/staff/dashboard` | Staff |
| Account counts | `GET /api/admin/dashboard` | Administrator |

New `409` codes: `ACTION_TAKEN_CHANGED` (stale version),
`ACTION_TAKEN_FINAL` (Done or Cancelled), `DONE_ACTION_REQUIRED` and
`PLANNED_ACTION_REMAINS` (Resolution Gate). New `403` code:
`ACTION_TAKEN_EDIT_FORBIDDEN`. Every Lab 2 and Lab 3 endpoint continues.

## 9. Acceptance Criteria

### Actions Taken

- **AC-01** Given a permitted IT Staff user and valid data, when an Action
  Taken is created, then it is saved under the correct Ticket with the
  authenticated creator and the approved assignee, defaulting to the
  creator, and Last Updated moves.
- **AC-02** Given a create request that supplies a creator, a created time,
  or a version, when it is saved, then those values are ignored.
- **AC-03** Given a missing or over-long Action Description, Result,
  Follow-up Note, or Attachment Notes, a missing Result when Done, a missing
  Follow-up Note when follow-up is required, a note when it is not, or
  Cancelled at creation, when saved, then it is rejected `400` naming the
  field and nothing is saved.
- **AC-04** Given no Action Date/Time, when an Action Taken is created, then
  it defaults to now; a Planned one may be in the future; and a Done one in
  the future is rejected `400` on create and on edit.
- **AC-05** Given an assignee who is inactive, a Requester, or unknown, when
  it is set, then it is rejected `400` with one message; another active
  staff user is accepted; and an edit that leaves an already ineligible
  assignee unchanged is accepted.
- **AC-06** Given a Planned Action Taken on an Unfinished Ticket, when its
  creator, its assignee, or an Administrator edits it, then the edit is saved,
  the version rises, and Last Updated moves; and when any other IT
  Staff user does, including the Ticket Owner, then it is rejected `403` and
  nothing changes.
- **AC-07** Given a Planned Action Taken on an Unfinished Ticket, when it is
  set to Done with a Result or to Cancelled, then the status is saved; and
  any later edit by a permitted user with the current version is rejected
  `409` `ACTION_TAKEN_FINAL`.
- **AC-08** Given any Action Taken, when deletion is requested, then there
  is no such route, and a Cancelled one stays listed.
- **AC-09** Given an edit from a stale version by a permitted user on an
  Unfinished Ticket, when it is saved, then it is rejected `409` `ACTION_TAKEN_CHANGED` and nothing changes, and the form
  keeps the typed data and prompts to reload.
- **AC-10** Given a Finished Ticket, when a valid new Action Taken is created
  or an Action Taken is edited with a valid body, then it is rejected `409`
  `TICKET_FINISHED`, and the UI offers no such control.
- **AC-11** Given a repeated click or a retried create with the same key,
  even with an invalid body or on a Ticket that has since become Finished,
  when it reaches the backend, then one Action Taken exists and the same
  record is returned with `200`; and given any field edited after a failed
  or lost response, when the form saves, then it sends a new key.
- **AC-12** Given several Actions Taken by different staff on one Ticket,
  when Staff Ticket Detail opens, then all are listed newest created first
  in a stable order with a status badge and a Follow-up badge when required,
  each opens to show every field, and the Ticket Owner is unchanged.
- **AC-13** Given a Requester's own Ticket, when Ticket Detail opens, then
  every Action Taken, Cancelled included, is shown read-only in the same card
  with its status badge and every field, and no write control is offered.
- **AC-14** Given a Requester, when an Action Taken create or edit is sent
  directly, then it is rejected `403`; and given Requester B, when the
  Actions Taken of Requester A's Ticket are requested, then the `404` is
  identical to that for a nonexistent id.
- **AC-15** Given an Action Taken containing HTML or script markup, when it
  is displayed, then the markup appears as literal text.

### Ticket workflow

- **AC-16** Given a Ticket with no Done Action Taken, when an otherwise valid
  move to Resolved is sent directly to the API, then it is rejected `409`
  `DONE_ACTION_REQUIRED` and the Ticket is unchanged.
- **AC-17** Given a Ticket with a Done and a Planned Action Taken, when an
  otherwise valid move to Resolved is sent, then it is rejected `409`
  `PLANNED_ACTION_REMAINS` and the Ticket is unchanged.
- **AC-18** Given a Ticket with an owner, at least one Done, no Planned, and
  a valid Resolution Summary, when it moves to Resolved, then it succeeds,
  with Cancelled Actions Taken and Follow-Up Required? having no effect.
- **AC-19** Given a Ticket in each status, when each transition is
  requested, then exactly the §5.4 pairs succeed, every other pair from an
  Unfinished status is rejected `409` `INVALID_TRANSITION`, and any request
  from Closed or Cancelled is rejected `409` `TICKET_FINISHED`.
- **AC-20** Given a move to Resolved and a new Planned Action Taken sent at
  the same moment, when both finish, then the Ticket is never Resolved over
  a Planned Action Taken created before the move.
- **AC-21** Given a Requester's Problem Appears Resolved indication, when it
  is set, then the status is unchanged and the gate still applies.
- **AC-22** Given Tickets already Resolved or Closed before the migration,
  when the migration has run, then they are unchanged and a Resolved one can
  still be Closed or Reopened; and an Unfinished legacy Ticket is refused
  Resolved until it has a Done Action Taken.
- **AC-23** Given a Reopened Ticket with an earlier Done Action Taken and no
  Planned one, when it moves to Resolved, then it succeeds.
- **AC-24** Given a Resolved Ticket with a Planned Action Taken added
  afterwards, when it is Closed, then the move succeeds and the Action Taken
  stays Planned and read-only.
- **AC-25** Given the Ticket status controls, when they render, then only
  permitted transitions are offered; when the gate is unmet, Resolved is
  listed disabled as "Resolved (not available)" with a reason stating the Done
  and Planned counts and a link to the Actions Taken card; and a successful
  change refreshes the Ticket summary.

### Dashboards

- **AC-26** Given an authenticated Requester, when dashboard data is
  retrieved, then only metrics and recent Tickets owned by that Requester
  are returned.
- **AC-27** Given known Tickets in every status, when the Requester dashboard
  is retrieved, then Open Tickets and Waiting for Requester equal the BR-29
  calculations.
- **AC-28** Given Tickets on both sides of the recent-window boundary, when a
  dashboard is retrieved, then a time at 00:00 Asia/Bangkok six days back is
  included, the instant before it is excluded, and lists hold at most five
  items, newest first.
- **AC-29** Given Tickets with `resolvedAt` in the window, when the Requester
  dashboard is retrieved, then Resolved and Closed ones are listed and a
  Reopened or Cancelled one is not.
- **AC-30** Given known Tickets, when the IT Staff dashboard is retrieved,
  then Unassigned, Owned by me, and every status and IT Priority count equal
  the BR-30 calculations, and Finished Tickets are in none of them.
- **AC-31** Given Actions Taken of several staff, statuses, and Tickets, when
  the IT Staff dashboard is retrieved, then My Planned Actions Taken holds
  only the session user's Planned ones on Unfinished Tickets, soonest first.
- **AC-32** Given Tickets of all IT Priorities, when the IT Staff dashboard
  is retrieved, then Urgent holds only Unfinished High and Medium Tickets,
  High first, at most five; and Recently updated includes Finished Tickets.
- **AC-33** Given an Administrator, when the dashboard opens, then it shows
  the IT Staff dashboard plus correct active account counts by role.
- **AC-34** Given a dashboard, when each card or list item is activated, then
  the matching filtered list or Ticket Detail opens, and a count equals the
  rows listed, except the BR-31 account counts and My Planned Actions Taken,
  whose items beyond five are reached from their Tickets.
- **AC-35** Given a user with no matching data, when a dashboard is
  retrieved, then counts are `0`, lists are empty, and the screen shows its
  empty states rather than a failure.
- **AC-36** Given no session, `401`; given a Requester on a staff or
  administrator dashboard, IT Staff on the Requester or administrator one,
  or an Administrator on the Requester one, then `403` and no data.
- **AC-37** Given a dashboard response, when it is inspected, then it holds
  only documented fields and no Ticket description, Public Comment, or
  Internal Note.
- **AC-38** Given a dashboard screen, when it is loading, forbidden, or its
  request fails, then a distinct loading, Forbidden, or safe failure state
  with Retry is shown.

### Migration and seed

- **AC-39** Given a Lab 3 database with Users, Tickets, Attachments, Public
  Comments, and Internal Notes, when the Lab 4 migration runs, then every row
  is unchanged and no Action Taken exists.
- **AC-40** Given a migrated database, when the rollback runs, then the Lab 3
  schema and every earlier row remain intact, and a later
  `npx prisma migrate deploy` applies the migration again.
- **AC-41** Given a migrated database, when the seed runs twice, then the
  second run changes nothing and the §7.5 data exists, with Lab 3 seed
  guarantees intact.

### Hardening and presentation

- **AC-42** Given the Lab 1, Lab 2, and Lab 3 suites, when run against the
  final code, then all pass, changed only as `tests.md` §1 lists.
- **AC-43** Given each role, when the user signs in, then their Dashboard is
  the landing screen and the first navigation entry, it shows the active page,
  and every Lab 3 entry remains.
- **AC-44** Given the Actions Taken area and the dashboards, when requests
  are loading, succeed, fail validation, conflict, or find nothing, then the
  matching consistent feedback appears.
- **AC-45** Given an unexpected server failure or a lost connection, when a
  Lab 4 screen makes a request, then a safe message is shown, entered data
  is kept, and no internal detail is exposed.
- **AC-46** Given desktop, tablet, and mobile widths, when every Lab 4 screen
  is inspected, then nothing is clipped, nothing overlaps, and the page does
  not scroll horizontally.
- **AC-47** Given a keyboard-only user, when they move through each Lab 4
  screen and dialog, then every control is reachable, shows visible focus,
  and has an accessible name.
- **AC-48** Given status, Action Taken, and Follow-up badges and shared or
  private content, when displayed, then each is distinguished by text as
  well as colour and matches `ui-spec.md`.
- **AC-49** Given the final application, when every screen is exercised, then
  there are no console errors, broken links, placeholder text, or unfinished
  controls, and the README instructions work as written.
- **AC-50** Given the test database with 1000 Tickets, when each dashboard
  endpoint is requested, then it answers within one second.

## 10. Definition of Done

The coding agent may report Sprint 4 complete only when every item holds on
the final `main` branch:

- [ ] Every FR and BR above is implemented, and nothing outside §3 Included
      has been added.
- [ ] Every AC passes, with a passing automated test for each row of
      `tests.md` §2 and no row left Planned.
- [ ] No required test is skipped, disabled, commented out, weakened to pass,
      or unrelated to the AC it claims.
- [ ] The implementation matches this file, `api-spec.md`, and `ui-spec.md`.
      Any deviation was made by changing the contract first, in a reviewed
      PR.
- [ ] The Ticket Change module from #74 is on `lab4-staging` before Action
      Taken code merges, and no module but it locks a Ticket row.
- [ ] Every new endpoint enforces §5.3 on the backend and is in the
      authorization test's endpoint table.
- [ ] The migration applies cleanly to a Lab 3 database and to an empty one,
      and the rollback is proven by test.
- [ ] The Lab 1, Lab 2, and Lab 3 suites pass, changed only as `tests.md` §1
      lists.
- [ ] The seed runs twice without change and provides the §7.5 data.
- [ ] Selected dashboard metrics are shown to match direct database queries.
- [ ] Screenshots of every Lab 4 screen at desktop, tablet, and mobile are
      stored under `artifacts/lab-04/screenshots/`, and the visual and
      accessibility checklist of `ui-spec.md` is completed.
- [ ] The full suite (unit, API, UI component, visual, E2E) passes from the
      documented commands, and the README documents setup, seed, migration,
      test, and demonstration steps.
- [ ] Each Sprint 4 Issue went through the Kanban statuses to Done by a
      peer-reviewed PR into `lab4-staging`, followed by one release PR from
      `lab4-staging` to `main`.
- [ ] `docs/lab-04/reviewer.md` and `docs/lab-04/ai-use.md` are complete.

## 11. Assumptions and Decisions

Choices the handout leaves open. Items 1 to 21 were decided by the product
owner on 2026-10-30; the rest are defaults taken while writing this contract.

1. **An Action Taken create or edit is a Ticket Change** (BR-12).
2. **An Action Taken has an assignee and its own status** (BR-04, BR-08).
3. **Edit rights go to the creator, the assignee, and Administrators**
   (BR-15), narrower than the handout's minimum for IT Staff.
4. **The Resolution Gate** needs one Done and no Planned (BR-19).
5. **No delete**; Done and Cancelled are read-only (BR-10, BR-11).
6. **Performed by is the assignee**, default the creator (BR-04). An
   ineligible assignee already on the record is kept on save (BR-04), as
   recorded in worker question 75-ineligible-assignee on 2026-10-30, so a
   deactivated user's Planned work can still be marked Done or Cancelled and
   Performed by stays true. If its creator is also gone, an Administrator
   does this.
7. **The Lab 3 matrix stays unchanged** apart from the gate (§5.4, BR-26).
8. **Dashboards** are as BR-29 to BR-31, with seven-day recency in
   Asia/Bangkok and lists of five.
9. **Stale edits use a version number** and answer `409` (BR-13).
10. **Follow-up does not block Resolved** (BR-07).
11. **Requesters see every Action Taken**, Cancelled included (BR-16).
12. **The gate applies from now on** and the migration creates no placeholder
    Actions Taken (BR-24).
13. **Action Date/Time is user-entered**, separate from Created at (BR-06).
14. **An Action Taken may be created directly as Done**, Done and Cancelled
    are final, Result is required when Done, and it cannot be created as
    Cancelled (BR-08 to BR-10).
15. **Actions Taken is its own card**, with its form inside the card and no
    modal dialog (`ui-spec.md` §8).
16. **Resolved stays visible when the gate is unmet**, disabled with a reason
    and a link to the card (`ui-spec.md` §9).
17. **Dashboards are metric cards, link tables, and lists**, one column on
    mobile, with no charts.
18. **Dashboard is the first navigation entry and the landing screen** for
    every role. Lab 3 tests that expect My Tickets, the Queue, or User
    Management after sign-in change with it (BR-33).
19. **Requester Ticket Detail reuses the same card**, read-only.
20. **A Planned row offers Edit, Mark Done, and Cancel action** to permitted
    users; Mark Done opens the form requiring Result, and Cancel action asks
    for confirmation. Actions Taken is a table on larger screens and stacked
    cards on mobile.
21. **`clientRequestId` stays** (BR-14), because the labsheet, section 8.5
    Final Regression and Product Hardening, requires that "duplicate actions
    caused by repeated clicking or network retry are prevented or safely
    handled".
22. **Text limits**: Action Description, Result, and Follow-up Note at most
    2000, like a Public Comment; Attachment Notes at most 500, since it only
    points at a file.
23. **Endpoints follow the role-by-prefix rule.** Writes are under
    `/api/staff`. The read is shared like Public Comments, under
    `/api/tickets`. `/api/requester` is a new prefix so the Requester
    dashboard gets the same role check by prefix as the other two and does
    not collide with `/api/tickets/:id`.
24. **`PUT` replaces all editable fields** of an Action Taken, so an omitted
    key cannot silently blank a value and every rule can be checked from the
    request alone.
25. **Eligible assignees reuse `GET /api/staff/eligible-owners`**, since the
    rule is the same.
26. **The list is ordered by Created at, newest first**, so a record does not
    jump when edited.
27. **My Planned Actions Taken counts Unfinished Tickets only**, because a
    Planned one on a Finished Ticket can no longer be acted on (BR-12).
28. **Unassigned counts Unfinished Tickets only**, because a Ticket cancelled
    while New has no owner and needs no attention.
29. **My Planned Actions Taken also returns its top five items.** A count
    spanning several Tickets cannot open one Ticket Detail, so the items
    carry the drill-down, and any beyond five are reached from their Tickets
    (BR-32).
30. **Recently resolved requires status Resolved or Closed**, because
    `resolvedAt` stays set after a Ticket is Reopened (L3 API §4.1).
31. **"Recent" uses calendar days**, so the time zone sets a clear date
    boundary, and Bangkok has no daylight-saving shift.
32. **The Urgent list orders by Last Updated within a priority**, as the
    Ticket Queue does by default.
33. **`currentStatus` on My Tickets accepts a list** so that Open Tickets can
    drill down; a single value behaves as before.
34. **Account drill-down reuses the role filter.** Lab 3 excluded further
    user filters, so inactive users appear there too (BR-31).
35. **Client tests go in `client/src/lab-04/`**, the handout's Lab 4 layout,
    replacing the Lab 3 choice of placing them beside components.
36. **Performance smoke target**: one second per dashboard endpoint at 1000
    Tickets, on the test database. This is a regression guard, not a
    production-scale claim.
37. **Dashboard paths follow the role paths**: `/dashboard` for a Requester
    and `/staff/dashboard` for staff, so a dashboard of another role shows the
    Forbidden page.
38. **Rows open a read-only view of every field**, for staff and Requesters
    alike, because a row shows only date, description, and status while
    Requesters must see every item. The disclosure is not one of the row
    buttons a Requester does not get.
39. **The form's Status offers Planned and Done only.** Cancelled is reached
    only through Cancel action, so it always has its confirmation.
40. **My Tickets gains "Open Tickets" and "Waiting for Requester" filter
    options**, the small addition its two drill-downs need, since its select
    holds one status and otherwise offers only New.
41. **The Administrator's Active accounts section sits under the metric
    cards** and loads on its own, so a failure there leaves the rest usable.
