# Lab 2 Test Plan and Results

## 1. Test Strategy

A good test observes behavior through a seam (HTTP response, rendered DOM,
or a screenshot) — never an internal function call, a Prisma query shape,
or private component state.

- **API (primary seam)**: Supertest against the real Express `app`, real
  seeded test Postgres DB — same pattern as `server/tests/lab-01/
  categories.test.ts` (one `describe` per endpoint, a Test-ID comment
  above each `it`). New folder `server/tests/lab-02/`. This is the source
  of truth for every business rule (validation, Ticket Number, ownership,
  search/filter/sort/pagination, attachment upload/download/soft-removal)
  — no separate service-layer unit tests, to avoid double-covering the
  same rule at two seams.
- **Unit (narrow, two spots only)**: the `TicketCounter` upsert under
  concurrent calls (proves BR-05's uniqueness claim, which one HTTP call
  can't); zod schema boundary tests for Summary/Description length and
  enum values.
- **UI component**: Vitest + Testing Library rendering real components,
  mocking only `client/src/api.ts`'s fetch layer — same pattern as
  `client/src/App.test.tsx`. Covers RequesterSelector, CreateTicket,
  MyTickets, RequesterTicketDetail, AttachmentSection.
- **Responsive/visual**: Playwright screenshots at desktop/tablet/mobile
  breakpoints (`ui-spec.md` §11), stored under
  `artifacts/lab-02/screenshots/`, checked against `ui-spec.md` §13's
  checklist.
- **E2E**: Playwright driving the full stack (browser + real API + real
  DB) for flows no lower seam proves alone. New folder `e2e/lab-02/`.

Every Acceptance Criterion in `specification.md` §9 maps to at least one
row below.

## 2. Planned Tests

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-13, AC-14 | `TicketCounter` upsert fires 20 concurrent creates in one year | All 20 returned `lastNumber`s are unique, 1..20 | `server/tests/lab-02/ticket-counter.unit.test.ts` | Pending |
| UNIT-02 | Unit | AC-09, AC-10 | zod schema rejects Summary/Description outside 5–150/10–5000 chars | Schema `.safeParse` returns failure | `server/tests/lab-02/ticket-schema.unit.test.ts` | Pending |
| API-03 | API | — | `GET /api/categories` returns only active rows | 200; Lab 1 shape unchanged | `server/tests/lab-02/reference-data.api.test.ts` | Pending |
| API-04 | API | — | `GET /api/related-systems` returns seeded active rows | 200; ≥6 rows | `server/tests/lab-02/reference-data.api.test.ts` | Pending |
| API-05 | API | AC-05 | `GET /api/requesters` excludes the inactive seed Requester | 200; inactive id absent | `server/tests/lab-02/reference-data.api.test.ts` | Pending |
| API-06 | API | AC-01 | `POST /api/tickets` with valid body | 201; Ticket saved; `TKT-YYYY-NNNNNN` returned | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-07 | API | AC-10 | `POST /api/tickets` missing Summary | 400; `field: "summary"` | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-08 | API | — | `POST /api/tickets` with inactive `categoryId` | 400 | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-09 | API | — | `POST /api/tickets` missing `X-Requester-Id` | 400 | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-10 | API | AC-13 | Two sequential creates in the same year | Ticket Numbers `...000001`, `...000002` | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-11 | API | AC-19 | `GET /api/tickets` for Requester A returns only A's Tickets | 200; no Requester-B rows | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-12 | API | AC-20 | `GET /api/tickets?search=laptop` | 200; matches Ticket Number/Summary only | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-13 | API | AC-21 | `GET /api/tickets?categoryId=` filter, no matches | 200; `data: []`, `meta.totalItems: 0` | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-14 | API | AC-22 | `GET /api/tickets?sortBy=ticketNumber&sortDir=asc` | 200; ascending order | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-15 | API | AC-23 | `GET /api/tickets?page=2&pageSize=10` with 15 seeded Tickets | 200; 5 rows; `meta.totalPages: 2` | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-16 | API | — | `GET /api/tickets?pageSize=999` | 400; `field: "pageSize"` | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-17 | API | AC-25, AC-26 | `GET /api/tickets/:id` for an owned Ticket with an active and a removed Attachment | 200; full fields; both Attachments present with correct `removedAt`/`removalReason` | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-18 | API | AC-03 | `GET /api/tickets/:id` for another Requester's Ticket | 404; same body as missing-id case | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-19 | API | AC-03 | `GET /api/tickets/:id` for a nonexistent id | 404; identical body to API-18 | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-20 | API | AC-15 | `POST /api/tickets/:id/attachments` valid PNG under 5MB | 201; Attachment saved | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-21 | API | AC-16 | `POST /api/tickets/:id/attachments` unsupported MIME type | 400; `field: "file"` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-22 | API | AC-16 | `POST /api/tickets/:id/attachments` file over 5MB | 400; `field: "file"` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-23 | API | AC-17 | 6th upload to a Ticket already at 5 active Attachments | 400; Ticket still has 5 active | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-24 | API | — | Upload to another Requester's Ticket | 404 | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-25 | API | AC-26 | `GET /api/attachments/:id/download` for an active, owned Attachment | 200; binary stream, correct headers | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-26 | API | AC-30 | `GET /api/attachments/:id/download` for a soft-removed Attachment | 404 | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-27 | API | AC-28 | `POST /api/attachments/:id/remove` with blank `removalReason` | 400; `field: "removalReason"`; Attachment still active | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-28 | API | AC-29 | `POST /api/attachments/:id/remove` with a valid reason | 200; `removedAt` set; no longer counts toward the 5-limit | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-29 | API | — | Remove on another Requester's Attachment | 404 | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| UI-04 | UI | AC-04, AC-05, AC-06 | RequesterSelector loading/empty/failure states | Correct state rendered for each mocked `api.ts` response | `client/src/RequesterSelector.test.tsx` | Pending |
| UI-05 | UI | AC-07, AC-08 | RequesterSelector persists selection + header injection | Reload keeps selection; `api.ts` sends `X-Requester-Id` | `client/src/RequesterSelector.test.tsx` | Pending |
| UI-06 | UI | AC-09 | CreateTicket client-side validation | Field-level message; `api.ts` create not called | `client/src/CreateTicket.test.tsx` | Pending |
| UI-07 | UI | AC-11 | CreateTicket double-click on Submit | Only one call to `api.ts` create fires | `client/src/CreateTicket.test.tsx` | Pending |
| UI-08 | UI | AC-12 | CreateTicket submission failure | Failure state shown; field values retained | `client/src/CreateTicket.test.tsx` | Pending |
| UI-09 | UI | AC-01 | CreateTicket success | Ticket Number rendered in confirmation panel | `client/src/CreateTicket.test.tsx` | Pending |
| UI-10 | UI | AC-18 | CreateTicket partial attachment-upload failure | Partial-success message + retry action rendered | `client/src/CreateTicket.test.tsx` | Pending |
| UI-11 | UI | AC-19, AC-24 | MyTickets renders owned Tickets / empty state | List or empty state per mocked response | `client/src/MyTickets.test.tsx` | Pending |
| UI-12 | UI | AC-20, AC-21 | MyTickets search/filter, including no-results state | Filtered rows or no-results message rendered | `client/src/MyTickets.test.tsx` | Pending |
| UI-13 | UI | AC-22, AC-23 | MyTickets sort + pagination controls | Re-render reflects sort/page change via `api.ts` call args | `client/src/MyTickets.test.tsx` | Pending |
| UI-14 | UI | AC-25, AC-26 | RequesterTicketDetail read-only fields + Attachment list | All fields rendered read-only; download action present | `client/src/RequesterTicketDetail.test.tsx` | Pending |
| UI-15 | UI | AC-27 | RequesterTicketDetail add Attachment | New Attachment appears in active list on success | `client/src/RequesterTicketDetail.test.tsx` | Pending |
| UI-16 | UI | AC-28, AC-29 | RequesterTicketDetail remove Attachment, blank vs. valid reason | Blank rejected client-side; valid removes from active list | `client/src/RequesterTicketDetail.test.tsx` | Pending |
| VIS-01 | Visual | AC-31 | Playwright screenshots — Create Ticket at 3 breakpoints | Matches `ui-spec.md` §13 checklist, no clipping/overlap/scroll | `e2e/lab-02/visual-create-ticket.spec.ts` | Pending |
| VIS-02 | Visual | AC-31 | Playwright screenshots — My Tickets at 3 breakpoints | Same checklist | `e2e/lab-02/visual-my-tickets.spec.ts` | Pending |
| VIS-03 | Visual | AC-31 | Playwright screenshots — Ticket Detail at 3 breakpoints | Same checklist | `e2e/lab-02/visual-ticket-detail.spec.ts` | Pending |
| E2E-01 | E2E | AC-01, AC-19 | Full flow: select Requester → create Ticket with an Attachment → find it in My Tickets | Confirmation shows official number; same Ticket appears in the list | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-03, AC-19 | Requester A creates a Ticket; switch to Requester B | B's My Tickets and direct Ticket-Detail URL for A's Ticket both show none/404 | `e2e/lab-02/requester-ownership.spec.ts` | Pending |
| E2E-03 | E2E | AC-32 | Keyboard-only pass over Create Ticket, My Tickets, Ticket Detail | Every control reachable via Tab, visible focus throughout | `e2e/lab-02/requester-accessibility.spec.ts` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-06, UI-09, E2E-01 |
| AC-02 | (client routing guard — covered alongside UI-04 when RequesterSelector ticket #17 lands; see Known Limitations) |
| AC-03 | API-18, API-19, E2E-02 |
| AC-04 | UI-04 |
| AC-05 | API-05, UI-04 |
| AC-06 | UI-04 |
| AC-07 | UI-05 |
| AC-08 | UI-05 |
| AC-09 | API-07, UI-06 |
| AC-10 | API-07 |
| AC-11 | UI-07 |
| AC-12 | UI-08 |
| AC-13 | API-10, UNIT-01 |
| AC-14 | UNIT-01 |
| AC-15 | API-20 |
| AC-16 | API-21, API-22 |
| AC-17 | API-23 |
| AC-18 | UI-10 |
| AC-19 | API-11, UI-11, E2E-02 |
| AC-20 | API-12, UI-12 |
| AC-21 | API-13, UI-12 |
| AC-22 | API-14, UI-13 |
| AC-23 | API-15, UI-13 |
| AC-24 | UI-11 |
| AC-25 | API-17, UI-14 |
| AC-26 | API-17, UI-14, API-25 |
| AC-27 | UI-15 |
| AC-28 | API-27, UI-16 |
| AC-29 | API-28, UI-16 |
| AC-30 | API-26 |
| AC-31 | VIS-01, VIS-02, VIS-03 |
| AC-32 | E2E-03 |

## 4. Responsive and Visual Checklist

See `ui-spec.md` §13 — the same checklist is the acceptance bar for VIS-01
through VIS-03. It is not duplicated here to avoid drift between the two
documents; `ui-spec.md` is the source of truth for the checklist content.

## 5. Test Commands

Documented once implementation exists (tickets #16–#24); planned commands:

```bash
# Server: unit + API tests
cd server && npm test

# Client: UI component tests
cd client && npm test

# Playwright: responsive/visual + E2E (planned location: e2e/lab-02/)
npx playwright test e2e/lab-02
```

## 6. Final Results

Pending — populated once tickets #16–#24 land and the full suite runs
against the final `main` branch, per the Definition of Done
(`specification.md` §10). This section must be updated with actual
pass/fail counts and command output before Lab 2 submission; a "Pending"
row anywhere in §2 at submission time means the Definition of Done is not
yet met.

## 7. Known Limitations or Deferred Tests

- AC-02 (blocked-until-Requester-selected routing guard) is exercised as
  part of the RequesterSelector/app-shell tests once client routing exists
  (ticket #17) — it has no standalone row above because it's a
  cross-cutting guard, not a single component's behavior; it must still
  show up as a passing test by Final Results, not be silently dropped.
- No dedicated test enumerates every one of the 36 user stories in issue
  #14 individually — they are covered at the AC level (§9 of
  `specification.md`), which is the graded unit per the labsheet.
- Concurrency testing (UNIT-01) covers 20 concurrent creates as a
  practical proxy for "no collision under concurrency," not an exhaustive
  proof; this is judged sufficient evidence for BR-05 at Lab 2 scope.
