# Requester identity transport

Status: accepted.

Three options were on the table for how the current Requester's identity
reaches the backend on every request:

1. **Body field** (`requesterId`, per the labsheet's own partial example
   §6.2) — simplest for POST/PUT, but GET endpoints (ticket list, ticket
   detail, attachment download) have no body and would need a second
   mechanism anyway.
2. **Custom header** (`X-Requester-Id`) — one place to read identity from
   regardless of method; closest in shape to Lab 3's future `Authorization`
   header.
3. **Path prefix** (e.g. `/api/requesters/:requesterId/tickets`) —
   self-documents ownership in the route, but nested resources get awkward
   3-level paths, and the route param can disagree with a future session
   once real auth exists.

**Decision: `X-Requester-Id` header**, sent by the client on every API
request. Chosen because it's the only option that works uniformly across
both mutating (POST/PUT/DELETE) and read (GET) endpoints without a second
mechanism, and because it's the smallest diff to swap out in Lab 3 — real
auth will also arrive as a header (`Authorization`), so the request-reading
code on every route changes shape once, not per-endpoint.

## Consequences

- Every route handler reads the Requester context from
  `req.headers['x-requester-id']` (validated as a positive integer,
  resolved against active `RequesterUser`s) rather than from the request
  body or route params — including the paginated ticket-list and Ticket
  Detail/Attachment endpoints, which have no body to carry it in otherwise.
- `api-spec.md`'s request contract for every endpoint documents this header
  as required, plus the `400`/`404` behavior when it's missing, malformed,
  or doesn't match an active Requester.
- The labsheet's own partial example (`{ "requesterId": 1, ... }` in the
  Create Ticket body, §6.2) is illustrative only and is **not** followed
  literally — `requesterId` is not repeated in the body once it's carried
  by the header.
