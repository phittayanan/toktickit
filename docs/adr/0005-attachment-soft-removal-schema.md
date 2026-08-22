# Attachment soft-removal schema representation

The justified database-design decision §5 requires: a soft-removed
Attachment is represented by a nullable `removedAt DateTime?` (+
`removedByRequesterId Int?` and `removalReason String?`) rather than a
boolean flag or status enum — `removedAt IS NULL` = active, non-null =
removed-and-when. Chosen over a boolean because a boolean and timestamp
could disagree; over an enum because Lab 2 only has two states. Mirrors the
existing `createdAt`/`updatedAt` convention.

`removalReason` is added because Part 8 of the submission rubric (§14)
requires evidence of "soft removal **with reason**" — this corrects the
earlier interview answer that said no reason field was needed; that answer
is superseded. The column stays nullable at the DB level (consistent with
`removedAt`/`removedByRequesterId`), but enforcement of "reason is
mandatory when removing" does **not** live only in the DB schema — it's
enforced in two places, deliberately:

1. **Primary gate — API layer**: the soft-remove endpoint's zod schema
   requires `removalReason` (non-empty, trimmed, 5–500 chars) on the
   request body; missing/blank reason is rejected `400` before any DB
   write, and is the source of the user-facing validation message.
2. **Backstop — DB constraint**: a Postgres `CHECK` constraint,
   `CHECK ("removedAt" IS NULL OR "removalReason" IS NOT NULL)`, so a
   removed row can never exist without a reason even if a future code path
   bypasses the API layer (raw script, admin tool, bug). This is
   defense-in-depth, not the primary UX validation.

## Considered Options

- Boolean `isRemoved` + separate audit fields — rejected, the flag and the
  timestamp could disagree.
- `AttachmentStatus` enum — rejected, Lab 2 only ever has two states; an
  enum is more machinery than the fact needs.
