# Ticket Number generation

Keeps the `TKT-YYYY-NNNNNN` shape from Figure 1 (YYYY + a per-year 6-digit
sequence, backend-generated per BR-01). Uniqueness under concurrent
creation is guaranteed by a `TicketCounter` table (one row per calendar
year), incremented via a single atomic **upsert** inside the same
transaction as the Ticket insert:

```sql
INSERT INTO "TicketCounter" (year, "lastNumber") VALUES ($year, 1)
ON CONFLICT (year) DO UPDATE SET "lastNumber" = "TicketCounter"."lastNumber" + 1
RETURNING "lastNumber"
```

A plain `UPDATE` was considered and rejected: it returns zero rows when no
counter row exists yet for the year (e.g. the very first Ticket of a new
year), which would fail Ticket creation entirely on every January 1st. The
upsert form always succeeds, whether the year's row already exists or not,
and stays race-free under concurrency via Postgres's `ON CONFLICT` row
lock.

YYYY and the yearly-reset boundary are computed in **Asia/Bangkok (ICT,
UTC+7)**, not server/UTC time, matching KMUTT's locale.

## Considered Options

- Native Postgres `SEQUENCE` — rejected, Prisma has no first-class support;
  needs raw SQL plus annual provisioning.
- Optimistic MAX+1 with retry-on-conflict — rejected, real (if rare)
  contention risk for no benefit over an upserted counter row.
