# Ownership and missing-resource failures both return 404

Status: accepted, and kept in Lab 3. Extended by
[ADR-0009](./0009-role-failure-403-ownership-failure-404.md), which adds
`403` for role failures only.

RequesterUser is not real authentication (§4.2) — the backend has no
authenticated session to base an authorization judgment on, so 403 (which
asserts "known identity, forbidden") isn't a decision Lab 2 can make. We
return 404 for both "Ticket doesn't exist" and "Ticket belongs to a
different Requester."

Per §6.3, `api-spec.md` documents ownership-failure and missing-resource as
one merged scenario row per endpoint (e.g. GET /api/tickets/:id's
"Missing or not-owned `404`"), deliberately sharing the same status/body
shape rather than being distinguishable — that indistinguishability is the
point (§4.4). `tests.md` still verifies both cases separately at the test
level (e.g. API-18 for not-owned, API-19 for missing), traced to the same
Acceptance Criterion (AC-03), since the criterion is exactly "both cases
produce the same outcome."

Depends on [ADR-0001](./0001-requesteruser-temporary-auth.md).

## Considered Options

- 403 for ownership + 404 for missing — rejected per the reasoning above;
  revisit in Lab 3 once real authorization exists.
