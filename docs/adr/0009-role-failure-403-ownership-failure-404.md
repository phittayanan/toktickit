# Role failures return 403; ownership failures still return 404

Status: accepted. Extends
[ADR-0004](./0004-ownership-missing-resource-404.md), which said to revisit
its 404 once real authorization existed.

With an authenticated session the backend can now make a "known identity,
not permitted" judgment, so Lab 3 uses both statuses, for different
questions:

- **Is this role allowed to call this endpoint at all?** No → `403`. The
  answer depends only on the caller's role and the route, so it reveals
  nothing about any resource. The role check runs before any resource is
  looked up or any input is validated.
- **Does this resource exist for this caller?** No → `404`, with an
  identical body whether the Ticket, Attachment, or Public Comment list is
  missing or belongs to another Requester. ADR-0004's reasoning is kept:
  a `403` here would confirm the resource exists.

So a Requester asking for Internal Notes gets `403` for every ticket id,
owned, foreign, or nonexistent, and a Requester asking for another
Requester's Ticket gets `404`.

Order of checks on every protected endpoint:

1. No valid session → `401`.
2. Password change still required → `403` `PASSWORD_CHANGE_REQUIRED`.
3. Role not permitted for the endpoint → `403` `FORBIDDEN`.
4. Resource missing or not owned → `404`.

Surprising without context: two different "you may not" statuses, and a
reader could "fix" the 404 into a 403.

## Considered Options

- `403` for another Requester's resource — rejected: leaks existence
  (labsheet §6.2).
- `404` for role failures as well — rejected: the client cannot tell
  "wrong address" from "not your role", so it cannot show a Forbidden
  state, and the labsheet asks for forbidden and missing to be
  distinguished.
