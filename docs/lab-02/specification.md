# Lab 2 Sprint Engineering Specification

## 1. Sprint Goal

Deliver the Requester-facing side of TokTickIT: a Requester can pick a
temporary Development Requester identity, submit an IT support Ticket with
supporting Attachments and receive an official Ticket Number, find that
Ticket again in a searchable/filterable/sortable/paginated My Tickets list,
open its read-only Ticket Detail, and manage (add, download, soft-remove)
its Attachments — all scoped so one Requester can never see or touch
another Requester's data.

## 2. Stakeholder Request Interpretation

IT wants a professional Requester-facing ticketing flow before real login
exists. A Requester must be able to describe a problem (Category, Related
System, Requested Priority, Summary, Description), attach evidence, submit,
and get back a Ticket Number. Afterward they must be able to find that
Ticket among their others, inspect it, and manage its Attachments — without
ever seeing another Requester's data. Because authentication is Lab 3 work,
a Development Requester Selector stands in as a "login screen" purely for
testing: it lets a Requester (i.e. the student, wearing that hat) choose
which seeded identity to act as for the session, and that choice is not to
be treated as, or later mistaken for, real authentication.

## 3. Scope

### Included

- Development Requester Selector: list active `RequesterUser`s, select one,
  persist the selection, display it, allow switching it.
- Create Ticket: capture Category, Related System, Requested Priority,
  Summary, Description; validate; create the Ticket; generate its Ticket
  Number; attach files.
- Ticket Number generation, unique and correct under concurrency.
- Attachment upload (creation-time and from Ticket Detail), the 5-active
  file / 5 MB / JPG-PNG-WEBP-PDF constraints, and soft removal with a
  required reason.
- My Tickets: list, search, filter, sort, paginate — scoped to the
  selected Requester's own Tickets only.
- Ticket Detail (Requester, read-only): full Ticket fields plus Attachment
  management.
- Ownership protection: a Requester can never read or mutate a Ticket or
  Attachment that isn't theirs, whether by UI navigation or direct
  URL/ID access.
- The Zen Green UI theme and its reusable component/state/responsive rules,
  applied consistently across all four screens.

### Excluded

- Real authentication, sessions, passwords, tokens, or role-based
  authorization (Lab 3). The Development Requester Selector is a testing
  mechanism only.
- IT Staff dashboard/queue, ticket claiming or reassignment, changing IT
  Priority.
- Public Comments, Internal Notes, Actions Taken.
- Any Current Status transition beyond a Ticket's initial `New` value.
- Administration of users, Requesters, roles, or reference data.
- Server-side idempotency/duplicate-submission protection beyond a
  disabled/busy Submit button.
- Cloud or database-blob storage for Attachments (local disk only).

## 4. Functional Requirements

- **FR-01** The system shall let a Requester select one active
  `RequesterUser` from a list before any Ticket screen becomes usable.
- **FR-02** The system shall persist the selected Requester across a page
  refresh and expose a "Change Requester" action from every screen.
- **FR-03** The system shall send the selected Requester's identity as an
  `X-Requester-Id` header on every API request from the client.
- **FR-04** The system shall let a Requester submit a Create Ticket form
  with Category, Related System, Requested Priority, Summary, and
  Description, validated on both client and server.
- **FR-05** The system shall create the Ticket with Current Status `New`
  and generate a unique, backend-assigned Ticket Number in
  `TKT-YYYY-NNNNNN` form.
- **FR-06** The system shall let a Requester attach files to a Ticket at
  creation time (automatic, sequential upload after the Ticket is created)
  and from Ticket Detail (manual add), subject to the fixed Attachment
  Rules (§4.5 of the labsheet).
- **FR-07** The system shall reject an Attachment upload that would exceed
  five active Attachments on a Ticket, that has an unsupported MIME type,
  or that exceeds 5 MB, without accepting a partial/corrupt file.
- **FR-08** The system shall not roll back the Ticket or any prior
  successful Attachment upload when a later Attachment upload in the same
  batch fails, and shall expose a way to retry the failed file.
- **FR-09** The system shall let a Requester list only their own Tickets,
  paginated, and shall support search (by Ticket Number or Summary),
  filtering (Category, Requested Priority, IT Priority, Current Status),
  and sorting.
- **FR-10** The system shall let a Requester open one of their own
  Tickets' full read-only detail, including its active Attachments.
- **FR-11** The system shall return the same not-found response for a
  Ticket/Attachment that doesn't exist and one that belongs to a different
  Requester, so ownership cannot be probed.
- **FR-12** The system shall let a Requester download an active Attachment
  they own, and shall refuse to serve a soft-removed Attachment's file
  content while still showing its metadata (filename, size, removed-at,
  reason) as removed.
- **FR-13** The system shall let a Requester soft-remove one of their own
  active Attachments by supplying a required removal reason, after which
  it no longer counts toward the 5-active-attachment limit or appears in
  the active Attachment list.
- **FR-14** The system shall present the entire Requester-facing surface
  (all four screens) in a single consistent Zen Green theme, usable at
  desktop, tablet, and mobile viewport widths without clipping, overlap,
  or horizontal page scroll.

## 5. Business Rules

- **BR-01** The official Ticket Number is generated by the backend and
  must be unique.
- **BR-02** A new Ticket begins with Current Status `New`.
- **BR-03** Lab 2 uses a Development Requester selector instead of login.
  The selected identity is for testing only and is not authentication.
- **BR-04** Ticket Number format is `TKT-YYYY-NNNNNN`: `YYYY` is the
  4-digit calendar year computed in Asia/Bangkok (ICT, UTC+7) at creation
  time; `NNNNNN` is a 6-digit, zero-padded, per-year sequence starting at
  `000001`.
- **BR-05** The per-year Ticket Number sequence is maintained by a single
  `TicketCounter` row per year, incremented via an atomic upsert
  (`INSERT ... ON CONFLICT (year) DO UPDATE ... RETURNING`) in the same
  transaction as the Ticket insert, so concurrent creation in the same
  year never collides or skips a number, and the first Ticket of a new
  year never fails for lack of a pre-existing counter row.
- **BR-06** `requesterId` is never accepted from the client request body;
  every route derives the acting Requester from the validated
  `X-Requester-Id` header (ADR-0006).
- **BR-07** A missing, non-numeric, or unresolvable (no matching active
  `RequesterUser`) `X-Requester-Id` header is rejected `400` on any route
  that requires it.
- **BR-08** Ticket Summary is required, trimmed, 5–150 characters.
- **BR-09** Ticket Description is required, trimmed, 10–5000 characters.
- **BR-10** Category, Related System, and Requester options presented to
  the client are always the currently active rows from the database — an
  inactive row is excluded from every selector and rejected `400` if
  submitted anyway.
- **BR-11** Requested Priority is required and must be one of a fixed enum
  (`LOW`, `MEDIUM`, `HIGH`).
- **BR-12** IT Priority is nullable at creation (unset until Lab 3/IT-Staff
  functionality exists) and is never settable by the Requester.
- **BR-13** Allowed Attachment MIME types are JPEG, PNG, WEBP, and PDF
  only; any other type is rejected `400` before the file is stored.
- **BR-14** Maximum Attachment size is 5 MB per file; an oversized file is
  rejected `400` before being stored.
- **BR-15** Maximum five **active** (non-soft-removed) Attachments per
  Ticket; the count check happens server-side, per individual upload
  request, counting the Ticket's currently active Attachments before
  persisting the new one.
- **BR-16** Attachment uploads triggered from the Create Ticket flow fire
  sequentially (client awaits each response before sending the next), not
  in parallel — this is required for BR-15's per-request count check to
  stay correct under concurrency; parallel uploads could let several
  requests read the same pre-upload count and all pass.
- **BR-17** A failed individual Attachment upload does not roll back the
  Ticket or any other Attachment already uploaded in the same batch; the
  Requester is shown a partial-success state and a retry action scoped to
  the failed file(s), reusing the same upload endpoint.
- **BR-18** Attachment soft removal is represented by nullable
  `removedAt`/`removedByRequesterId`/`removalReason` fields, never a
  boolean flag or status enum; `removedAt IS NULL` means active.
- **BR-19** `removalReason` is required (non-empty, trimmed, 5–500
  characters) whenever an Attachment is soft-removed. It is validated at
  the API layer (primary gate, `400` before any write) and backed by a
  Postgres `CHECK ("removedAt" IS NULL OR "removalReason" IS NOT NULL)`
  constraint (defense-in-depth).
- **BR-20** A soft-removed Attachment's file content is never served for
  download or preview; its metadata (original filename, size, removed-at,
  removed-by, reason) remains visible as "removed."
- **BR-21** A Ticket or Attachment lookup that resolves to a row owned by
  a Requester other than the one in `X-Requester-Id`, or that doesn't
  exist at all, returns `404` with an identical body in both cases —
  RequesterUser is not real authentication, so there is no
  authenticated-but-forbidden (`403`) judgment available to make.
- **BR-22** The My Tickets list only ever returns Tickets owned by the
  requesting Requester; search/filter/sort/pagination parameters narrow
  that set further, they never widen it to other Requesters' Tickets.
- **BR-23** An inactive `RequesterUser` does not appear in the Development
  Requester Selector and cannot be the acting identity behind
  `X-Requester-Id` (an inactive-but-existing id is treated the same as an
  unresolvable one — `400`).

## 6. UI Specification Summary

See `ui-spec.md` for the full Zen Green UI specification. Summary of what
it must cover for this sprint: application shell and active-page
navigation; the Development Requester Selection screen (§8.1 of the
labsheet); Create Ticket in create mode (§8.2–8.3); My Tickets list layout,
including search/filter/sort/pagination controls and the desktop
table/mobile card representation (§8.4); Requester Ticket Detail in view
mode plus Attachment states (§8.5); the required screen modes and feedback
states — loading, empty, no-results, validation, submitting, success,
failure (§8.6); and the responsive rules for desktop/tablet/mobile (§8.7).

## 7. Data Changes

New Prisma models (`server/prisma/schema.prisma`):

- **`RequesterUser`**: `id` (PK), `name`, `email` (unique), `isActive`
  (default `true`), `createdAt`. The temporary Lab 2 identity (ADR-0001).
- **`RelatedSystem`**: `id` (PK), `name` (unique), `isActive` (default
  `true`), `createdAt`.
- **`Ticket`**: `id` (PK), `ticketNumber` (unique, `TKT-YYYY-NNNNNN`),
  `requesterId` (FK → `RequesterUser`), `categoryId` (FK → `Category`),
  `relatedSystemId` (FK → `RelatedSystem`), `summary`, `description`,
  `requestedPriority` (enum `LOW`/`MEDIUM`/`HIGH`), `itPriority` (same
  enum, nullable), `currentStatus` (enum, default `NEW`), `createdAt`,
  `updatedAt`.
- **`Attachment`**: `id` (PK), `ticketId` (FK → `Ticket`),
  `uploadedByRequesterId` (FK → `RequesterUser`), `originalFilename`,
  `storedFilename` (unique, `<uuid>.<ext>`), `mimeType`, `sizeBytes`,
  `createdAt`, `removedAt` (nullable), `removedByRequesterId` (FK →
  `RequesterUser`, nullable), `removalReason` (nullable, `CHECK
  (removedAt IS NULL OR removalReason IS NOT NULL)`).
- **`TicketCounter`**: `year` (PK, int), `lastNumber` (int, default 0).
- **`Category`**: additive migration adds `isActive` (default `true`) — it
  didn't have one from Lab 1.

Indexes/constraints: `Ticket.ticketNumber` unique; `Ticket.requesterId`
indexed (My Tickets is always filtered by it); `Attachment.ticketId`
indexed; `RequesterUser.email` unique; `RelatedSystem.name` unique. Soft
removal on `Attachment` is the nullable-timestamp pattern (BR-18), matching
the existing `createdAt`/`updatedAt` convention rather than a boolean or
enum. The selected Requester is associated with a Ticket via
`Ticket.requesterId`, set from the validated `X-Requester-Id` header at
creation time — never from the request body (BR-06). Schema evolution note
for Lab 3: `RequesterUser` is expected to be superseded by (or linked to) a
real authenticated user/session model; `Ticket.requesterId` and
`Attachment.uploadedByRequesterId`/`removedByRequesterId` are designed to
repoint at that model without a shape change.

## 8. API Contract

See `api-spec.md` for full endpoint-by-endpoint detail. Summary: every
route requires `X-Requester-Id` (BR-06/BR-07); the paginated ticket-list
endpoint responds `{ data, meta }`, every other endpoint responds a flat
array/object (matching Lab 1's existing `GET /api/categories` shape);
errors are uniformly `{ error: string }`.

## 9. Acceptance Criteria

- **AC-01** Given valid Ticket data, when the Requester submits the form,
  then one Ticket is saved and the official Ticket Number is displayed.
- **AC-02** Given no Development Requester is selected, when the user
  attempts to open My Tickets or Create Ticket, then the Requester
  Selection screen is shown instead.
- **AC-03** Given Requester B is selected, when a Ticket belonging to
  Requester A is requested directly by id (Ticket Detail, or an
  Attachment under it), then the Ticket/Attachment data is not returned
  (`404`). (For the list endpoint, the equivalent guarantee is BR-22/
  AC-19: Requester A's Tickets never appear in Requester B's list at
  all — no 404 involved, since a list has nothing owned to 404 on.)
- **AC-04** Given the Requester Selector is loading its active-Requester
  list, when the fetch has not yet resolved, then a loading state is
  shown and no Continue action is available.
- **AC-05** Given no active `RequesterUser`s exist, when the Requester
  Selector loads, then an empty state is shown explaining that no Requester
  is available.
- **AC-06** Given the active-Requester fetch fails, when the Requester
  Selector loads, then a safe failure state is shown (no crash, no partial
  UI).
- **AC-07** Given a Requester has been selected, when the page is
  refreshed, then the same Requester remains selected without re-picking.
- **AC-08** Given a Requester is selected, when any subsequent API request
  is sent, then it carries `X-Requester-Id` for that Requester.
- **AC-09** Given the Create Ticket form is submitted with a missing
  required field, when validation runs client-side, then a field-level
  message appears next to that field and the API is not called.
- **AC-10** Given a request to `POST /api/tickets` with an invalid payload
  bypassing client validation, when the server validates it, then it is
  rejected `400` with a field-specific error — independent proof the rule
  isn't only enforced in the browser.
- **AC-11** Given a valid Create Ticket submission, when the Submit button
  is clicked twice quickly, then only one Ticket is created (button is
  busy/disabled during the request).
- **AC-12** Given a Create Ticket submission fails (e.g. server error),
  when the failure state renders, then the Requester's entered field
  values remain in the form.
- **AC-13** Given a Ticket is created twice in the same Asia/Bangkok
  calendar year, when both Ticket Numbers are compared, then they are
  distinct and sequential (`...000001`, `...000002`).
- **AC-14** Given two Ticket-creation requests fire concurrently in the
  same year, when both complete, then both received Ticket Numbers are
  unique (no collision, no skip).
- **AC-15** Given a Requester selects a JPEG/PNG/WEBP/PDF file under 5 MB
  as an Attachment, when it uploads, then it appears as an active
  Attachment on the Ticket.
- **AC-16** Given a Requester selects an unsupported file type or a file
  over 5 MB, when they attempt to add it, then it is rejected with a clear
  message before/at upload and is not stored.
- **AC-17** Given a Ticket already has five active Attachments, when a
  sixth upload is attempted, then it is rejected `400` and the Ticket
  still has exactly five active Attachments.
- **AC-18** Given a Ticket is created with two Attachments and the first
  upload fails while the second succeeds, when the confirmation view
  renders, then it shows a partial-success message ("1 of 2 uploaded")
  with a retry action for the failed file, and the Ticket itself still
  exists.
- **AC-19** Given a Requester has multiple Tickets, when they open My
  Tickets, then only their own Tickets are listed, newest-updated first by
  default.
- **AC-20** Given a Requester searches My Tickets by a Ticket Number
  substring or Summary keyword, when the search runs, then only matching
  owned Tickets are shown.
- **AC-21** Given a Requester applies a Category/Priority/Status filter,
  when the list re-renders, then only owned Tickets matching every active
  filter are shown, and a "no results" state (distinct from "no Tickets at
  all") is shown when nothing matches.
- **AC-22** Given a Requester changes the sort column/direction, when the
  list re-renders, then the order reflects that choice.
- **AC-23** Given a Requester has more Tickets than one page, when they
  page forward/back, then the correct page's rows are shown and the page
  indicator reflects it.
- **AC-24** Given a Requester has never created a Ticket, when they open
  My Tickets, then an empty state (not a "no results" state) is shown.
- **AC-25** Given a Requester opens one of their own Tickets, when Ticket
  Detail renders, then all core fields (Requester, Category, Related
  System, Requested/IT Priority, Current Status, Summary, Description) are
  shown read-only.
- **AC-26** Given a Requester's own Ticket has active Attachments, when
  Ticket Detail renders, then each is listed with a working download
  action.
- **AC-27** Given a Requester adds a new Attachment from Ticket Detail,
  when it succeeds, then it appears in the active Attachment list
  immediately (subject to the same type/size/count rules as creation-time
  upload).
- **AC-28** Given a Requester soft-removes an active Attachment without
  supplying a reason, when they submit, then it is rejected `400` (client
  and server) and the Attachment remains active.
- **AC-29** Given a Requester soft-removes an active Attachment with a
  valid reason, when it succeeds, then it disappears from the active
  Attachment list/count and its metadata shows as removed; its file is no
  longer downloadable.
- **AC-30** Given a Requester attempts to download a soft-removed
  Attachment directly by id, when the request is made, then it is
  rejected (not served as a file).
- **AC-31** Given the app is viewed at desktop (≥ 992px), tablet
  (768–991px), and mobile (< 768px) widths, when each of Create Ticket, My
  Tickets, and Ticket Detail is inspected, then no label is clipped, no
  control overlaps another, and no horizontal page scroll occurs.
- **AC-32** Given a sighted keyboard-only user, when they tab through
  Create Ticket, My Tickets, and Ticket Detail, then every control
  (including icon-only ones) is reachable, has a visible focus indicator,
  and has an accessible label.

## 10. Definition of Done

Covered by both parts of `tests.md` §6 (Final Results) and the labsheet's
Definition of Done (§13). In summary, this sprint is done when:

- Every FR/BR above is implemented and every AC above passes, with
  traceable automated-test evidence (`tests.md` §3).
- No required test is skipped, disabled, commented out, or unrelated to
  its AC.
- The implemented screens and API conform to this specification,
  `api-spec.md`, and `ui-spec.md` — no undocumented deviation.
- Success, failure, and boundary cases (validation, ownership,
  attachment-limit, empty/no-results, concurrent Ticket-Number creation)
  are all covered by passing tests, not just the happy path.
- The full automated test suite (unit, API, UI component, responsive/
  visual, E2E) passes from a documented command on the final `main`
  branch.
- README setup/test instructions are current for the Lab 2 increment.
- Each Issue (#15–#24) has moved through the Backlog → Specified → Started
  → PR Review → Fixing → Done Kanban flow via a peer-reviewed PR into
  `lab2-staging`, followed by one release PR from `lab2-staging` to `main`.

## 11. Assumptions and Decisions

- **Requester identity transport is `X-Requester-Id`** (ADR-0006,
  finalized after issue #14 flagged it open) — every route reads the
  acting Requester from this header, never from the request body or route
  params. This was the blocking decision for finalizing `api-spec.md` and
  is treated as settled for this sprint.
- **`requesterId` is never accepted in a request body**, even though the
  labsheet's own partial example (§6.2) shows one — that example is
  illustrative only per ADR-0006's consequences.
- **Ownership and missing-resource failures share one `404`** rather than
  splitting into `403`/`404` (ADR-0004) — there is no authenticated
  session in Lab 2 to base a `403` judgment on.
- **Ticket Number generation uses an atomic upserted counter row**, not a
  native Postgres `SEQUENCE` or optimistic MAX+1 retry (ADR-0002) — Prisma
  has no first-class sequence support, and MAX+1 retry carries real (if
  rare) contention risk for no benefit over the upsert.
- **Attachment soft removal uses nullable timestamp+reason fields**, not a
  boolean or enum (ADR-0005) — a boolean and timestamp could disagree, and
  Lab 2 only ever has two Attachment states.
- **Attachment uploads run sequentially, not in parallel**, specifically
  because the 5-active-limit check is only race-free under sequential
  execution (ADR-0003) — this is a correctness requirement, not a
  performance choice.
- **`RelatedSystem` and `Category.isActive` are new** beyond what the ADRs
  describe, needed to satisfy the labsheet's required seed data (§5.3) and
  reference-data endpoints (§6) — not separately ADR'd because they don't
  meet the ADR bar (not hard to reverse, not surprising, no real
  trade-off): they're a straightforward reference-table addition.
- **Duplicate-submission prevention is client-side only** (disabled/busy
  Submit button) — explicitly out of scope for server-side idempotency
  keys this sprint (see Out of Scope, §3).
- **Attachment storage is local disk** under the server process (not cloud
  or DB-blob), consistent with Lab 2's scope being a Requester-facing MVP
  rather than a production storage design.
