# RequesterUser as a temporary authentication substitute

Status: retired in Lab 3 by [ADR-0007](./0007-server-side-session-authentication.md)
(real login) and [ADR-0008](./0008-requesteruser-to-user-migration.md)
(`RequesterUser` becomes `User`).

Lab 2 needs a per-request identity to scope Tickets/Attachments before real
auth exists (Lab 3). We introduce a `RequesterUser` model and a Development
Requester Selector that assigns the chosen identity client-side
(`localStorage`), explicitly non-authentication (§4.2). Hard to reverse —
every Ticket/Attachment carries `requesterId` from day one; surprising
without context; real trade-off (throwaway mechanism now vs. blocking Lab 2
on Lab 3's real auth).

## Considered Options

- Context-only selection (lost on refresh) — rejected, bad UX for repeated
  manual testing.
- Minimal real auth now — rejected, explicitly excluded by §4.2.
