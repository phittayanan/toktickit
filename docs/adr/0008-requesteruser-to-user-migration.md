# RequesterUser becomes User by renaming in place, with no password

Status: accepted. Completes the schema-evolution note in
[ADR-0001](./0001-requesteruser-temporary-auth.md).

Lab 3 needs one `User` model with a role and credentials. The Lab 2
`RequesterUser` table is **renamed** to `User`, keeping every primary key,
rather than copied into a new table.

- `ALTER TABLE "RequesterUser" RENAME TO "User"`, then add `role`
  (default `REQUESTER`), `passwordHash` (nullable), `mustChangePassword`
  (default `true`), and `updatedAt`.
- Every existing row therefore becomes a User with role Requester and the
  same `id`. `Ticket.requesterId`, `Attachment.uploadedByRequesterId`, and
  `Attachment.removedByRequesterId` keep their values and their column
  names; only the foreign-key target is renamed. No Ticket or Attachment
  row is rewritten, so ownership cannot drift.
- Existing emails are lower-cased in the same migration. If two rows differ
  only by case the unique index fails and the migration aborts, which is
  the wanted outcome.
- The migration SQL is written by hand. The diff Prisma generates for a
  model rename is drop-and-create, which would discard the rows.

## Migrated accounts have no password

A migrated Requester gets `passwordHash = NULL`. Login treats that as a
failed login with the generic message, so the account cannot be used until
an Administrator sets an initial password (which is generated, shown once,
and must be changed at first login). No password and no hash appears in any
migration file.

The idempotent seed is the one other place a password is set: for seed
accounts whose `passwordHash` is still `NULL` it stores a hash of the
documented local-development initial password and leaves
`mustChangePassword = true`. The hash is computed when the seed runs. An
account whose password has since been changed is not touched.

Hard to reverse once real passwords and sessions hang off these rows.
Real trade-off: migrated Requesters are locked out until an Administrator
acts, in exchange for never shipping a shared credential in a migration.

## Removing the selector

`GET /api/requesters`, the `requireRequester` middleware, the
`RequesterSelector` screen, the Requester context and store, and the
`toktickit.requester` `localStorage` key are all deleted. The client clears
that key on start so stale Lab 2 state cannot linger.

## Considered Options

- New `User` table plus a data copy and foreign-key repoint — rejected:
  more moving parts, and a window where two identity tables disagree.
- Keep `RequesterUser` and add a separate staff table — rejected: one
  permitted role per user is simplest as one table with one role column,
  and a role change would otherwise move a person between tables.
- Migration embeds one shared initial password hash — rejected: a
  credential in source control, and the same password on every account.
- Rename the three `...RequesterId` columns to `...UserId` — rejected:
  changes the Lab 2 JSON shapes for no behavioural gain; in Lab 3 only a
  Requester creates Tickets or adds and removes Attachments, so the names
  stay accurate.
