# Public Comments and Internal Notes live in separate tables

Status: accepted.

Public Comments and Internal Notes have the same columns (ticket, author,
body, created time), which suggests one table with a visibility column.
They are stored as two tables, `PublicComment` and `InternalNote`, read
and written through two separate services and two separate route groups.

The rule that matters is that an Internal Note never reaches a Requester.
With one table, that rule is a `WHERE visibility = 'PUBLIC'` that every
query, present and future, must remember. With two tables a Requester-side
query cannot return a note, because no Requester-reachable code path reads
the `InternalNote` table at all. The protection is structural rather than a
filter.

Hard to reverse once rows exist in both tables. Real trade-off: two nearly
identical models and no single query for a merged timeline, in exchange
for removing a whole class of leak.

## Consequences

- No endpoint returns comments and notes together. The IT Staff Ticket
  Detail screen loads them separately and shows them in separate tabs.
- Both tables are append-only: there is no update or delete route.

## Considered Options

- One `TicketEntry` table with a `visibility` enum — rejected per the
  reasoning above.
- A boolean `isInternal` on one table — rejected for the same reason, and
  a default value would decide the visibility of a row inserted carelessly.
