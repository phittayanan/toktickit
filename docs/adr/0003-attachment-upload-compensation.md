# Attachment upload compensation strategy

§4.5 already fixes the *direction* (Ticket first, attachments after) — this
ADR fixes what happens on partial failure, plus how the 5-active-attachment
limit stays correct under it.

Attachments chosen on the Create Ticket form upload **automatically** and
**sequentially** — the client awaits each upload's response before firing
the next, not in parallel — as follow-up requests right after the Ticket
POST succeeds; one flow from the Requester's view, not a separate manual
step.

The 5-active-attachment limit is enforced **server-side, inside each
individual upload request**: the handler counts the Ticket's current active
Attachments and rejects (`400`/limit error) if accepting this file would
exceed 5, *before* persisting it. Sequential execution matters for this
check to be correct: if uploads were fired in parallel, several concurrent
requests could all read the same pre-upload count, all pass the "≤5" check,
and all commit — overshooting the limit. Firing them one at a time means
each request's count check reflects every prior upload's outcome in the
same batch.

A per-file failure does not roll back the Ticket or other already-
successful uploads; the confirmation view shows a partial-success state
(e.g. "Ticket TKT-2026-000123 created. 1 of 2 attachments uploaded — retry
the failed file"), with a retry action reusing the same upload endpoint.

## Considered Options

- Fully manual re-add via Ticket Detail — rejected, worse UX for the common
  one-file-failed case.
- Parallel upload — rejected, breaks the 5-active-limit check under
  concurrency (see above).
