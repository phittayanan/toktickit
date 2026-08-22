# Ownership and missing-resource failures both return 404

RequesterUser is not real authentication (§4.2) — the backend has no
authenticated session to base an authorization judgment on, so 403 (which
asserts "known identity, forbidden") isn't a decision Lab 2 can make. We
return 404 for both "Ticket doesn't exist" and "Ticket belongs to a
different Requester."

Per §6.3, `api-spec.md` documents ownership-failure and missing-resource as
two distinct scenario rows (each traceable to its own AC, e.g. AC-03) that
deliberately share the same status/body shape.

Depends on [ADR-0001](./0001-requesteruser-temporary-auth.md).

## Considered Options

- 403 for ownership + 404 for missing — rejected per the reasoning above;
  revisit in Lab 3 once real authorization exists.
