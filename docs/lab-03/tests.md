# Lab 3 Test Plan and Results

Written before any Lab 3 implementation, as the plan the implementation is
built against (Test DD and TDD). Criterion numbers refer to
`specification.md` §9. Every row's Final status started as **Planned**; a
row is Pass only when the named test exists, runs in the suite, and
passes. The statuses in §2 are those of the final run recorded in §6.

## 1. Test Strategy

As in Lab 2, a test observes behaviour through a seam (an HTTP response,
the rendered DOM, a screenshot, or the database after a migration), never
a private function call or a query shape.

- **API (primary seam)**: Supertest against the real Express `app` and a
  real test PostgreSQL database, in `server/tests/lab-03/`. Every business
  rule is proved here. A test signs in through `POST /api/auth/login` and
  reuses the returned cookie; one shared helper creates a user of a given
  role with a known password and signs in. No test injects an identity by
  any other route.
- **Security and authorization**: `authorization.api.test.ts` is
  table-driven over the full endpoint list of `api-spec.md` and runs each
  endpoint with no session and with each role, so a new endpoint that is
  not added to the table fails review rather than going untested. Rows
  typed Security in §2 are the ones whose point is a refusal or a leak
  check.
- **Unit (narrow)**: pure rules that an HTTP call cannot exercise at every
  boundary cheaply: the password policy, the transition table, the initial
  password generator, the throttle arithmetic, and the queue query schema.
- **Time**: the throttle and session expiry read the time from one
  injectable clock, so tests advance it instead of sleeping.
- **Migration**: `migration.test.ts` builds a database at the Lab 2 schema
  with fixture rows, applies the Lab 3 migration, and inspects the result.
  `seed.test.ts` runs the real seed twice.
- **Regression**: the Lab 1 and Lab 2 suites stay and must pass. They
  change only in how identity is established (a session instead of
  `X-Requester-Id`) and where `specification.md` BR-48 replaces a rule:
  the `X-Requester-Id` `400` tests, the `GET /api/requesters` test, and
  the Requester Selector component suite, and the selector-gate cases of
  `client/src/App.test.tsx` are removed with the feature they tested.
  Their replacements are the AC-11, AC-18, and AC-14 rows below.
  `specification.md` §11 item 22 keeps the Lab 2 error bodies unchanged so
  that exact-body assertions in these suites still hold.
- **UI component**: Vitest and Testing Library rendering real components
  with only `client/src/api.ts` mocked, beside the component in
  `client/src/`, the Lab 2 convention, using the file names the handout
  lists.
- **UI style and responsive**: Playwright screenshots at 1280, 900, and
  390px into `artifacts/lab-03/screenshots/`, judged against the checklist
  in `ui-spec.md` §13, plus an automated no-horizontal-scroll and
  table-or-card check.
- **E2E**: Playwright against the running client, API, and a seeded
  database, in `e2e/lab-03/`, for flows that cross roles. Seed accounts
  must change their password once and the seed never resets it, so E2E
  does not sign in as them. A global setup creates its own users of each
  role, with known passwords and marked as test data by an `e2e.` email
  prefix, directly in the test database; seed Tickets are used only as
  queue data.

Every Acceptance Criterion maps to at least one row (§3).

## 2. Planned Tests

127 planned tests. Final status after the run recorded in §6: 127 Pass,
0 Fail, 0 Skipped, 0 Planned.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-08 | Password policy validator at its boundaries: 7, 8, 72, 73 characters; 72 characters that exceed 72 UTF-8 bytes; each missing character class; whitespace as the only non-alphanumeric | Accepts only 8 to 72 characters within 72 bytes with upper, lower, digit, and special; names the first unmet rule | `server/tests/lab-03/password-policy.unit.test.ts` | Pass |
| UNIT-02 | Unit | AC-34 | Transition table over all 64 from/to pairs | Exactly the BR-28 pairs are permitted; Closed and Cancelled permit none | `server/tests/lab-03/status-transitions.unit.test.ts` | Pass |
| UNIT-03 | Unit | AC-41, AC-44 | Initial password generator over 1000 draws | Four groups of four; none of `0`, `O`, `o`, `1`, `l`, `I`; no repeats | `server/tests/lab-03/initial-password.unit.test.ts` | Pass |
| UNIT-04 | Unit | AC-07 | Login throttle arithmetic with an injected clock | Fifth failure within any 15 minutes starts a 15-minute refusal; failures older than 15 minutes do not count; refusal ends by itself | `server/tests/lab-03/login-throttle.unit.test.ts` | Pass |
| UNIT-05 | Unit | AC-28 | Queue query schema with defaults and each invalid value | Defaults applied when absent; every invalid value fails naming its parameter | `server/tests/lab-03/staff-queue-query.unit.test.ts` | Pass |
| API-01 | API | AC-01 | `POST /api/auth/login` with an active user's valid credentials, email in mixed case | 200; `UserIdentity` with role; `tk_session` cookie set | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-02 | API | AC-05 | Login with an unknown email, a wrong password, and a user with no password | Three identical 401 `INVALID_CREDENTIALS` bodies; no cookie; no session row | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-03 | API | AC-06 | Login to an inactive account with the correct and with a wrong password | 403 `ACCOUNT_INACTIVE` for correct; generic 401 for wrong; no session | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-04 | API | AC-07 | Five failed logins, then the correct password; then again after the clock passes 15 minutes; same for an unknown email | 429 `LOGIN_THROTTLED` with `Retry-After`; then 200; unknown email throttled identically | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-05 | API | AC-02 | User who must change password calls protected endpoints, `me`, and `change-password` | 403 `PASSWORD_CHANGE_REQUIRED` on protected endpoints; `me` and `change-password` allowed | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-06 | API | AC-08 | `POST /api/auth/change-password` breaking each BR-08 rule, with a differing confirmation, with the current password reused, with a wrong current password | 400 naming the field each time; hash and must-change flag unchanged | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-07 | API | AC-09 | Valid password change with a second session open | 200; flag cleared; new cookie value; second session gets 401; old password 401, new password 200 | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-08 | API | AC-10 | `POST /api/auth/logout`, then replay the old cookie; logout again | 204; session row gone; replay 401; repeat 204 | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-09 | API | AC-11 | `GET /api/auth/me` with and without a session | 200 with only id, name, email, role, mustChangePassword; 401 without | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-10 | API | AC-12 | Session whose `expiresAt` has passed; and a session used within the window | 401 for the expired one; expiry moves forward on use | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-11 | Security | AC-13 | Login response cookie attributes and body; state-changing request with a foreign `Origin` | `HttpOnly`, `SameSite=Strict`; no token in body; foreign origin 403 `ORIGIN_NOT_ALLOWED`; allowed origin passes | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-12 | API | AC-52 | Login while the database call is forced to throw | 500 with the generic body; no stack, SQL, or path in the response | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-13 | Security | AC-11 | Every protected endpoint, table-driven, with no session | 401 `UNAUTHENTICATED` and no data for each | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-14 | Security | AC-15 | Requester calls every `/api/staff` and `/api/admin` endpoint | 403 `FORBIDDEN` and no data for each | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-15 | Security | AC-15 | IT Staff calls every `/api/admin` endpoint; IT Staff and Administrator call each Requester-only endpoint | 403 `FORBIDDEN` for each | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-16 | Security | AC-16 | Administrator runs queue, detail, owner, IT Priority, status, Public Comment, and Internal Note operations | Each succeeds as for IT Staff | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-17 | Security | AC-17 | A signed-in user is deactivated, has their role changed, and is given a new initial password | That user's existing session gets 401 after each | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-18 | Security | AC-03 | Requester sends another Requester's id as `X-Requester-Id`, in the body, and in the query | The created Ticket belongs to the session user; the list holds only their Tickets | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-19 | Security | AC-19 | Requester B requests Requester A's Ticket, Attachment download, and Public Comments, and posts a Public Comment to it; the same for a nonexistent id | 404 with identical bodies in both cases; no comment created | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-20 | Security | AC-22 | Requester calls the owner, IT Priority, and status endpoints for their own Ticket | 403; the Ticket is unchanged | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-21 | API | AC-24 | `GET /api/staff/tickets` with no parameters | 200; Tickets of several Requesters; `updatedAt` descending; 10 rows; correct `meta` | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-22 | API | AC-25 | `search` by Ticket Number fragment, Summary word, and Requester name, in mixed case | Only matching Tickets each time | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-23 | API | AC-26 | Each filter alone (`status` list, `owner` unassigned, me, and id, `itPriority`, `categoryId`, `appearsResolved`) and two combined | Only Tickets matching every active filter | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-24 | API | AC-27 | Each `sortBy` in both directions across two pages | Order as requested; ties stable; no row repeated or skipped between pages | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-25 | API | AC-28 | `page=2`, each `pageSize`, and a page past the last | Correct rows and `meta`; empty `data` with true totals past the end | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-26 | API | AC-28 | Each invalid query value, table-driven | 400 `VALIDATION_ERROR` with `field` naming the parameter | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-27 | API | AC-30 | `GET /api/staff/tickets/:id` for another Requester's Ticket with an active and a removed Attachment; staff download; unknown id | 200 `StaffTicket` with `allowedTransitions`; download 200; unknown 404 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-28 | API | AC-31 | Claim an unassigned New Ticket | Owner is the session user; `ownerChangedAt` set; status `OPEN` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-29 | API | AC-32 | Assign to another active staff user; unassign; assign the current owner again; assign on an In Progress Ticket | Owner changes and `ownerChangedAt` moves each time, including on unassign; no-op is 200 and moves nothing; status untouched unless New | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-30 | API | AC-32 | Assign to an inactive staff user, a Requester, and an unknown id | 400 with `field: ownerId` and the same message each time; owner unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-31 | API | AC-32 | Owner request with a stale `expectedOwnerId` | 409 `OWNER_CHANGED`; owner unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-32 | API | AC-33 | `PUT .../it-priority` with a valid and an invalid value | 200 and stored; `requestedPriority` unchanged; invalid 400 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-33 | API | AC-34 | Every permitted transition of BR-28, table-driven | 200 and the new status each time | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-34 | API | AC-34 | From each unfinished status, every transition not in BR-28, including to the same status | 409 `INVALID_TRANSITION`; status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-35 | API | AC-35 | Resolve with no owner; with a missing, 9-character, and 2001-character summary; then with an owner and a valid summary on a flagged Ticket | 409 `OWNER_REQUIRED`; 400 on `resolutionSummary`; then `RESOLVED`, summary and `resolvedAt` stored, flag cleared, summary in the Requester's detail | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-36 | API | AC-36 | Status request with a stale `expectedStatus` | 409 `STATUS_CHANGED`; status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-37 | API | AC-37 | On a Closed and on a Cancelled Ticket: owner, IT Priority, every status, Public Comment, Internal Note; and a status request that is also stale | 409 `TICKET_FINISHED` for each, ahead of any other 409; nothing changes | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-38 | API | AC-20 | Requester posts a Public Comment on their own Ticket, sending a forged author and time | 201; author is the session user; time is the server's; staff see it; `updatedAt` moves | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-39 | API | AC-20 | Public Comment that is empty, whitespace-only, 2000, and 2001 characters | 400 on `body` for empty, whitespace, 2001; 2000 accepted; nothing saved on failure | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-40 | API | AC-20 | Staff post a Public Comment on any Ticket; Requester posts on a Resolved Ticket | 201 in both cases; list is newest first | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-41 | API | AC-38 | Staff create and list Internal Notes; 4000 and 4001 characters | 201; newest first; `Ticket.updatedAt` unchanged; 4001 is 400 | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-42 | Security | AC-04 | Requester requests `GET` and `POST .../notes` for their own, another Requester's, and a nonexistent Ticket | 403 with identical bodies; no note content; nothing created | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-43 | Security | AC-23, AC-38 | After notes exist, every Requester response for that Ticket (list, detail, comments) | No note body, note id, or note count appears anywhere | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-44 | Security | AC-39 | Comment and note bodies containing `<script>` and HTML | Stored and returned verbatim as a JSON string; content type is JSON | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-45 | API | AC-20, AC-38 | `PUT`, `PATCH`, and `DELETE` on a comment and on a note | No such route: 404; entries unchanged | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-46 | API | AC-40 | `GET /api/admin/users` | 200; every user, active and inactive, ordered by name; `AdminUser` fields; no hash | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-47 | API | AC-40 | `search` by name and by email in mixed case; `role` filter; both together; invalid `role` | Only matching users; invalid role 400 | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-48 | API | AC-41 | `POST /api/admin/users`, then log in as the new user; request with a `password` key | 201 with `initialPassword` once; login works and must change; `password` key 400 | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-49 | API | AC-42 | Create and edit with an existing email in another letter case; with an invalid name, email, role, and `isActive` | 409 `EMAIL_TAKEN` on `email`; 400 naming each field | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-50 | API | AC-43 | `PATCH` name, email, role, and `isActive` separately and together; empty body; unknown id | 200 and stored; empty body 400; unknown 404 | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-51 | API | AC-44 | Set a new initial password for a signed-in user; then for oneself | 200 with the password once; old password 401; session ended; must change; own account 409 `SELF_INITIAL_PASSWORD` | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-52 | API | AC-45 | Administrator sets their own `isActive` to false | 409 `SELF_DEACTIVATION`; still active | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-53 | API | AC-46 | The only active Administrator changes their own role; then the same with a second active Administrator | 409 `LAST_ADMINISTRATOR`; allowed when another exists | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-54 | API | AC-47 | Deactivate a staff owner of unfinished and finished Tickets; change another to Requester; change IT Staff to Administrator | `unassignedTicketCount` correct; unfinished unassigned with status unchanged; finished keep owner; staff-to-staff change keeps all | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| MIG-01 | Migration | AC-48 | Apply the Lab 2 schema with fixture rows, then the Lab 3 migration; inspect users | Every former `RequesterUser` is a `User` with the same id, role `REQUESTER`, no hash, must-change true, lower-case email | `server/tests/lab-03/migration.test.ts` | Pass |
| MIG-02 | Migration | AC-48 | Same database; inspect Tickets, Attachments, Categories, Related Systems | Row counts equal; every `requesterId`, `uploadedByRequesterId`, `removedByRequesterId` unchanged | `server/tests/lab-03/migration.test.ts` | Pass |
| MIG-03 | Migration | AC-48 | Same database; inspect new Ticket columns | `itPriority` equals `requestedPriority`; status `NEW`; owner and resolution fields null | `server/tests/lab-03/migration.test.ts` | Pass |
| MIG-04 | Migration | AC-48 | Migrated user logs in before and after an Administrator sets an initial password | 401 before; 200 after, with must-change true | `server/tests/lab-03/migration.test.ts` | Pass |
| MIG-05 | Security | AC-48 | Scan every migration file for password or bcrypt-hash literals | None found | `server/tests/lab-03/migration.test.ts` | Pass |
| MIG-06 | Migration | AC-49 | Run the seed twice and compare every table | Second run changes no row; the §7.4 accounts and Ticket distribution exist | `server/tests/lab-03/seed.test.ts` | Pass |
| MIG-07 | Migration | AC-49 | Seed account logs in with the documented password; change it; run the seed again | Login must change; the changed password survives the second seed | `server/tests/lab-03/seed.test.ts` | Pass |
| REG-01 | Regression | AC-18 | The Lab 2 server suites, with identity from a session instead of `X-Requester-Id` | All pass with assertions otherwise unchanged | `server/tests/lab-02/*.test.ts` | Pass |
| REG-02 | Regression | AC-18 | The Lab 1 server suites | Health passes unauthenticated; Categories passes with a session | `server/tests/lab-01/*.test.ts` | Pass |
| REG-03 | Regression | AC-18 | Authenticated Requester creates a Ticket | 201; Lab 2 fields only; `itPriority` equals `requestedPriority` | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-04 | Regression | AC-18 | `GET /api/requesters` with a session; reference data without a session | 404; 401 | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-05 | Regression | AC-23 | `GET /api/tickets/:id` for an assigned, resolved Ticket | Lab 2 fields plus `ownerName`, `resolutionSummary`, `resolvedAt`, `requesterResolvedAt` | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-06 | API | AC-21 | Resolution indication: set, set again, withdraw; on a Resolved, a finished, and another Requester's Ticket | Timestamp set and kept; cleared; status never changes; 409 `INDICATION_NOT_AVAILABLE`; 409 `TICKET_FINISHED`; 404 | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-07 | Regression | AC-37 | Add and soft-remove an Attachment on a finished Ticket; download one | 409 `TICKET_FINISHED` for add and remove; download 200 | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-08 | Regression | AC-18 | The Lab 2 client suites for Create Ticket, My Tickets, and Requester Ticket Detail under an authenticated Requester | All pass; the selector suite is deleted with the selector | `client/src/CreateTicket.test.tsx` `client/src/MyTickets.test.tsx` `client/src/RequesterTicketDetail.test.tsx` | Pass |
| REG-09 | E2E | AC-18 | The Lab 2 E2E flows, signing in instead of selecting a Requester | Create, list, detail, Attachment, and ownership flows pass | `e2e/lab-02/*.spec.ts` | Pass |
| UI-01 | UI | AC-01 | Login: valid submit for each role | One login call; navigates to that role's landing screen | `client/src/Login.test.tsx` | Pass |
| UI-02 | UI | AC-05, AC-06, AC-07 | Login: 401, 403 inactive, and 429 responses | The matching alert; password cleared, email kept | `client/src/Login.test.tsx` | Pass |
| UI-03 | UI | AC-52 | Login: empty and malformed fields; pending request; network failure | Field messages and no call; busy button; safe failure alert with values kept | `client/src/Login.test.tsx` | Pass |
| UI-04 | UI | AC-08 | Change Password: typing updates the checklist; submit with an unmet rule, a mismatch, and a reused password | Checklist lines flip live; field messages; no call | `client/src/ChangePassword.test.tsx` | Pass |
| UI-05 | UI | AC-02, AC-09 | Change Password, mandatory mode: layout; wrong current password; another server 400; network failure; success | No navigation, no Cancel; message under the named field; safe failure with values kept; landing screen with notice | `client/src/ChangePassword.test.tsx` | Pass |
| UI-06 | UI | AC-09 | Change Password, voluntary mode | Inside the shell with Cancel; success returns with notice | `client/src/ChangePassword.test.tsx` | Pass |
| UI-07 | UI | AC-14 | Shell for each role | Only that role's entries; name and role badge; no selector and no Change Requester | `client/src/AppShell.test.tsx` | Pass |
| UI-08 | UI | AC-14 | Guards: signed out, must change password, path of another role, unknown path | Login; Change Password; Forbidden page; Not Found page | `client/src/AppShell.test.tsx` | Pass |
| UI-09 | UI | AC-10 | Logout from the menu; any request answering 401 | Logout call then Login; session-ended alert | `client/src/AppShell.test.tsx` | Pass |
| UI-10 | UI | AC-22, AC-23 | Requester Ticket Detail: status badge, owner, Resolution Summary | Shown read-only; no status, owner, or priority control | `client/src/RequesterTicketDetail.test.tsx` | Pass |
| UI-11 | UI | AC-20 | Requester Ticket Detail: Public Comments loading, list, compose, validation, empty, failure, and a 409 because the Ticket was finished meanwhile | Skeleton; newest first; posts and clears; messages; typed text kept on failure; Conflict notice and composer replaced | `client/src/RequesterTicketDetail.test.tsx` | Pass |
| UI-12 | UI | AC-21 | Requester Ticket Detail: Problem Appears Resolved in each Ticket state; a 409; a failure | Set and Withdraw work; text only when Resolved; card absent when finished; Conflict notice; safe failure | `client/src/RequesterTicketDetail.test.tsx` | Pass |
| UI-13 | UI | AC-37 | Requester Ticket Detail on a finished Ticket | No composer, no Add Attachment, no Remove; Download present | `client/src/RequesterTicketDetail.test.tsx` | Pass |
| UI-14 | Security | AC-39 | Comment body containing markup | Rendered as literal text; no element injected | `client/src/RequesterTicketDetail.test.tsx` | Pass |
| UI-15 | UI | AC-24, AC-29 | Ticket Queue: rows | Badges, owner or Unassigned, flag badge; row and Ticket Number open detail | `client/src/StaffTicketQueue.test.tsx` | Pass |
| UI-16 | UI | AC-25, AC-26, AC-27 | Ticket Queue: search, each filter, sort, Clear Filters | API called with the matching parameters; page returns to 1; defaults restored | `client/src/StaffTicketQueue.test.tsx` | Pass |
| UI-17 | UI | AC-28 | Ticket Queue: pagination and page size | Correct page requested; caption shows the range | `client/src/StaffTicketQueue.test.tsx` | Pass |
| UI-18 | UI | AC-29 | Ticket Queue: loading, empty, no-results, failure | Four distinct states; Clear Filters only on no-results; Retry on failure | `client/src/StaffTicketQueue.test.tsx` | Pass |
| UI-19 | UI | AC-30 | Staff Ticket Detail: loading, loaded layout, unknown Ticket, load failure | Skeleton; information read-only with only owner, IT Priority, status editable and Attachments download only; Not Found page; safe failure with Retry | `client/src/StaffTicketDetail.test.tsx` | Pass |
| UI-20 | UI | AC-31, AC-32 | Staff Ticket Detail: Claim; reassign from another owner; dismiss the confirmation; 409 | Claim calls once; confirmation shown; dismiss sends nothing; Conflict notice and reload | `client/src/StaffTicketDetail.test.tsx` | Pass |
| UI-21 | UI | AC-33 | Staff Ticket Detail: Update Priority | Call with the new value; success notice; Requested Priority badge unchanged | `client/src/StaffTicketDetail.test.tsx` | Pass |
| UI-22 | UI | AC-34, AC-36 | Staff Ticket Detail: status select; Closed and Cancelled confirmations | Only `allowedTransitions` listed; confirmation required; dismiss sends nothing | `client/src/StaffTicketDetail.test.tsx` | Pass |
| UI-23 | UI | AC-35 | Staff Ticket Detail: Resolved dialog with and without an owner | Summary required with messages; without owner explains and offers Claim | `client/src/StaffTicketDetail.test.tsx` | Pass |
| UI-24 | UI | AC-38 | Staff Ticket Detail: Internal Notes tab | Distinct label, strip, and button text; separate composer; typed comment text survives a tab switch | `client/src/StaffTicketDetail.test.tsx` | Pass |
| UI-25 | UI | AC-37 | Staff Ticket Detail on a finished Ticket | Read-only mode; no operational control and no composer | `client/src/StaffTicketDetail.test.tsx` | Pass |
| UI-26 | UI | AC-40 | User Management: list, search, role filter, no-results | Name, Email, Role, Status, Edit; API called with parameters; no-results text | `client/src/UserManagement.test.tsx` | Pass |
| UI-27 | UI | AC-41 | User Management: create | No password field; one-time password dialog; Done discards it | `client/src/UserManagement.test.tsx` | Pass |
| UI-28 | UI | AC-42 | User Management: invalid fields and a duplicate email | Field messages; duplicate message under Email | `client/src/UserManagement.test.tsx` | Pass |
| UI-29 | UI | AC-43, AC-47 | User Management: edit; deactivate an owner of three Tickets | Saved; confirmation states three Tickets return to the queue | `client/src/UserManagement.test.tsx` | Pass |
| UI-30 | UI | AC-44 | User Management: Set New Initial Password | Confirmation, then the one-time password dialog | `client/src/UserManagement.test.tsx` | Pass |
| UI-31 | UI | AC-45, AC-46 | User Management: own account; self-deactivation 409; last-Administrator 409; 404 on save | Active switch disabled with helper text; the matching alert; panel closes and list reloads on 404 | `client/src/UserManagement.test.tsx` | Pass |
| UI-32 | UI style | AC-50 | Badge components for every status, priority, role, and account state | Label and style class match `ui-spec.md` §2.2 | `client/src/badges.test.tsx` | Pass |
| VIS-01 | UI style | AC-50 | Screenshots of Login and Change Password at 1280, 900, and 390px | Match the `ui-spec.md` §13 checklist | `e2e/lab-03/visual-authentication.spec.ts` | Pass |
| VIS-02 | UI style | AC-50 | Screenshots of Requester Ticket Detail at the three widths | Same checklist | `e2e/lab-03/visual-requester-ticket-detail.spec.ts` | Pass |
| VIS-03 | UI style | AC-50 | Screenshots of the Ticket Queue at the three widths, plus no-results | Same checklist | `e2e/lab-03/visual-staff-queue.spec.ts` | Pass |
| VIS-04 | UI style | AC-50 | Screenshots of Staff Ticket Detail at the three widths, plus Internal Notes and the Resolved dialog | Same checklist | `e2e/lab-03/visual-staff-ticket-detail.spec.ts` | Pass |
| VIS-05 | UI style | AC-50 | Screenshots of User Management at the three widths, plus the create panel and one-time password dialog | Same checklist | `e2e/lab-03/visual-user-management.spec.ts` | Pass |
| VIS-06 | Responsive | AC-50 | Every Lab 3 screen at the three widths: page width against viewport; table or cards | No horizontal scroll; tables on desktop and tablet, cards on mobile | `e2e/lab-03/responsive.spec.ts` | Pass |
| E2E-01 | E2E | AC-01, AC-10, AC-14 | Each role signs in, sees its navigation, logs out, then opens a protected path and presses Back | Landing screen and entries per role; Login after logout; nothing protected shown | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-02 | E2E | AC-02, AC-09 | Initial password login and change | Normal app opens only after a valid change | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-03 | E2E | AC-05, AC-06, AC-07 | Wrong password, inactive account, and five failures in a row | Generic message; inactive message; throttled message | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-04 | Security | AC-13 | After login, inspect `document.cookie`, `localStorage`, and `sessionStorage` | No session value or identity readable by script; legacy `toktickit.requester` key absent | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-05 | E2E | AC-20, AC-21, AC-31, AC-33, AC-35, AC-37, AC-38 | Requester creates a Ticket and comments; IT Staff finds it, claims it, sets IT Priority, moves it to In Progress, comments, adds a note; Requester sees the comment, not the note, and indicates resolved; staff resolve with a summary and close | Each step visible to the right role; note never visible to the Requester; closed Ticket read-only | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-06 | E2E | AC-25, AC-26, AC-27, AC-28 | Queue over seed data: search, each filter, sort, page forward and back, open detail and return | Rows match; view restored after Back | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-07 | Security | AC-04, AC-15, AC-19 | Signed in as a Requester: direct requests to staff, notes, and admin endpoints; another Requester's Ticket path | 403 for each endpoint; Not Found page for the path | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-08 | E2E | AC-16 | Administrator claims a Ticket and changes its status | Works as for IT Staff | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-09 | E2E | AC-40, AC-41, AC-42, AC-43 | Administrator searches and filters users, creates one, hits a duplicate email, edits one; the new user signs in | One-time password works once; new user must change it and lands on their screen | `e2e/lab-03/user-administration.spec.ts` | Pass |
| E2E-10 | E2E | AC-17, AC-44 | Administrator sets a new initial password for a signed-in user | That user is signed out, the old password fails, the new one forces a change | `e2e/lab-03/user-administration.spec.ts` | Pass |
| E2E-11 | E2E | AC-45, AC-46, AC-47 | Self-deactivation; last Administrator's role change; deactivating a Ticket Owner | Both refused with messages; the owner's Tickets reappear in the queue as Unassigned | `e2e/lab-03/user-administration.spec.ts` | Pass |
| E2E-12 | Security | AC-14, AC-15 | IT Staff opens `/admin/users` and calls an admin endpoint | Forbidden page; 403 | `e2e/lab-03/user-administration.spec.ts` | Pass |
| E2E-13 | E2E | AC-51 | Keyboard-only pass over every Lab 3 screen and dialog | Every control reachable with visible focus and an accessible name; dialogs trap and return focus | `e2e/lab-03/accessibility.spec.ts` | Pass |
| E2E-14 | E2E | AC-52 | Queue, Staff Ticket Detail, and User Management with the API forced to fail | Safe message; typed data kept; no internal detail on screen | `e2e/lab-03/safe-failure.spec.ts` | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, UI-01, E2E-01 |
| AC-02 | API-05, UI-05, E2E-02 |
| AC-03 | API-18 |
| AC-04 | API-42, E2E-07 |
| AC-05 | API-02, UI-02, E2E-03 |
| AC-06 | API-03, UI-02, E2E-03 |
| AC-07 | UNIT-04, API-04, UI-02, E2E-03 |
| AC-08 | UNIT-01, API-06, UI-04 |
| AC-09 | API-07, UI-05, UI-06, E2E-02 |
| AC-10 | API-08, UI-09, E2E-01 |
| AC-11 | API-09, API-13 |
| AC-12 | API-10 |
| AC-13 | API-11, E2E-04 |
| AC-14 | UI-07, UI-08, E2E-01, E2E-12 |
| AC-15 | API-14, API-15, E2E-07, E2E-12 |
| AC-16 | API-16, E2E-08 |
| AC-17 | API-17, E2E-10 |
| AC-18 | REG-01, REG-02, REG-03, REG-04, REG-08, REG-09 |
| AC-19 | API-19, E2E-07 |
| AC-20 | API-38, API-39, API-40, API-45, UI-11, E2E-05 |
| AC-21 | REG-06, UI-12, E2E-05 |
| AC-22 | API-20, UI-10 |
| AC-23 | API-43, REG-05, UI-10 |
| AC-24 | API-21, UI-15 |
| AC-25 | API-22, UI-16, E2E-06 |
| AC-26 | API-23, UI-16, E2E-06 |
| AC-27 | API-24, UI-16, E2E-06 |
| AC-28 | UNIT-05, API-25, API-26, UI-17, E2E-06 |
| AC-29 | UI-15, UI-18 |
| AC-30 | API-27, UI-19 |
| AC-31 | API-28, UI-20, E2E-05 |
| AC-32 | API-29, API-30, API-31, UI-20 |
| AC-33 | API-32, UI-21, E2E-05 |
| AC-34 | UNIT-02, API-33, API-34, UI-22 |
| AC-35 | API-35, UI-23, E2E-05 |
| AC-36 | API-36, UI-22 |
| AC-37 | API-37, REG-07, UI-13, UI-25, E2E-05 |
| AC-38 | API-41, API-43, API-45, UI-24, E2E-05 |
| AC-39 | API-44, UI-14 |
| AC-40 | API-46, API-47, UI-26, E2E-09 |
| AC-41 | UNIT-03, API-48, UI-27, E2E-09 |
| AC-42 | API-49, UI-28, E2E-09 |
| AC-43 | API-50, UI-29, E2E-09 |
| AC-44 | UNIT-03, API-51, UI-30, E2E-10 |
| AC-45 | API-52, UI-31, E2E-11 |
| AC-46 | API-53, UI-31, E2E-11 |
| AC-47 | API-54, UI-29, E2E-11 |
| AC-48 | MIG-01, MIG-02, MIG-03, MIG-04, MIG-05 |
| AC-49 | MIG-06, MIG-07 |
| AC-50 | UI-32, VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, VIS-06 |
| AC-51 | E2E-13 |
| AC-52 | API-12, UI-03, E2E-14 |

## 4. Responsive and Visual Checklist

The checklist is `ui-spec.md` §13 and is the acceptance bar for the VIS
rows. It is not duplicated here. Its completed form is recorded in
`docs/lab-03/visual-checklist-results.md` when the screens exist.

## 5. Test Commands

The commands the final results in §6 were produced with. Setup (creating,
migrating, and seeding the databases, and starting the server and the
client for Playwright) is in the README under "Running Tests".

```bash
# Server: unit, API, security, migration, seed, and Lab 1 and Lab 2 regression
cd server && npm run build     # type check
cd server && npm test

# Client: lint, type check, UI component tests
cd client && npm run lint
cd client && npm run build
cd client && npm test

# Playwright: E2E, visual, responsive (running client and server, seeded
# database whose name ends in _e2e)
npm run typecheck              # type check of the specs
npx playwright test e2e/lab-03
npx playwright test e2e/lab-02
```

## 6. Final Results

Recorded on 2026-10-03 for the final code of Sprint 3: `lab3-staging` at
`1608cc2` (every Sprint 3 Issue from #45 to #55 merged) plus the pull
request of Issue #56. Besides documentation, that pull request carries
three small fixes made while it was validated: an empty `UPLOAD_DIR` now
falls back to `server/uploads` (as `server/.env.example` leaves it
empty), and two Resolve dialog focus fixes in `client/src/` (ui-spec.md
§12), each with a regression test.

Two runs, both passing:

- **CI** on the pull request's code at `e302fe5`
  ([run](https://github.com/phittayanan/toktickit/actions/runs/37079377976)):
  the counts below.
- **Local**, earlier the same day on the code at `1608cc2`, on Node 26.8.1,
  PostgreSQL 16.15, and Playwright 1.62.1 with Chromium, against
  databases created for the run: the same results, less the two
  regression tests added afterwards (728 server and 355 client tests),
  with the Playwright suites run separately (Lab 3: 166 passed; Lab 2: 12
  passed).

| Suite | Command | Result |
|---|---|---|
| Server type check | `npm run build` | No errors |
| Server tests | `npm test` | 28 files, 729 tests: 729 passed, 0 failed, 0 skipped |
| Client lint | `npm run lint` | 0 errors, 2 warnings |
| Client type check and build | `npm run build` | No errors |
| Client tests | `npm test` | 11 files, 356 tests: 356 passed, 0 failed, 0 skipped |
| E2E spec type check | `npm run typecheck` | No errors |
| Playwright, Lab 3 and Lab 2 | `npx playwright test` | 16 files, 178 tests: 178 passed, 0 failed (Lab 3: 11 files, 166 tests; Lab 2: 5 files, 12 tests) |

No test in any suite is skipped. MIG-04, which was skipped until the
Administrator initial-password endpoint existed, ran and passed.

A row of §2 is Pass because every test in its named file passed with none
skipped; the test or group for each row carries the row's Test ID in the
file. REG-01, REG-02, REG-08, and REG-09 are whole suites.

Server tests by folder:

| Folder | Files | Tests | Passed |
|---|---|---|---|
| `server/tests/lab-01` | 2 | 2 | 2 |
| `server/tests/lab-02` | 8 | 44 | 44 |
| `server/tests/lab-03` | 18 | 683 | 683 |

Server tests in `server/tests/lab-03` by file:

| File | Tests | §2 rows |
|---|---|---|
| `password-policy.unit.test.ts` | 12 | UNIT-01 |
| `status-transitions.unit.test.ts` | 68 | UNIT-02 |
| `initial-password.unit.test.ts` | 4 | UNIT-03 |
| `login-throttle.unit.test.ts` | 4 | UNIT-04 |
| `staff-queue-query.unit.test.ts` | 73 | UNIT-05 |
| `auth.api.test.ts` | 63 | API-01 to API-12 |
| `authorization.api.test.ts` | 158 | API-13 to API-20 |
| `staff-queue.api.test.ts` | 91 | API-21 to API-26 |
| `staff-ticket-detail.api.test.ts` | 62 | API-27 to API-37 |
| `comments-notes.api.test.ts` | 17 | API-38 to API-45 |
| `users-admin.api.test.ts` | 93 | API-46 to API-54 |
| `migration.test.ts` | 6 | MIG-01 to MIG-05 |
| `seed.test.ts` | 8 | MIG-06, MIG-07 |
| `requester-regression.api.test.ts` | 12 | REG-03 to REG-07 |
| `clock.unit.test.ts` | 3 | Supports UNIT-04 and API-10 (the injectable clock of §1) |
| `endpoints.unit.test.ts` | 5 | Supports API-13 to API-15 (the endpoint table of §1) |
| `sign-in-helper.api.test.ts` | 3 | Supports the API rows (the shared sign-in helper of §1) |
| `upload-dir.unit.test.ts` | 1 | Regression: an empty `UPLOAD_DIR` falls back to `server/uploads` |

Client tests by file:

| File | Tests | §2 rows |
|---|---|---|
| `Login.test.tsx` | 22 | UI-01 to UI-03 |
| `ChangePassword.test.tsx` | 32 | UI-04 to UI-06 |
| `AppShell.test.tsx` | 35 | UI-07 to UI-09 |
| `RequesterTicketDetail.test.tsx` | 56 | UI-10 to UI-14, REG-08 |
| `StaffTicketQueue.test.tsx` | 75 | UI-15 to UI-18 |
| `StaffTicketDetail.test.tsx` | 36 | UI-19 to UI-25 |
| `UserManagement.test.tsx` | 63 | UI-26 to UI-31 |
| `badges.test.tsx` | 19 | UI-32 |
| `CreateTicket.test.tsx` | 7 | REG-08 |
| `MyTickets.test.tsx` | 8 | REG-08 |
| `App.test.tsx` | 3 | Supports REG-08 (Requester shell and navigation between My Tickets and Create Ticket) |

Playwright tests by file:

| File | Tests | §2 rows |
|---|---|---|
| `e2e/lab-03/authentication.spec.ts` | 8 | E2E-01 to E2E-04 |
| `e2e/lab-03/staff-ticket-flow.spec.ts` | 6 | E2E-05 to E2E-08 |
| `e2e/lab-03/user-administration.spec.ts` | 6 | E2E-09 to E2E-12 |
| `e2e/lab-03/accessibility.spec.ts` | 7 | E2E-13 |
| `e2e/lab-03/safe-failure.spec.ts` | 6 | E2E-14 |
| `e2e/lab-03/visual-authentication.spec.ts` | 23 | VIS-01 |
| `e2e/lab-03/visual-requester-ticket-detail.spec.ts` | 16 | VIS-02 |
| `e2e/lab-03/visual-staff-queue.spec.ts` | 21 | VIS-03 |
| `e2e/lab-03/visual-staff-ticket-detail.spec.ts` | 17 | VIS-04 |
| `e2e/lab-03/visual-user-management.spec.ts` | 25 | VIS-05 |
| `e2e/lab-03/responsive.spec.ts` | 31 | VIS-06 |
| `e2e/lab-02/*.spec.ts` (5 files) | 12 | REG-09 |

The two lint warnings are `react(set-state-in-effect)` in
`client/src/MyTickets.tsx` and `client/src/RequesterTicketDetail.tsx`.
Lint reports no error and exits successfully.

## 7. Known Limitations or Deferred Tests

- The 8-hour idle expiry and the 15-minute throttle are tested by moving
  an injected clock, not by waiting.
- Timing equality between an unknown email and a wrong password (BR-10) is
  asserted structurally, by checking that a hash comparison runs in both
  cases, not by measuring response time, which would be flaky.
- BR-41 has no concurrency test for two Administrators demoting each other
  at the same moment. API-53 covers the sequential case; the check runs
  inside the same transaction as the update.
- Visual rows are judged by a person against the checklist; screenshots
  are evidence, not pixel-compared baselines. A Playwright run writes the
  screenshots again: in the final run 63 of the 100 files under
  `artifacts/lab-03/screenshots/` came out different from the committed
  ones, and the 37 unchanged ones are mostly static states. The run's
  images were discarded; the committed files are the ones judged in
  `visual-checklist-results.md`.
- The screenshots under `artifacts/lab-02/screenshots/` are Lab 2's
  evidence and show the application as it was in Lab 2. They were not
  taken again in Lab 3. The Lab 2 visual specs still run and pass
  (REG-09), now against the Lab 3 application, so a run writes images
  there that differ from the committed ones (all 10 in the final run,
  also discarded).
- No required test is skipped or deferred.
