# Lab 4 Test Plan and Results

Written before any Lab 4 implementation, as the plan the implementation is
built against (Test DD and TDD). Criterion numbers refer to
`specification.md` §9. Every row's Final status starts as **Planned**; a row
is Pass only when the named test exists, runs in the suite, and passes.

## 1. Test Strategy

As in Labs 2 and 3, a test observes behaviour through a seam (an HTTP
response, the rendered DOM, a screenshot, or the database after a migration),
never a private function call or a query shape.

- **API (primary seam)**: Supertest against the real Express `app` and a real
  test PostgreSQL database, in `server/tests/lab-04/`. Every business rule is
  proved here. Identity comes from signing in, as in Lab 3.
- **Authorization**: the table-driven test of Lab 3 is extended by adding each
  new endpoint to its endpoint table, so every one is run with no session and
  with each role.
- **Workflow**: API tests of the Ticket status matrix and Resolution Gate.
- **Unit (narrow)**: pure rules worth exercising at every boundary: the recent
  window and the Action Taken rules.
- **Time**: the recent window and the future-date rule read the injectable
  clock, so tests fix "now" around the Bangkok date boundary.
- **Migration**: a test builds a database at the Lab 3 schema with fixture
  rows, applies the Lab 4 migration, and inspects it, then applies the
  rollback and `migrate deploy` again. `seed.test.ts` runs the real seed twice.
- **Regression**: the Lab 1, Lab 2, and Lab 3 suites stay and must pass. They
  change in three ways only. Where `specification.md` BR-33 replaces a rule:
  expectations of landing on My Tickets, the Queue, or User Management after
  sign-in, of the exact navigation entries, and of resolving a Ticket with no
  Done Action Taken. Where a new endpoint joins the Lab 3 endpoint table:
  `server/tests/lab-03/support/endpoints.ts` and the endpoint counts in
  `endpoints.unit.test.ts`. And where a Ticket Detail response or screen gains
  Lab 4 data: the additive `actionTakenCounts` field in exact `StaffTicket`
  assertions and client fixtures, and the mocked API calls the Actions Taken
  card makes on the two Ticket Detail screens. Those tests move to the new
  behaviour; their other assertions stay.
- **UI component**: Vitest and Testing Library rendering real components with
  only `client/src/api.ts` mocked, in `client/src/lab-04/`, using the file names
  the handout lists.
- **UI style and responsive**: Playwright screenshots at 1280, 900, and 390px
  into `artifacts/lab-04/screenshots/`, judged against `ui-spec.md` §13, plus an
  automated no-horizontal-scroll check.
- **Performance smoke**: a timed call to each dashboard endpoint over 1000
  generated Tickets in the test database.
- **E2E**: Playwright against the running client, API, and a seeded database,
  in `e2e/lab-04/`, for flows that cross roles, with the Lab 3 approach of
  `e2e.` test users.

Every Acceptance Criterion maps to at least one row (§3).

## 2. Planned Tests

The Ticket Change module has its own tests from #74,
`server/tests/lab-04/ticket-change.api.test.ts`, which are not repeated here.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-28 | Recent-window calculation with a fixed clock at 23:59 and 00:00 Asia/Bangkok, across a month end | `recentSince` is 00:00 Bangkok six calendar days before today, as UTC | `server/tests/lab-04/dashboard-window.unit.test.ts` | Planned |
| UNIT-02 | Unit | AC-03, AC-04 | Action Taken body schema at each length boundary and each status and follow-up combination | Accepts exactly the valid bodies; names the field otherwise | `server/tests/lab-04/action-taken-schema.unit.test.ts` | Planned |
| API-01 | API | AC-13 | Requester lists Actions Taken of their own Ticket, with Planned, Done, and Cancelled present | 200; all returned, every field, `canEdit` false | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-02 | API | AC-12 | Staff list a Ticket with several Actions Taken by different staff | 200; newest created first, ties by id; Ticket Owner unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-03 | API | AC-01 | Create a valid Action Taken with no `assigneeId`, and with another active staff user | 201 under the correct Ticket; creator is the session user; assignee is the default or the one given; version 1; Last Updated moves | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-04 | API | AC-02 | Create with a forged creator, created time, version, and Ticket id in the body | Forged values are ignored | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-05 | API | AC-03 | Each invalid body, table-driven: missing or over-long text, Done with no Result, follow-up with no note, note with no follow-up, `CANCELLED` at creation | 400 naming the field; nothing saved | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-06 | API | AC-04 | Create with no `actionAt`; Planned in the future; Done in the future; edit to Done with a future time, with a fixed clock | Default is now; Planned 201; Done 400 on `actionAt` on create and on edit | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-07 | API | AC-05 | Set the assignee to an inactive user, a Requester, and an unknown id, on create and on edit | 400 on `assigneeId` with the same message each time; nothing changes | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-08 | API | AC-05 | Edit a Planned Action Taken whose assignee has since been deactivated, keeping the assignee, then changing it | Both 200; Performed by stays, then changes | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-09 | Authorization | AC-06 | Creator, assignee, Administrator, Ticket Owner, and another IT Staff user each edit a Planned Action Taken | First three 200, each raising the version and moving Last Updated; the others 403 `ACTION_TAKEN_EDIT_FORBIDDEN`; nothing changes | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-10 | API | AC-07 | Planned to Done with a Result; Planned to Cancelled; then edit each with the current version as creator, assignee, and Administrator | 200, then 409 `ACTION_TAKEN_FINAL` for everyone; nothing changes | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-11 | API | AC-08 | `DELETE` on an Action Taken path; list afterwards, with a Cancelled one | 404; row still listed | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-12 | Workflow | AC-09 | Two edits from the same version | First 200; second 409 `ACTION_TAKEN_CHANGED`; stored values are the first edit's | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-13 | Workflow | AC-10 | Create with a new key and edit on a Closed and on a Cancelled Ticket, also with a stale version | 409 `TICKET_FINISHED` ahead of any other 409; a Planned one stays Planned | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-14 | API | AC-11 | The same `clientRequestId` twice, sent in sequence and in parallel; the same key on another Ticket | One row and the same record; another Ticket gets its own | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-15 | API | AC-11 | Repeat a committed create with an invalid body, and after its Ticket became Finished | 200 with the existing record; nothing changes | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-16 | Authorization | AC-14 | Requester sends create and edit to their own Ticket; Requester B lists Requester A's Actions Taken; a nonexistent id | 403 and nothing changes; two identical 404 bodies | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-17 | Authorization | AC-15 | Action Taken text containing `<script>` and HTML | Stored and returned verbatim as a JSON string | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-18 | API | AC-12 | An Action Taken on an unassigned Ticket, and one performed by someone other than the Ticket Owner | Both succeed; ownership is unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-19 | API | AC-44 | A path mismatch: an Action Taken id under another Ticket | 404 | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-20 | API | AC-45 | Create and edit with the database call forced to throw | 500 with the generic body and no internal detail | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| WF-01 | Workflow | AC-16 | Move to Resolved by direct request with zero Action Taken, and with only Cancelled | 409 `DONE_ACTION_REQUIRED`; Ticket unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-02 | Workflow | AC-17 | Move to Resolved with a Planned and a Done Action Taken | 409 `PLANNED_ACTION_REMAINS`; Ticket unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-03 | Workflow | AC-18 | Move to Resolved from each permitted status with one Done, plus a Cancelled and a follow-up flagged one | 200; `RESOLVED`; summary stored | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-04 | Workflow | AC-19 | Every pair of statuses, table-driven, with the gate satisfied | Exactly the §5.4 pairs succeed; other pairs from an Unfinished status 409 `INVALID_TRANSITION`; any request from Closed or Cancelled 409 `TICKET_FINISHED` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-05 | Workflow | AC-16, AC-17 | Gate against the Lab 3 checks: no owner, stale status, invalid summary, Finished Ticket | The documented order of `api-spec.md` §3.1 holds | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-06 | Workflow | AC-20 | Move to Resolved and a Planned create sent in parallel, repeated | Never Resolved over a Planned one created before the move; the two serialise | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-07 | Workflow | AC-21 | Requester sets Problem Appears Resolved on a Ticket with no Done, then staff try to resolve | Status unchanged; 409 `DONE_ACTION_REQUIRED` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-08 | Workflow | AC-22 | Legacy Resolved Ticket with no Action Taken is Closed, and another Reopened; legacy In Progress Ticket moves to Resolved | 200 for both; then 409 until a Done exists | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-09 | Workflow | AC-23 | Reopen a Ticket with a Done Action Taken and resolve it again; then again with a new Planned | 200; then 409 `PLANNED_ACTION_REMAINS` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-10 | Workflow | AC-24 | Add a Planned Action Taken to a Resolved Ticket, then Close it | Status stays Resolved on add; Close 200; the action is Planned and read-only | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-11 | API | AC-25 | `GET /api/staff/tickets/:id` with Actions Taken in each status | `actionTakenCounts` correct; `allowedTransitions` as the matrix | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| DASH-01 | Authorization | AC-26 | Two Requesters with Tickets request the dashboard, sending another `requesterId` | Only the session user's metrics and Tickets | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-02 | API | AC-27 | Tickets in all eight statuses; compare with direct database queries | `openCount` and `waitingForRequesterCount` match | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-03 | API | AC-28 | Tickets on both sides of the boundary and more than five in the window, with a fixed clock | Boundary included; instant before excluded; five, newest first | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-04 | API | AC-29 | `resolvedAt` in the window on Resolved, Closed, Reopened, and Cancelled Tickets | Resolved and Closed are listed; the others are not | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-05 | API | AC-35 | Requester with no Tickets | 200; counts 0; lists empty | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-06 | Authorization | AC-37 | Requester dashboard over Tickets with Internal Notes and Public Comments | Only documented fields; no description, comment, or note | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-07 | API | AC-30 | Known Tickets; compare each count with direct database queries | Unassigned, Owned by me, status, and IT Priority counts match; Finished Tickets excluded; zero keys present | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-08 | API | AC-31 | Actions Taken of several staff in each status, on Unfinished and Finished Tickets; more than five | Only the session user's Planned ones on Unfinished Tickets, soonest first, five items, true count | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-09 | API | AC-32 | Tickets of each IT Priority, Unfinished and Finished; recent Finished Tickets | Urgent: High then Medium, Unfinished, five; Recently updated includes Finished | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-10 | API | AC-33 | `GET /api/admin/dashboard` with active and inactive users of each role; Administrator on the staff dashboard | Active counts match direct queries; staff data as for IT Staff | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-11 | API | AC-34 | Follow each drill-down of `api-spec.md` §5, comparing the list's `totalItems` with the count | Equal for every Ticket metric; My Tickets accepts the status list | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-12 | API | AC-35 | Staff user with no data in an empty database | 200; counts 0; lists empty | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-13 | Authorization | AC-36 | Every dashboard endpoint with no session and each wrong role | 401 and 403, no data | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| DASH-14 | Authorization | AC-37 | Staff dashboard response keys | Only documented fields; no description, comment, or note | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-15 | API | AC-45 | Each dashboard with the database call forced to throw | 500 with the generic body | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| PERF-01 | Performance smoke | AC-50 | Each dashboard endpoint over 1000 generated Tickets | Answers within one second | `server/tests/lab-04/dashboard-performance.test.ts` | Planned |
| MIG-01 | Migration | AC-39 | Apply the Lab 3 schema with fixture rows, then the Lab 4 migration | Row counts and every earlier row unchanged; `ActionTaken` is empty | `server/tests/lab-04/migration.test.ts` | Planned |
| MIG-02 | Migration | AC-40 | Run the rollback on the migrated database, then `migrate deploy` | `ActionTaken`, its enum, and the migration's `_prisma_migrations` row are gone; earlier rows unchanged; the Lab 3 schema is restored; `migrate deploy` then re-applies the migration and recreates `ActionTaken` | `server/tests/lab-04/migration.test.ts` | Planned |
| MIG-03 | Migration | AC-41 | Run the seed twice and compare every table | Second run changes no row | `server/tests/lab-04/seed.test.ts` | Planned |
| MIG-04 | Migration | AC-41 | Inspect the seeded database | §7.5 data exists: zero, one, and several Actions Taken; every Action status; gate-passing and gate-blocked Tickets; non-zero and zero metrics | `server/tests/lab-04/seed.test.ts` | Planned |
| REG-01 | Regression | AC-42 | Lab 1, Lab 2, and Lab 3 server suites | All pass, changed only as §1 states | `server/tests/lab-01/*.test.ts` `server/tests/lab-02/*.test.ts` `server/tests/lab-03/*.test.ts` | Planned |
| REG-02 | Regression | AC-42 | Lab 2 and Lab 3 client suites | All pass, changed only as §1 states | `client/src/*.test.tsx` | Planned |
| REG-03 | Regression | AC-42 | Lab 2 and Lab 3 E2E flows | All pass, changed only as §1 states | `e2e/lab-02/*.spec.ts` `e2e/lab-03/*.spec.ts` | Planned |
| UI-01 | UI | AC-12 | Actions Taken card, staff: rows, count, badges, open a row | Date, description, status and Follow-up badges; view shows every field | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-02 | UI | AC-01, AC-03, AC-04 | Create form: defaults, validation, submit | Date is now, Performed by is the user, Status is Planned; unchecking Follow-up required clears the note; field messages and no call; one call; list reloads | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-03 | UI | AC-06, AC-07 | Row buttons with `canEdit` true and false, on Planned, Done, and Cancelled rows | Edit, Mark Done, Cancel action only on `canEdit` Planned rows; none otherwise | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-04 | UI | AC-07, AC-44 | Mark Done: opens the form, Result required; Cancel action: dismiss, then confirm, then confirm answered `ACTION_TAKEN_CHANGED` and a failure | Status fixed at Done; dismiss sends nothing; confirm sends `CANCELLED`; the confirmation stays open with the alert; Reload closes it and reloads the list | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-05 | UI | AC-09 | Save answered `ACTION_TAKEN_CHANGED`; Reload | Typed data kept with the conflict notice; Reload shows the latest version | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-06 | UI | AC-10 | Card on a Finished Ticket; save answered `TICKET_FINISHED` and `ACTION_TAKEN_FINAL` | No Add or row buttons; Conflict notice; typed data kept | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-07 | UI | AC-11 | Double click on Save; retry after a failure | One request at a time; a retry with the body unchanged reuses the `clientRequestId` | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-08 | UI | AC-13 | Card rendered for a Requester | Every Action Taken with status badges; rows open; no Add, form, or row buttons | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-09 | Security | AC-15 | Action Taken text containing markup | Rendered as literal text; no element injected | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-10 | UI | AC-44, AC-45 | Card loading, empty, 403, 404, and failure | Skeleton; role-specific empty text; alert; typed data kept; Retry | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-11 | UI | AC-25 | Status select with the gate unmet by each condition | "Resolved (not available)" disabled; reason states Done and Planned counts; link reaches the card | `client/src/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-12 | UI | AC-25 | Status select with the gate met; other transitions; after a save | Resolved opens the Lab 3 dialog; only allowed options; summary status refreshes and the reason clears | `client/src/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-13 | UI | AC-16, AC-17 | A stale screen answered `DONE_ACTION_REQUIRED` or `PLANNED_ACTION_REMAINS` | Conflict notice; Ticket and card reload | `client/src/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-14 | UI | AC-27, AC-34 | Requester Dashboard: cards and lists | Counts and rows from the API; links to filtered My Tickets and Ticket Detail | `client/src/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-15 | UI | AC-35, AC-38 | Requester Dashboard: loading, empty, failure | Skeleton; `0` and empty text; safe failure with Retry | `client/src/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-16 | UI | AC-30, AC-31, AC-32, AC-34 | IT Staff Dashboard: cards, link tables, lists | Each link's target is as `ui-spec.md` §6.1; My Planned moves focus to its list | `client/src/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-17 | UI | AC-35, AC-38 | IT Staff Dashboard: loading, empty, forbidden, failure | Four distinct states | `client/src/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-18 | UI | AC-33 | Dashboard for an Administrator and for IT Staff; account request fails | Active accounts only for the Administrator, linking to User Management; its failure leaves the rest usable | `client/src/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-19 | UI | AC-34 | My Tickets and User Management opened with URL filters | The matching filter is applied; "Open Tickets" sends the five statuses | `client/src/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-20 | UI | AC-43 | Shell for each role; sign-in; Forbidden page button | Dashboard first and active; Lab 3 entries stay; landing is the Dashboard | `client/src/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-21 | UI style | AC-48 | Action status and Follow-up badge components | Label, icon, and style class match `ui-spec.md` §2.2 | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-22 | UI | AC-11 | Edit a field after a failed or lost response, then Save | The request carries a new `clientRequestId` | `client/src/lab-04/ActionsTaken.test.tsx` | Planned |
| VIS-01 | UI style | AC-46, AC-48 | Screenshots of the Requester Dashboard at the three widths, plus empty | Match the `ui-spec.md` §13 checklist | `e2e/lab-04/visual-dashboards.spec.ts` | Planned |
| VIS-02 | UI style | AC-46, AC-48 | Screenshots of the IT Staff and Administrator dashboards at the three widths, plus empty | Same checklist | `e2e/lab-04/visual-dashboards.spec.ts` | Planned |
| VIS-03 | UI style | AC-46, AC-48 | Screenshots of the Actions Taken card, staff and Requester, at the three widths, plus form, conflict, and Resolved not available | Same checklist | `e2e/lab-04/visual-actions-taken.spec.ts` | Planned |
| VIS-04 | Responsive | AC-46 | Every Lab 4 screen at the three widths: page width against viewport; Actions Taken table or cards | No horizontal scroll; table on desktop and tablet, cards on mobile; one column on mobile dashboards | `e2e/lab-04/responsive.spec.ts` | Planned |
| E2E-01 | E2E | AC-01, AC-07, AC-12, AC-13 | IT Staff adds Planned actions to a Ticket, assigns one to a colleague, who marks it Done, and cancels another; the Requester reads all of them | Different actions on one Ticket; each step visible to the right role; read-only for the Requester | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-02 | E2E | AC-05, AC-06 | Inactive user is not offered; other IT Staff sees no row buttons and is refused by direct request | Not listed; no buttons; 403 | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-03 | E2E | AC-09 | Two staff sessions edit the same Planned action | The second sees the conflict with typed data kept, then reloads | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-04 | E2E | AC-16, AC-17, AC-18, AC-25 | Status control shows Resolved (not available); staff complete the work, resolve, and close | Reason then normal option; Resolved, then Closed; Ticket read-only | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-05 | E2E | AC-16, AC-21 | Requester indicates resolved; a direct status request bypasses the screen | Status unchanged; 409 | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-06 | E2E | AC-19, AC-23 | Ticket walks from New through Reopened to Resolved again and Closed | Each step offers only permitted transitions | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-07 | E2E | AC-26, AC-34, AC-43 | Requester signs in, lands on the Dashboard, and drills into each card and list | Own Tickets only; matching views | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-08 | E2E | AC-30, AC-31, AC-34, AC-43 | IT Staff signs in, lands on the Dashboard, and drills into each metric | Ticket counts equal the rows listed; My Planned Actions Taken lists at most five | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-09 | E2E | AC-33, AC-43 | Administrator signs in and opens each Active accounts card | Filtered User Management; every Lab 3 entry remains | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-10 | E2E | AC-36, AC-38 | Staff opens `/dashboard`; Requester opens `/staff/dashboard`; each calls the other's API | Forbidden page; 403 | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-11 | E2E | AC-47 | Keyboard-only pass over every Lab 4 screen, the form, and the confirmation | Every control reachable with visible focus and an accessible name; focus returns on close | `e2e/lab-04/accessibility.spec.ts` | Planned |
| E2E-12 | E2E | AC-45 | Dashboards and the Actions Taken form with the API forced to fail | Safe message; typed data kept; no internal detail on screen | `e2e/lab-04/safe-failure.spec.ts` | Planned |
| E2E-13 | E2E | AC-49 | Visit every screen of every role, following each link, with a console listener | No console error, no broken link, no placeholder text | `e2e/lab-04/final-regression.spec.ts` | Planned |
| E2E-14 | E2E | AC-42 | One full journey: login, create a Ticket, Attachment, comment, note, Action Taken, resolve, close, plus user administration | Every earlier function still works alongside Lab 4 | `e2e/lab-04/final-regression.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-03, UI-02, E2E-01 |
| AC-02 | API-04 |
| AC-03 | UNIT-02, API-05, UI-02 |
| AC-04 | UNIT-02, API-06, UI-02 |
| AC-05 | API-07, API-08, E2E-02 |
| AC-06 | API-09, UI-03, E2E-02 |
| AC-07 | API-10, UI-03, UI-04, E2E-01 |
| AC-08 | API-11 |
| AC-09 | API-12, UI-05, E2E-03 |
| AC-10 | API-13, UI-06 |
| AC-11 | API-14, API-15, UI-07, UI-22 |
| AC-12 | API-02, API-18, UI-01, E2E-01 |
| AC-13 | API-01, UI-08, E2E-01 |
| AC-14 | API-16 |
| AC-15 | API-17, UI-09 |
| AC-16 | WF-01, WF-05, UI-13, E2E-04, E2E-05 |
| AC-17 | WF-02, WF-05, UI-13, E2E-04 |
| AC-18 | WF-03, E2E-04 |
| AC-19 | WF-04, E2E-06 |
| AC-20 | WF-06 |
| AC-21 | WF-07, E2E-05 |
| AC-22 | WF-08 |
| AC-23 | WF-09, E2E-06 |
| AC-24 | WF-10 |
| AC-25 | WF-11, UI-11, UI-12, E2E-04 |
| AC-26 | DASH-01, E2E-07 |
| AC-27 | DASH-02, UI-14 |
| AC-28 | UNIT-01, DASH-03 |
| AC-29 | DASH-04 |
| AC-30 | DASH-07, UI-16, E2E-08 |
| AC-31 | DASH-08, UI-16, E2E-08 |
| AC-32 | DASH-09, UI-16 |
| AC-33 | DASH-10, UI-18, E2E-09 |
| AC-34 | DASH-11, UI-14, UI-16, UI-19, E2E-07, E2E-08 |
| AC-35 | DASH-05, DASH-12, UI-15, UI-17 |
| AC-36 | DASH-13, E2E-10 |
| AC-37 | DASH-06, DASH-14 |
| AC-38 | UI-15, UI-17, E2E-10 |
| AC-39 | MIG-01 |
| AC-40 | MIG-02 |
| AC-41 | MIG-03, MIG-04 |
| AC-42 | REG-01, REG-02, REG-03, E2E-14 |
| AC-43 | UI-20, E2E-07, E2E-08, E2E-09 |
| AC-44 | API-19, UI-04, UI-10 |
| AC-45 | API-20, DASH-15, UI-10, E2E-12 |
| AC-46 | VIS-01, VIS-02, VIS-03, VIS-04 |
| AC-47 | E2E-11 |
| AC-48 | UI-21, VIS-01, VIS-02, VIS-03 |
| AC-49 | E2E-13 |
| AC-50 | PERF-01 |

## 4. Responsive and Visual Checklist

The checklist is `ui-spec.md` §13 and is the acceptance bar for the VIS rows.
Its completed form is recorded in `docs/lab-04/visual-checklist-results.md`
when the screens exist.

## 5. Test Commands

```bash
# Server: unit, API, workflow, migration, seed, and earlier-lab regression
cd server && npm run build     # type check
cd server && npm test

# Client: lint, type check, UI component tests
cd client && npm run lint
cd client && npm run build
cd client && npm test

# Playwright: E2E, visual, responsive (running client and server, seeded
# database whose name ends in _e2e)
npm run typecheck              # type check of the specs
npx playwright test e2e/lab-04
npx playwright test e2e/lab-03
npx playwright test e2e/lab-02
```

## 6. Final Results

To be recorded from the final run on `main`.

## 7. Known Limitations or Deferred Tests

None planned. Any test deferred during the sprint is recorded here with its
reason.
